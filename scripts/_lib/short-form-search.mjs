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
 * ONE QUERY, BOTH PLATFORMS — BUT THE SPLIT IS NOT OURS TO CONTROL. The `OR`
 * filter works, and combining was meant to halve the query cost. Measured
 * against Tavily it does not deliver both platforms: five sub-skills across five
 * categories returned 25 TikTok candidates and ZERO Instagram, because the
 * engine ranks TikTok higher for that phrasing and the per-skill cap then takes
 * the top N. Queried alone, the same skills return 15-19 Instagram posts, so
 * both platforms are indexed perfectly well — the combined query simply hides
 * one of them.
 *
 * Since the whole point is DIVERSITY — a handful of short clips per sub-skill so
 * people who prefer them have something — silently collecting one platform
 * defeats it. So the cap is applied PER PLATFORM and the combined query falls
 * back to a platform-specific one only for a platform that came back empty.
 * Typical cost stays near one query per sub-skill for balanced results and rises
 * to two only where it has to.
 *
 * NO PRE-DOWNLOAD GATE. Deliberate. A result that ranks for
 * "muay thai teep technique" has already been filtered for relevance and
 * engagement by a system with far more signal than we have; re-filtering it on a
 * title string adds noise to a decision already made better upstream. Instagram
 * could not support a gate anyway — its meta tags carry no caption, only a
 * templated twitter:title.
 *
 * PROVIDER-AGNOSTIC ON PURPOSE. The free-tier landscape moved under this work:
 * Brave withdrew its free tier in February 2026 (now $5/month metered, card
 * required) and Google's Custom Search JSON API closed to new customers. Rather
 * than bind to one vendor, the query and the result shape are ours and only the
 * transport differs. Set whichever key you have.
 *
 * BUDGET. Smaller than it first appears, because discovery here is seeding, not
 * a feed. Once a sub-skill has a few short clips it is done — the goal is
 * presence, not freshness. One pass over the whole catalogue is ~492 queries;
 * after that only new skills need one. Serper's 2,500 free queries cover the
 * initial pass five times over.
 */
import { setTimeout as delay } from "node:timers/promises";

const PROVIDERS = {
  serper: {
    env: "SERPER_API_KEY",
    endpoint: "https://google.serper.dev/search",
    async call(query, { apiKey, endpoint, count, timeoutMs }) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "X-API-KEY": apiKey, "content-type": "application/json" },
        body: JSON.stringify({ q: query, num: count }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`serper ${response.status}: ${(await response.text()).slice(0, 200)}`);
      const body = await response.json();
      return (body?.organic ?? []).map((r) => ({ url: r.link, title: r.title, description: r.snippet }));
    },
  },
  tavily: {
    env: "TAVILY_API_KEY",
    endpoint: "https://api.tavily.com/search",
    async call(query, { apiKey, endpoint, count, timeoutMs }) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ query, max_results: count }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`tavily ${response.status}: ${(await response.text()).slice(0, 200)}`);
      const body = await response.json();
      return (body?.results ?? []).map((r) => ({ url: r.url, title: r.title, description: r.content }));
    },
  },
  brave: {
    env: "BRAVE_SEARCH_API_KEY",
    endpoint: "https://api.search.brave.com/res/v1/web/search",
    async call(query, { apiKey, endpoint, count, timeoutMs }) {
      const url = new URL(endpoint);
      url.searchParams.set("q", query);
      url.searchParams.set("count", String(count));
      const response = await fetch(url, {
        headers: { accept: "application/json", "x-subscription-token": apiKey },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`brave ${response.status}: ${(await response.text()).slice(0, 200)}`);
      const body = await response.json();
      return (body?.web?.results ?? []).map((r) => ({ url: r.url, title: r.title, description: r.description }));
    },
  },
};

/** First provider with a key present, unless one is named explicitly. */
export function activeProvider() {
  const named = (process.env.COLLECT_SEARCH_PROVIDER ?? "").trim().toLowerCase();
  if (named) return PROVIDERS[named] ? { name: named, ...PROVIDERS[named] } : null;
  for (const [name, provider] of Object.entries(PROVIDERS)) {
    if (process.env[provider.env]) return { name, ...provider };
  }
  return null;
}

export const config = {
  timeoutMs: Number(process.env.COLLECT_SEARCH_TIMEOUT_MS ?? 20_000),
  // Free tiers rate limit to roughly one query per second.
  queryGapMs: Number(process.env.COLLECT_SEARCH_QUERY_GAP_MS ?? 1_200),
  resultsPerQuery: Number(process.env.COLLECT_SEARCH_RESULTS ?? 20),
  // Per platform, so one cannot crowd out the other. Total per skill is at
  // most twice this.
  maxPerPlatform: Number(process.env.COLLECT_SHORTFORM_MAX_PER_PLATFORM ?? 3),
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
export function shortFormQuery(skill, platform = null) {
  const category = skill?.category_name ? `${skill.category_name} ` : "";
  const site = platform === "tiktok"
    ? "site:tiktok.com"
    : platform === "instagram"
      ? "site:instagram.com"
      : "(site:tiktok.com OR site:instagram.com)";
  return `${category}${skill.name} technique ${site}`;
}

export function isSearchConfigured() {
  const provider = activeProvider();
  return Boolean(provider && process.env[provider.env]);
}

async function runSearch(query) {
  const provider = activeProvider();
  if (!provider) {
    throw new Error(
      `no search provider configured — set one of: ${Object.values(PROVIDERS).map((p) => p.env).join(", ")}`,
    );
  }
  const apiKey = process.env[provider.env];
  if (!apiKey) throw new Error(`${provider.env} is not set`);

  return provider.call(query, {
    apiKey,
    endpoint: process.env.COLLECT_SEARCH_ENDPOINT ?? provider.endpoint,
    count: config.resultsPerQuery,
    timeoutMs: config.timeoutMs,
  });
}

/**
 * Candidates for one sub-skill. Returns at most `maxPerSkill` — the goal is a
 * handful of short clips per page, so stopping early keeps download,
 * transcription and coach time proportional to what is actually wanted.
 */
export async function discoverShortForm(skill, { log = () => {} } = {}) {
  const seen = new Set();
  const perPlatform = { tiktok: [], instagram: [] };
  const queries = [];

  const absorb = (results) => {
    let rejected = 0;
    for (const result of results) {
      const classified = classifyResultUrl(result?.url);
      if (!classified) { rejected += 1; continue; }
      if (seen.has(classified.canonicalUrl)) continue;
      const bucket = perPlatform[classified.platform];
      // Cap PER PLATFORM, not overall: a shared cap lets whichever platform the
      // engine ranks higher consume every slot, which is exactly what produced
      // 25 TikTok and 0 Instagram before.
      if (!bucket || bucket.length >= config.maxPerPlatform) continue;
      seen.add(classified.canonicalUrl);
      bucket.push({
        ...classified,
        // The engine's description: for TikTok the full caption, for Instagram a
        // templated title. Kept as submission metadata, NOT used to filter.
        title: String(result?.title ?? "").trim().slice(0, 180),
        description: String(result?.description ?? "").trim().slice(0, 600) || null,
      });
    }
    return rejected;
  };

  // One query per platform, not a combined one.
  //
  // The combined `(site:a OR site:b)` query was meant to halve the cost, and it
  // does not: measured against Tavily it returned zero Instagram on five of five
  // sub-skills, so the per-platform fallback fired every time and the combined
  // result was discarded wholesale. That is two queries for the value of one.
  // Asking each platform directly costs the same two and returns a balanced set,
  // so the combined form is not worth keeping for this provider.
  //
  // COLLECT_SHORTFORM_PLATFORMS narrows this — set it to one platform to halve
  // the spend where only one is wanted.
  let rejectedNonPost = 0;
  const platforms = (process.env.COLLECT_SHORTFORM_PLATFORMS ?? "tiktok,instagram")
    .split(",").map((value) => value.trim()).filter(Boolean);

  for (const [index, platform] of platforms.entries()) {
    if (!perPlatform[platform]) continue;
    const query = shortFormQuery(skill, platform);
    queries.push(query);
    if (index > 0) await delay(config.queryGapMs);
    try {
      rejectedNonPost += absorb(await runSearch(query));
    } catch (error) {
      log("warn", "shortform_search_failed", String(error?.message ?? error), {
        skill: skill?.slug ?? null, platform,
      });
    }
  }

  const candidates = [...perPlatform.tiktok, ...perPlatform.instagram];
  log("info", "shortform_search_completed", "Short-form search for skill", {
    skill: skill?.slug ?? null,
    provider: activeProvider()?.name ?? null,
    queries: queries.length,
    accepted: candidates.length,
    rejected_non_post: rejectedNonPost,
    tiktok: perPlatform.tiktok.length,
    instagram: perPlatform.instagram.length,
  });

  return candidates;
}
