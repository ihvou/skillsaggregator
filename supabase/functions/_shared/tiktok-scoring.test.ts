import { scoreTikTokCandidate, type CreatorProfile, type TikTokCandidate } from "./tiktok-scoring.ts";

const nodeScoring = await import("../../../scripts/_lib/tiktok-scoring.mjs");

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

type Fixture = {
  query: string;
  search: { cards: Array<Record<string, unknown>> };
  details: Array<Record<string, unknown>>;
  creator_profiles: Record<string, Record<string, unknown>>;
};

const fixtureNames = [
  "tiktok-poc-badminton-forehand-smash.json",
  "tiktok-poc-padel-volley.json",
  "tiktok-poc-surfing-pop-up.json",
  "tiktok-poc-yoga-crow-pose.json",
];

async function readFixture(name: string): Promise<Fixture> {
  const url = new URL(`../../../tests/fixtures/tiktok/${name}`, import.meta.url);
  return JSON.parse(await Deno.readTextFile(url));
}

function asCandidate(card: Record<string, unknown>, detail: Record<string, unknown> | null): TikTokCandidate {
  return {
    href: typeof card.href === "string" ? card.href : null,
    url: typeof detail?.url === "string" ? detail.url : typeof card.href === "string" ? card.href : null,
    handle: typeof card.handle === "string" ? card.handle : null,
    creator_handle: typeof detail?.creator_handle === "string"
      ? detail.creator_handle
      : typeof card.handle === "string"
        ? card.handle
        : null,
    creator_url: typeof detail?.creator_url === "string"
      ? detail.creator_url
      : typeof card.creator_url === "string"
        ? card.creator_url
        : null,
    caption: typeof detail?.caption === "string"
      ? detail.caption
      : typeof card.caption === "string"
        ? card.caption
        : null,
    views_count: typeof card.views_count === "number" ? card.views_count : null,
    duration_seconds: typeof detail?.duration_seconds === "number" ? detail.duration_seconds : null,
    like_count: typeof detail?.like_count === "number"
      ? detail.like_count
      : typeof card.views_count === "number"
        ? card.views_count
        : null,
    comment_count: typeof detail?.comment_count === "number" ? detail.comment_count : null,
    share_count: typeof detail?.share_count === "number" ? detail.share_count : null,
    favorite_count: typeof detail?.favorite_count === "number" ? detail.favorite_count : null,
  };
}

function asProfile(value: Record<string, unknown> | undefined): CreatorProfile | null {
  if (!value || typeof value.error === "string") return null;
  return {
    handle: typeof value.handle === "string" ? value.handle : null,
    bio: typeof value.bio === "string" ? value.bio : null,
    bio_link: typeof value.bio_link === "string" ? value.bio_link : null,
    followers_count: typeof value.followers_count === "number" ? value.followers_count : null,
    following_count: typeof value.following_count === "number" ? value.following_count : null,
    videos_count: typeof value.videos_count === "number" ? value.videos_count : null,
    verified: typeof value.verified === "boolean" ? value.verified : null,
  };
}

Deno.test("TikTok engagement scorer preserves captured sweep acceptance rate", async () => {
  let total = 0;
  let accepted = 0;
  let rejectedLayer1 = 0;
  let rejectedLayer2 = 0;

  for (const name of fixtureNames) {
    const fixture = await readFixture(name);
    const detailsByUrl = new Map(fixture.details.map((detail) => [String(detail.url), detail]));
    let fixtureAccepted = 0;
    for (const card of fixture.search.cards) {
      const detail = detailsByUrl.get(String(card.href)) ?? null;
      const profile = asProfile(fixture.creator_profiles[String(card.handle)]);
      const verdict = scoreTikTokCandidate(asCandidate(card, detail), profile, { query: fixture.query });
      total += 1;
      if (verdict.verdict === "ACCEPT") {
        accepted += 1;
        fixtureAccepted += 1;
      } else if (verdict.layer === 1) {
        rejectedLayer1 += 1;
      } else {
        rejectedLayer2 += 1;
      }
    }
    assertEqual(fixtureAccepted, 11, `${fixture.query} accepted count`);
  }

  assertEqual(total, 48, "total cards");
  assertEqual(accepted, 44, "accepted cards");
  assertEqual(rejectedLayer1, 2, "layer 1 rejects");
  assertEqual(rejectedLayer2, 2, "layer 2 rejects");
});

Deno.test("TikTok scorer keeps known edge cases stable", async () => {
  const badminton = await readFixture("tiktok-poc-badminton-forehand-smash.json");
  const junAsmr = badminton.search.cards.find((card) => String(card.handle) === "junbadmintonacademy");
  if (!junAsmr) throw new Error("junbadmintonacademy fixture card missing");
  const junDetail = new Map(badminton.details.map((detail) => [String(detail.url), detail])).get(String(junAsmr.href)) ?? null;
  const junVerdict = scoreTikTokCandidate(
    asCandidate(junAsmr, junDetail),
    asProfile(badminton.creator_profiles[String(junAsmr.handle)]),
    { query: badminton.query },
  );
  if (junVerdict.verdict !== "REJECT" || junVerdict.layer !== 1) {
    throw new Error("junbadmintonacademy ASMR card should remain a layer-1 reject");
  }
  if (!junVerdict.reasons.includes("caption_too_short(0chars)")) {
    throw new Error(`unexpected junbadmintonacademy reasons: ${junVerdict.reasons.join(",")}`);
  }

  const surfing = await readFixture("tiktok-poc-surfing-pop-up.json");
  const surfSimply = surfing.search.cards.find((card) => String(card.handle) === "surfsimply");
  if (!surfSimply) throw new Error("surfsimply fixture card missing");
  const surfDetail = new Map(surfing.details.map((detail) => [String(detail.url), detail])).get(String(surfSimply.href)) ?? null;
  const surfVerdict = scoreTikTokCandidate(
    asCandidate(surfSimply, surfDetail),
    asProfile(surfing.creator_profiles[String(surfSimply.handle)]),
    { query: surfing.query },
  );
  assertEqual(surfVerdict.verdict, "ACCEPT", "surfsimply verdict");
  if (surfVerdict.verdict === "ACCEPT") {
    assertEqual(surfVerdict.authority_total, 4, "surfsimply authority");
    assertEqual(surfVerdict.ranking_total, 7, "surfsimply ranking");
  }
});

Deno.test("TikTok Node and Edge scorers stay in parity", async () => {
  for (const name of fixtureNames) {
    const fixture = await readFixture(name);
    const detailsByUrl = new Map(fixture.details.map((detail) => [String(detail.url), detail]));
    for (const card of fixture.search.cards) {
      const detail = detailsByUrl.get(String(card.href)) ?? null;
      const candidate = asCandidate(card, detail);
      const profile = asProfile(fixture.creator_profiles[String(card.handle)]);
      const options = { query: fixture.query };
      const edgeVerdict = scoreTikTokCandidate(candidate, profile, options);
      const nodeVerdict = nodeScoring.scoreTikTokCandidate(candidate, profile, options);
      if (JSON.stringify(edgeVerdict) !== JSON.stringify(nodeVerdict)) {
        throw new Error(
          `scorer drift for ${fixture.query} / ${String(card.handle)}: edge=${JSON.stringify(edgeVerdict)} node=${JSON.stringify(nodeVerdict)}`,
        );
      }
    }
  }
});
