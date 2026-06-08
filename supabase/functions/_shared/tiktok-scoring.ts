export type TikTokCandidate = {
  href?: string | null;
  url?: string | null;
  handle?: string | null;
  creator_handle?: string | null;
  creator_url?: string | null;
  caption?: string | null;
  views_count?: number | null;
  duration_seconds?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
  share_count?: number | null;
  favorite_count?: number | null;
  thumbnail_url?: string | null;
  thumbnail_dynamic_url?: string | null;
};

export type CreatorProfile = {
  handle?: string | null;
  bio?: string | null;
  bio_link?: string | null;
  followers_count?: number | null;
  following_count?: number | null;
  videos_count?: number | null;
  verified?: boolean | null;
};

type ScoreBreakdown = { label: string; pts: number };

export type ScoreVerdict =
  | {
      verdict: "REJECT";
      vertical: string;
      layer: 1;
      reasons: string[];
    }
  | {
      verdict: "REJECT";
      vertical: string;
      layer: 2;
      authority_total: number;
      authority: ScoreBreakdown[];
      gate: number;
    }
  | {
      verdict: "ACCEPT";
      vertical: string;
      authority_total: number;
      authority: ScoreBreakdown[];
      ranking_total: number;
      ranking: ScoreBreakdown[];
      llm_judge: "todo";
    };

export const AUTHORITY_GATE_DEFAULT = 3;

export const HARD_LIMITS = {
  duration_min_s: 8,
  duration_max_s: 600,
  caption_min_chars: 15,
  lf_pct_max: 5000,
};

const BIO_CRED_KEYWORDS = /coach|academy|instructor|certified|master|trainer|teach|pro\b|coach\b|mentor|tutorial|tutor|lesson|school/i;
const BIO_SPAM_PATTERNS = /onlyfans|fansly|dm for course|use my code|crypto signals|forex signals|adult content/i;
const CAPTION_INSTRUCTIONAL = /\b(how to|step by step|tips?|common mistake|guide|tutorial|technique|drill|drills|fix|fundamentals?|basics?|beginner|advanced|breakdown|explained|learn|master|improve|mistakes?|form)\b/i;

type VerticalConfig = {
  detect: RegExp | null;
  topic_keywords: RegExp | null;
  duration_sweet: [number, number];
  followers_floor: number;
  authority_gate: number;
};

export const VERTICALS: Record<string, VerticalConfig> = {
  surfing: {
    detect: /surf|wave|pop[- ]?up|paddle|lineup|takeoff/i,
    topic_keywords: /surf|wave|popup|pop-up|pop up|takeoff|paddle|paddling|lineup|stance|bottom[- ]?turn|cutback|duck[- ]?dive|turtle/i,
    duration_sweet: [15, 45],
    followers_floor: 200,
    authority_gate: 2,
  },
  badminton: {
    detect: /badminton|smash|shuttle|forehand|backhand|drop[- ]?shot/i,
    topic_keywords: /badminton|smash|clear|drop[- ]?shot|drive|lift|push|serve|footwork|doubles|singles|racket|shuttle|forehand|backhand|grip/i,
    duration_sweet: [20, 75],
    followers_floor: 1000,
    authority_gate: 3,
  },
  padel: {
    detect: /padel|bandeja|vibora|continental[- ]?grip/i,
    topic_keywords: /padel|volley|bandeja|vibora|glass|lob|net|groundstroke|forehand|backhand|continental|wrist[- ]?rotation/i,
    duration_sweet: [20, 90],
    followers_floor: 500,
    authority_gate: 3,
  },
  yoga: {
    detect: /yoga|asana|pose|pranayama|namaskar|chaturanga|bakasana|warrior/i,
    topic_keywords: /yoga|asana|pose|namaskar|salutation|dog|chaturanga|warrior|crow|bakasana|tree[- ]?pose|fold|bridge|wheel|backbend|pranayama|breath|hip[- ]?open/i,
    duration_sweet: [20, 120],
    followers_floor: 500,
    authority_gate: 3,
  },
  generic: {
    detect: null,
    topic_keywords: null,
    duration_sweet: [20, 120],
    followers_floor: 1000,
    authority_gate: 3,
  },
};

const RANKING_WEIGHTS = {
  lf_pct_healthy: 2,
  duration_in_sweet: 2,
  caption_instructional: 2,
  favorites_high: 1,
  comments_high: 1,
};

export function detectVertical(query: string, categorySlug: string | null = null) {
  if (categorySlug && VERTICALS[categorySlug]) return { name: categorySlug, cfg: VERTICALS[categorySlug] };
  for (const [name, cfg] of Object.entries(VERTICALS)) {
    if (cfg.detect?.test(query)) return { name, cfg };
  }
  return { name: "generic", cfg: VERTICALS.generic };
}

function captionLengthNoHashtags(value: string | null | undefined) {
  if (!value) return 0;
  return value.replace(/#\S+/g, "").replace(/[\p{Extended_Pictographic}\s]/gu, "").length;
}

function lfPct(likes: number | null | undefined, followers: number | null | undefined) {
  if (likes == null || followers == null || followers <= 0) return null;
  return (likes / followers) * 100;
}

function hardReject(candidate: TikTokCandidate, profile: CreatorProfile | null, vcfg: VerticalConfig) {
  const reasons: string[] = [];
  const duration = candidate.duration_seconds;
  if (typeof duration === "number") {
    if (duration < HARD_LIMITS.duration_min_s) reasons.push(`duration_too_short(${duration}s)`);
    if (duration > HARD_LIMITS.duration_max_s) reasons.push(`duration_too_long(${duration}s)`);
  }

  const caption = candidate.caption || "";
  const captionCore = captionLengthNoHashtags(caption);
  if (captionCore < HARD_LIMITS.caption_min_chars) {
    reasons.push(`caption_too_short(${captionCore}chars)`);
  }

  const handle = candidate.creator_handle || candidate.handle || "";
  if (/^\d+$/.test(handle)) reasons.push(`numeric_handle(${handle})`);

  const likes = candidate.like_count ?? candidate.views_count;
  const followers = profile?.followers_count;
  const lf = lfPct(likes, followers);
  if (lf != null && lf > HARD_LIMITS.lf_pct_max) {
    reasons.push(`lf_pct_extreme(${Math.round(lf)}%)`);
  }

  const bio = profile?.bio || "";
  if (BIO_SPAM_PATTERNS.test(bio)) reasons.push("bio_spam_pattern");

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

function authorityScore(profile: CreatorProfile | null, handle: string, caption: string, vcfg: VerticalConfig) {
  const breakdown: ScoreBreakdown[] = [];
  if (profile?.bio && BIO_CRED_KEYWORDS.test(profile.bio)) {
    breakdown.push({ label: "bio_credential_keyword", pts: 2 });
  }
  if (profile?.bio_link) {
    breakdown.push({ label: "bio_link_present", pts: 2 });
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
  if (caption && CAPTION_INSTRUCTIONAL.test(caption)) {
    breakdown.push({ label: "caption_instructional", pts: 1 });
  }
  const total = breakdown.reduce((sum, item) => sum + item.pts, 0);
  return { breakdown, total };
}

function rankingScore(candidate: TikTokCandidate, profile: CreatorProfile | null, vcfg: VerticalConfig) {
  const breakdown: ScoreBreakdown[] = [];
  const likes = candidate.like_count ?? candidate.views_count;
  const followers = profile?.followers_count;
  const lf = lfPct(likes, followers);
  if (lf != null && lf >= 10 && lf <= 500) {
    breakdown.push({ label: "lf_pct_healthy", pts: RANKING_WEIGHTS.lf_pct_healthy });
  }

  const duration = candidate.duration_seconds;
  if (typeof duration === "number") {
    const [lo, hi] = vcfg.duration_sweet;
    if (duration >= lo && duration <= hi) {
      breakdown.push({ label: `duration_in_sweet(${lo}-${hi}s)`, pts: RANKING_WEIGHTS.duration_in_sweet });
    }
  }

  const caption = candidate.caption || "";
  if (CAPTION_INSTRUCTIONAL.test(caption)) {
    breakdown.push({ label: "caption_instructional", pts: RANKING_WEIGHTS.caption_instructional });
  }

  if (candidate.favorite_count != null && candidate.like_count != null && candidate.like_count > 0) {
    const ratio = candidate.favorite_count / candidate.like_count;
    if (ratio > 0.05) {
      breakdown.push({ label: `favorites_high(${(ratio * 100).toFixed(1)}%)`, pts: RANKING_WEIGHTS.favorites_high });
    }
  }
  if (candidate.comment_count != null && candidate.like_count != null && candidate.like_count > 0) {
    const ratio = candidate.comment_count / candidate.like_count;
    if (ratio > 0.005) {
      breakdown.push({ label: `comments_high(${(ratio * 100).toFixed(2)}%)`, pts: RANKING_WEIGHTS.comments_high });
    }
  }

  const total = breakdown.reduce((sum, item) => sum + item.pts, 0);
  return { breakdown, total };
}

export function scoreTikTokCandidate(
  candidate: TikTokCandidate,
  profile: CreatorProfile | null = null,
  options: { query?: string; categorySlug?: string | null } = {},
): ScoreVerdict {
  const vertical = detectVertical(options.query ?? "", options.categorySlug ?? null);
  const hard = hardReject(candidate, profile, vertical.cfg);
  if (hard.length) {
    return { verdict: "REJECT", vertical: vertical.name, layer: 1, reasons: hard };
  }

  const caption = candidate.caption || "";
  const handle = candidate.creator_handle || candidate.handle || "";
  const auth = authorityScore(profile, handle, caption, vertical.cfg);
  const gate = vertical.cfg.authority_gate ?? AUTHORITY_GATE_DEFAULT;
  if (auth.total < gate) {
    return {
      verdict: "REJECT",
      vertical: vertical.name,
      layer: 2,
      authority_total: auth.total,
      authority: auth.breakdown,
      gate,
    };
  }

  const rank = rankingScore(candidate, profile, vertical.cfg);
  return {
    verdict: "ACCEPT",
    vertical: vertical.name,
    authority_total: auth.total,
    authority: auth.breakdown,
    ranking_total: rank.total,
    ranking: rank.breakdown,
    // Layer 4 LLM judge intentionally remains a future narrowing pass.
    llm_judge: "todo",
  };
}
