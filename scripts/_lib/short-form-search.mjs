/**
 * Short-form discovery via a search engine, rather than by browsing TikTok and
 * Instagram directly.
 *
 * WHY NOT THE PLATFORMS. Instagram closed anonymous enumeration: a single
 * anonymous request to web_profile_info — the first one, to Instagram's own
 * account — returns 401, and browser-based enumeration degrades within tens of
 * requests to a login wall. TikTok tolerates browsing, but its CDP search is the
 * component that produced the blank-render bug, so moving to search removes a
 * fragility rather than working around it. Neither path touches an account.
 *
 * ONE QUERY, BOTH PLATFORMS. The `OR` filter works and the engine returns a
 * single page of ~10 results split between the domains by its own ranking. Two
 * queries would return more — but the goal is CONTENT DIVERSITY, a handful of
 * short clips per sub-skill so people who prefer them have something, not a
 * maximal harvest. One query is the right cost for that, and the platforms turn
 * out to be complementary anyway: climbing scores 5/10 on Instagram and 9/10 on
 * TikTok, table tennis doubles on TikTok.
 *
 * NO PRE-DOWNLOAD GATE. Deliberate. A result that ranks for
 * "muay thai teep technique" has already been filtered for relevance and
 * engagement by a system with far more signal than we have; re-filtering it on a
 * title string adds noise to a decision already made better upstream. Instagram
 * could not support a gate anyway — its meta tags carry no caption, only a
 * templated twitter:title.
 */
const BRAVE_ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

export const config = {
  apiKey: process.env.BRAVE_SEARCH_API_KEY ?? "",
  endpoint: process.env.BRAVE_SEARCH_ENDPOINT ?? BRAVE_ENDPOINT,
  timeoutMs: Number(process.env.COLLECT_SEARCH_TIMEOUT_MS ?? 20_000),
  // Brave's free tier is rate limited to roughly one query per second.
  queryGapMs: Number(process.env.COLLECT_SEARCH_QUERY_GAP_MS ?? 1_200),
  resultsPerQuery: Number(process.env.COLLECT_SEARCH_RESULTS ?? 20),
  maxPerSkill: Number(process.env.COLLECT_SHORTFORM_MAX_PER_SKILL ?? 5),
};

/**
 * Both platforms publish SEO landing pages that are not posts:
 * instagram.com/popular/<slug> and tiktok.com/discover/<slug>. They dominated
 * the weak queries in testing — 8 of 10 BJJ results and 6 of 7 for running shin
 * splints — so anything that is not a post URL is dropped rather than followed.
 */
const TIKTOK_VIDEO = /^https?:\/\/(?:www\.)?tiktok\.com\/@([A-Za-z0-9._-]+)\/video\/(\d+)/i;
const INSTAGRAM_POST = /^https?:\/\/(?:www\.)?instagram\.com\/(?:([A-Za-z0-9._]+)\/)?(?:reel|reels|p)\/([A-Za-z0-9_-]+)/i;

export function classifyResultUrl(rawUrl) {
  const url = String(rawUrl ?? "").split("?")[0];

  const tiktok = url.match(TIKTOK_VIDEO);
  if (tiktok) {
    return {
      platform: "tiktok",
      canonicalUrl: `https://www.tiktok.com/@${tiktok[1]}/video/${tiktok[2]}`,
      creatorHandle: tiktok[1],
      externalId: tiktok[2],
    };
  }

  const instagram = url.match(INSTAGRAM_POST);
  if (instagram) {
    return {
      platform: "instagram",
      // Normalise to the bare /reel/<code>/ form. The handle-qualified variant
      // addresses the same post, and keeping both would create duplicate links
      // — the catalogue already holds two rows for one reel that differ only by
      // a trailing slash.
      canonicalUrl: `https://www.instagram.com/reel/${instagram[2]}/`,
      creatorHandle: instagram[1] ?? null,
      externalId: instagram[2],
    };
  }

  return null;
}

/**
 * The category prefix is not optional. Without it "heel hook" returns BJJ leg
 * locks beside climbing, "chipping" returns a Wikipedia page about climbing, and
 * "tubeless tyre" returns motorcycles. run-collection.mjs already prefixes
 * category on open search for the same reason.
 */
export function shortFormQuery(skill) {
  const category = skill?.category_name ? `${skill.category_name} ` : "";
  return `${category}${skill.name} technique (site:tiktok.com OR site:instagram.com)`;
}

export function isSearchConfigured() {
  return Boolean(config.apiKey);
}

async function braveSearch(query) {
  if (!config.apiKey) throw new Error("BRAVE_SEARCH_API_KEY is not set");
  const url = new URL(config.endpoint);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(config.resultsPerQuery));

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "x-subscription-token": config.apiKey,
    },
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`brave search ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const body = await response.json();
  return Array.isArray(body?.web?.results) ? body.web.results : [];
}

/**
 * Candidates for one sub-skill. Returns at most `maxPerSkill` — the goal is a
 * handful of short clips per page, so stopping early keeps download,
 * transcription and coach time proportional to what is actually wanted.
 */
export async function discoverShortForm(skill, { log = () => {} } = {}) {
  const query = shortFormQuery(skill);
  const raw = await braveSearch(query);

  const seen = new Set();
  const candidates = [];
  let rejected = 0;

  for (const result of raw) {
    const classified = classifyResultUrl(result?.url);
    if (!classified) { rejected += 1; continue; }
    if (seen.has(classified.canonicalUrl)) continue;
    seen.add(classified.canonicalUrl);

    candidates.push({
      ...classified,
      // Brave returns the page description, which for TikTok is the full
      // caption and for Instagram a templated title. Kept as submission
      // metadata, NOT used to filter — see the header.
      title: String(result?.title ?? "").trim().slice(0, 180),
      description: String(result?.description ?? "").trim().slice(0, 600) || null,
    });
    if (candidates.length >= config.maxPerSkill) break;
  }

  log("info", "shortform_search_completed", "Short-form search for skill", {
    skill: skill?.slug ?? null,
    query,
    returned: raw.length,
    accepted: candidates.length,
    rejected_non_post: rejected,
    tiktok: candidates.filter((c) => c.platform === "tiktok").length,
    instagram: candidates.filter((c) => c.platform === "instagram").length,
  });

  return candidates;
}
