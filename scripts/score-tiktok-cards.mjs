#!/usr/bin/env node
/**
 * Score the POC's sweep outputs against the proposed engagement+authority rubric.
 *
 * Reads /tmp/tiktok-poc-*.json (produced by scripts/poc-tiktok-browser.mjs),
 * applies a layered scoring function deterministically (no LLM), and prints
 * accept/reject verdicts per card with a breakdown of which rules fired.
 *
 * Goal: see whether the rubric's verdicts match the qualitative read of the
 * data (high-engagement clickbait demoted, real-coach low-engagement content
 * surfaced) BEFORE we bake any of this into the production schema.
 *
 * Layered model:
 *   Layer 1 — hard reject (any rule trips => reject)
 *   Layer 2 — authority score (additive points; >= AUTHORITY_GATE accepts)
 *   Layer 3 — ranking score (orders the accepted set; does NOT gate)
 *   Layer 4 — LLM judge (NOT implemented here; this is the LLM's input set)
 *
 * Usage:
 *   node scripts/score-tiktok-cards.mjs
 *   node scripts/score-tiktok-cards.mjs --verbose
 *   node scripts/score-tiktok-cards.mjs /tmp/tiktok-poc-surfing-pop-up.json
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ===========================================================================
// TUNABLES — change these and re-run; no code edits required elsewhere.
// ===========================================================================

const AUTHORITY_GATE_DEFAULT = 3;  // Layer 2 threshold to clear the gate; per-vertical override below.

const HARD_LIMITS = {
  duration_min_s: 8,            // < this => almost certainly not content
  duration_max_s: 600,          // > this => multi-part / podcast clip
  caption_min_chars: 15,        // measured after stripping hashtags + emoji
  lf_pct_max: 5000,             // L/F% above this => viral spike / bot inflation
};

const BIO_CRED_KEYWORDS = /coach|academy|instructor|certified|master|trainer|teach|pro\b|coach\b|mentor|tutorial|tutor|lesson|school/i;
const BIO_SPAM_PATTERNS = /onlyfans|fansly|dm for course|use my code|crypto signals|forex signals|adult content/i;
const CAPTION_INSTRUCTIONAL = /\b(how to|step by step|tips?|common mistake|guide|tutorial|technique|drill|drills|fix|fundamentals?|basics?|beginner|advanced|breakdown|explained|learn|master|improve|mistakes?|form)\b/i;

// VERTICALS — aligned to actual seeded categories in supabase/migrations/.
// `topic_keywords` includes terminology drawn from each category's seeded
// sub-skill names so the Layer 1 topic check catches off-topic spillover.
const VERTICALS = {
  surfing:   {
    detect:           /surf|wave|pop[- ]?up|paddle|lineup|takeoff/i,
    topic_keywords:   /surf|wave|popup|pop-up|pop up|takeoff|paddle|paddling|lineup|stance|bottom[- ]?turn|cutback|duck[- ]?dive|turtle/i,
    duration_sweet:   [15, 45],
    followers_floor:  200,
    authority_gate:   2,   // sparse profile signals in this vertical — relaxed
  },
  badminton: {
    detect:           /badminton|smash|shuttle|forehand|backhand|drop[- ]?shot/i,
    topic_keywords:   /badminton|smash|clear|drop[- ]?shot|drive|lift|push|serve|footwork|doubles|singles|racket|shuttle|forehand|backhand|grip/i,
    duration_sweet:   [20, 75],
    followers_floor:  1000,
    authority_gate:   3,
  },
  padel:     {
    detect:           /padel|bandeja|vibora|continental[- ]?grip/i,
    topic_keywords:   /padel|volley|bandeja|vibora|glass|lob|net|groundstroke|forehand|backhand|continental|wrist[- ]?rotation/i,
    duration_sweet:   [20, 90],
    followers_floor:  500,
    authority_gate:   3,
  },
  yoga:      {
    detect:           /yoga|asana|pose|pranayama|namaskar|chaturanga|bakasana|warrior/i,
    topic_keywords:   /yoga|asana|pose|namaskar|salutation|dog|chaturanga|warrior|crow|bakasana|tree[- ]?pose|fold|bridge|wheel|backbend|pranayama|breath|hip[- ]?open/i,
    duration_sweet:   [20, 120],
    followers_floor:  500,
    authority_gate:   3,
  },
  // Default fallback — used when no vertical matches the query.
  generic:   {
    detect:           null,
    topic_keywords:   null,
    duration_sweet:   [20, 120],
    followers_floor:  1000,
    authority_gate:   3,
  },
};

const RANKING_WEIGHTS = {
  lf_pct_healthy:        2,   // L/F% in [10%, 500%] band
  duration_in_sweet:     2,   // duration inside vertical's sweet spot
  caption_instructional: 2,   // matches CAPTION_INSTRUCTIONAL pattern
  favorites_high:        1,   // favorites/likes ratio > 0.05
  comments_high:         1,   // comments/likes ratio > 0.005
};

// ===========================================================================
// helpers
// ===========================================================================

function detectVertical(query) {
  for (const [name, cfg] of Object.entries(VERTICALS)) {
    if (cfg.detect && cfg.detect.test(query)) return { name, cfg };
  }
  return { name: "generic", cfg: VERTICALS.generic };
}

function captionLengthNoHashtags(s) {
  if (!s) return 0;
  return s.replace(/#\S+/g, "").replace(/[\p{Extended_Pictographic}\s]/gu, "").length;
}

function lfPct(likes, followers) {
  if (!likes || !followers) return null;
  return (likes / followers) * 100;
}

// ===========================================================================
// Layer 1 — hard reject
// ===========================================================================
function hardReject(card, detail, profile, vcfg) {
  const reasons = [];

  // Duration — only applies when we have it (top-N had detail probes).
  const dur = detail?.duration_seconds;
  if (typeof dur === "number") {
    if (dur < HARD_LIMITS.duration_min_s) reasons.push(`duration_too_short(${dur}s)`);
    if (dur > HARD_LIMITS.duration_max_s) reasons.push(`duration_too_long(${dur}s)`);
  }

  // Caption length, excluding hashtags + emoji.
  const caption = detail?.caption || card.caption || "";
  const captionCore = captionLengthNoHashtags(caption);
  if (captionCore < HARD_LIMITS.caption_min_chars) {
    reasons.push(`caption_too_short(${captionCore}chars)`);
  }

  // Numeric-only handle = TikTok's seed/recommendation accounts.
  const handle = detail?.creator_handle || card.handle || "";
  if (/^\d+$/.test(handle)) reasons.push(`numeric_handle(${handle})`);

  // Viral spike / bot inflation.
  const likes = detail?.like_count ?? card.views_count;
  const followers = profile?.followers_count;
  const lf = lfPct(likes, followers);
  if (lf != null && lf > HARD_LIMITS.lf_pct_max) {
    reasons.push(`lf_pct_extreme(${Math.round(lf)}%)`);
  }

  // Bio spam patterns.
  const bio = profile?.bio || "";
  if (BIO_SPAM_PATTERNS.test(bio)) reasons.push(`bio_spam_pattern`);

  // TUNING 3 — topic check. Catches off-topic spillover (e.g. a Carrom creator
  // showing up under "chess" because the caption stuffed #chess as a hashtag).
  // Require the topic to appear in NON-HASHTAG caption text, OR handle, OR bio.
  if (vcfg.topic_keywords) {
    const captionNoHashtags = caption.replace(/#\S+/g, "");
    const topicMatched =
      vcfg.topic_keywords.test(captionNoHashtags) ||
      vcfg.topic_keywords.test(handle) ||
      vcfg.topic_keywords.test(bio);
    if (!topicMatched) reasons.push("topic_keyword_absent");
  }

  return reasons;
}

// ===========================================================================
// Layer 2 — authority score
// ===========================================================================
function authorityScore(profile, handle, caption, query, vcfg) {
  const breakdown = [];

  if (profile?.bio && BIO_CRED_KEYWORDS.test(profile.bio)) {
    breakdown.push({ label: "bio_credential_keyword", pts: 2 });
  }

  if (profile?.bio_link) {
    breakdown.push({ label: "bio_link_present", pts: 2 });

    // Bonus if bio link looks like a known authority surface.
    if (/(youtube\.com|youtu\.be|instagram\.com|twitch\.tv)/i.test(profile.bio_link)) {
      breakdown.push({ label: "bio_link_cross_platform", pts: 1 });
    }
  }

  if (vcfg.topic_keywords && vcfg.topic_keywords.test(handle || "")) {
    breakdown.push({ label: "handle_topic_match", pts: 1 });
  }

  if ((profile?.videos_count ?? 0) >= 20 && (profile?.following_count ?? 9999) < 500) {
    breakdown.push({ label: "creator_not_consumer", pts: 1 });
  }

  if ((profile?.followers_count ?? 0) >= vcfg.followers_floor) {
    breakdown.push({ label: `followers_above_floor(${vcfg.followers_floor})`, pts: 1 });
  }

  if (profile?.verified) {
    breakdown.push({ label: "verified_badge", pts: 2 });
  }

  // TUNING 1 — instructional caption pattern also counts as a soft authority
  // signal, not just a ranking bonus. Lifts content-only creators (e.g.
  // featherballer_) whose profile lacks credential keywords or bio_link but
  // whose captions consistently teach.
  if (caption && CAPTION_INSTRUCTIONAL.test(caption)) {
    breakdown.push({ label: "caption_instructional", pts: 1 });
  }

  const total = breakdown.reduce((a, b) => a + b.pts, 0);
  return { breakdown, total };
}

// ===========================================================================
// Layer 3 — ranking score (orders accepted set; never gates)
// ===========================================================================
function rankingScore(card, detail, profile, vcfg) {
  const breakdown = [];

  const likes = detail?.like_count ?? card.views_count;
  const followers = profile?.followers_count;
  const lf = lfPct(likes, followers);
  if (lf != null && lf >= 10 && lf <= 500) {
    breakdown.push({ label: "lf_pct_healthy", pts: RANKING_WEIGHTS.lf_pct_healthy });
  }

  const dur = detail?.duration_seconds;
  if (typeof dur === "number") {
    const [lo, hi] = vcfg.duration_sweet;
    if (dur >= lo && dur <= hi) {
      breakdown.push({ label: `duration_in_sweet(${lo}-${hi}s)`, pts: RANKING_WEIGHTS.duration_in_sweet });
    }
  }

  const caption = detail?.caption || card.caption || "";
  if (CAPTION_INSTRUCTIONAL.test(caption)) {
    breakdown.push({ label: "caption_instructional", pts: RANKING_WEIGHTS.caption_instructional });
  }

  if (detail?.favorite_count != null && detail?.like_count) {
    const ratio = detail.favorite_count / detail.like_count;
    if (ratio > 0.05) {
      breakdown.push({ label: `favorites_high(${(ratio * 100).toFixed(1)}%)`, pts: RANKING_WEIGHTS.favorites_high });
    }
  }
  if (detail?.comment_count != null && detail?.like_count) {
    const ratio = detail.comment_count / detail.like_count;
    if (ratio > 0.005) {
      breakdown.push({ label: `comments_high(${(ratio * 100).toFixed(2)}%)`, pts: RANKING_WEIGHTS.comments_high });
    }
  }

  const total = breakdown.reduce((a, b) => a + b.pts, 0);
  return { breakdown, total };
}

// ===========================================================================
// per-card pipeline
// ===========================================================================
function scoreCard(card, detail, profile, query, vcfg) {
  const hard = hardReject(card, detail, profile, vcfg);
  if (hard.length) {
    return { verdict: "REJECT", layer: 1, reasons: hard };
  }
  const caption = detail?.caption || card.caption || "";
  const auth = authorityScore(profile, card.handle, caption, query, vcfg);
  const gate = vcfg.authority_gate ?? AUTHORITY_GATE_DEFAULT;
  if (auth.total < gate) {
    return {
      verdict: "REJECT",
      layer: 2,
      authority_total: auth.total,
      authority: auth.breakdown,
      gate,
    };
  }
  const rank = rankingScore(card, detail, profile, vcfg);
  return {
    verdict: "ACCEPT",
    authority_total: auth.total,
    authority: auth.breakdown,
    ranking_total: rank.total,
    ranking: rank.breakdown,
  };
}

// ===========================================================================
// runner — reads sweep outputs, prints per-query tables
// ===========================================================================
function runFile(path, verbose, acceptedOnly) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const query = raw.query;
  const vert  = detectVertical(query);
  const detailsByUrl = Object.fromEntries(raw.details.map((d) => [d.url, d]));
  const profilesByHandle = raw.creator_profiles ?? {};
  const cards = raw.search.cards;

  const rows = [];
  for (const card of cards) {
    const detail  = detailsByUrl[card.href] ?? null;
    const profile = profilesByHandle[card.handle] ?? null;
    const scored  = scoreCard(card, detail, profile, query, vert.cfg);
    const likes     = detail?.like_count ?? card.views_count ?? 0;
    const followers = profile?.followers_count ?? null;
    const lf        = lfPct(likes, followers);
    const dur       = detail?.duration_seconds ?? null;
    rows.push({ card, detail, profile, scored, likes, followers, lf, dur });
  }

  if (acceptedOnly) {
    const accepted = rows
      .filter((r) => r.scored.verdict === "ACCEPT")
      .sort((a, b) => {
        if ((b.scored.ranking_total || 0) !== (a.scored.ranking_total || 0)) {
          return (b.scored.ranking_total || 0) - (a.scored.ranking_total || 0);
        }
        if ((b.scored.authority_total || 0) !== (a.scored.authority_total || 0)) {
          return (b.scored.authority_total || 0) - (a.scored.authority_total || 0);
        }
        return (b.likes || 0) - (a.likes || 0);
      });

    console.log(`\n## ${query}  _(vertical: ${vert.name}, ${accepted.length}/${cards.length} accepted)_\n`);
    for (const [i, r] of accepted.entries()) {
      const cap = (r.detail?.caption || r.card.caption || "").replace(/\s+/g, " ").trim();
      const followers = r.followers != null ? r.followers.toLocaleString() : "?";
      const dur = r.dur != null ? `${Math.round(r.dur)}s` : "?";
      const bio = (r.profile?.bio || "").replace(/\s+/g, " ").trim();
      const bioLink = r.profile?.bio_link || "";
      console.log(`### ${i + 1}. @${r.card.handle}  _(rank ${r.scored.ranking_total}, auth ${r.scored.authority_total})_`);
      console.log(`- ${r.card.href}`);
      console.log(`- caption: ${cap}`);
      console.log(`- ${r.likes.toLocaleString()} likes · ${followers} followers · L/F ${r.lf != null ? r.lf.toFixed(1) + "%" : "?"} · duration ${dur}`);
      if (r.detail?.comment_count != null) {
        console.log(`- comments ${r.detail.comment_count.toLocaleString()} · shares ${r.detail.share_count?.toLocaleString() ?? "?"} · favorites ${r.detail.favorite_count?.toLocaleString() ?? "?"}`);
      }
      if (bio) console.log(`- bio: ${bio}`);
      if (bioLink) console.log(`- bio link: ${bioLink}`);
      console.log();
    }
    return { query, vertical: vert.name, rows };
  }

  // ---- regular (verdict-table) mode ----
  console.log(`\n${"=".repeat(78)}`);
  console.log(`Query: ${JSON.stringify(query)}    vertical: ${vert.name}    cards: ${cards.length}`);
  console.log("=".repeat(78));
  console.log(
    `${"verdict".padEnd(8)} ${"auth".padStart(4)} ${"rank".padStart(4)} ${"L/F%".padStart(6)} ${"dur".padStart(5)} ${"handle".padEnd(28)} caption (60ch)`
  );
  console.log("-".repeat(78));

  for (const r of rows) {
    const caption = (r.detail?.caption || r.card.caption || "").replace(/\s+/g, " ").slice(0, 60);
    const verdictStr = r.scored.verdict === "ACCEPT" ? "✓ ACCEPT" : "✗ REJECT";
    const authStr    = r.scored.authority_total != null ? String(r.scored.authority_total) : "  -";
    const rankStr    = r.scored.ranking_total != null ? String(r.scored.ranking_total) : "  -";
    const lfStr      = r.lf != null ? `${r.lf.toFixed(1)}` : "   - ";
    const durStr     = r.dur != null ? `${Math.round(r.dur)}s` : "  - ";

    console.log(
      `${verdictStr.padEnd(8)} ${authStr.padStart(4)} ${rankStr.padStart(4)} ${lfStr.padStart(6)} ${durStr.padStart(5)} ${r.card.handle.padEnd(28)} ${caption}`
    );

    if (verbose || r.scored.verdict === "REJECT") {
      if (r.scored.layer === 1) {
        console.log(`         L1 reasons: ${r.scored.reasons.join(", ")}`);
      } else if (r.scored.layer === 2) {
        const parts = r.scored.authority.map((b) => `${b.label}(+${b.pts})`).join(", ") || "(no points)";
        console.log(`         L2 auth=${r.scored.authority_total} < ${r.scored.gate}  [${parts}]`);
      } else if (verbose && r.scored.verdict === "ACCEPT") {
        const a = r.scored.authority.map((b) => `${b.label}(+${b.pts})`).join(", ");
        const rk = r.scored.ranking.map((b) => `${b.label}(+${b.pts})`).join(", ");
        console.log(`         L2 auth=${r.scored.authority_total}: [${a}]`);
        console.log(`         L3 rank=${r.scored.ranking_total}: [${rk || "(no points)"}]`);
      }
    }
  }

  const accepted = rows.filter((r) => r.scored.verdict === "ACCEPT");
  const rejected = rows.filter((r) => r.scored.verdict === "REJECT");
  console.log("-".repeat(78));
  console.log(`accepted: ${accepted.length}/${rows.length}    rejected: ${rejected.length}  (L1: ${rejected.filter((r) => r.scored.layer === 1).length}, L2: ${rejected.filter((r) => r.scored.layer === 2).length})`);

  return { query, vertical: vert.name, rows };
}

// ---------------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes("--verbose") || args.includes("-v");
  const acceptedOnly = args.includes("--accepted-only");
  const paths = args.filter((a) => !a.startsWith("-"));

  let files;
  if (paths.length) {
    files = paths.map((p) => resolve(p));
  } else {
    const dir = "/tmp";
    files = readdirSync(dir)
      .filter((f) => /^tiktok-poc-.+\.json$/.test(f))
      .map((f) => resolve(dir, f))
      .sort();
  }

  if (!files.length) {
    console.error("No /tmp/tiktok-poc-*.json files found. Run scripts/poc-tiktok-browser.mjs first.");
    process.exit(2);
  }

  const allRows = [];
  for (const f of files) {
    if (!existsSync(f)) { console.error(`skip (missing): ${f}`); continue; }
    const { rows } = runFile(f, verbose, acceptedOnly);
    allRows.push(...rows);
  }

  if (!acceptedOnly) {
    const acc = allRows.filter((r) => r.scored.verdict === "ACCEPT").length;
    const rejL1 = allRows.filter((r) => r.scored.verdict === "REJECT" && r.scored.layer === 1).length;
    const rejL2 = allRows.filter((r) => r.scored.verdict === "REJECT" && r.scored.layer === 2).length;
    console.log(`\n${"=".repeat(78)}`);
    console.log(`OVERALL: ${allRows.length} cards   accept=${acc}   reject_L1=${rejL1}   reject_L2=${rejL2}`);
    console.log(`Tunables: AUTHORITY_GATE_DEFAULT=${AUTHORITY_GATE_DEFAULT}  caption_min=${HARD_LIMITS.caption_min_chars}  duration=[${HARD_LIMITS.duration_min_s}, ${HARD_LIMITS.duration_max_s}]s`);
    console.log("=".repeat(78));
  }
}

main();
