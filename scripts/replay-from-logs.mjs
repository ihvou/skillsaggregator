#!/usr/bin/env node
/**
 * Rebuild the local catalog from `.collection/logs/nightly-*.log` after a wipe.
 *
 * Parses every `candidate_scored` event (R20 persisted them all), keeps the
 * highest-confidence scoring per `(video_id, skill_slug)` pair, plus every
 * `secondary_suggestion_submitted` event, and writes:
 *   - one `links` row per video_id (ON CONFLICT DO NOTHING)
 *   - one `link_skill_relations` row per (link, skill) pair, active=true
 *
 * Goes direct to Postgres via `docker exec ... psql` rather than through
 * `submit-suggestion` so it's idempotent and runs in seconds with no LLM /
 * YouTube calls. Re-runs are safe (ON CONFLICT DO NOTHING + UPSERT semantics).
 *
 * Quality threshold: relevance >= 0.6 AND teaching_quality >= 0.6 (matches
 * the original agent's auto-approve floor). Secondary attaches keep their
 * own >= 0.6 relevance gate.
 *
 * Usage:
 *   node scripts/replay-from-logs.mjs                  # replay all nightly logs
 *   node scripts/replay-from-logs.mjs --dry            # parse + summary, no DB writes
 *   node scripts/replay-from-logs.mjs --since=2026-05-14  # only files after date
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const LOGS_DIR = ".collection/logs";
const PG_CONTAINER = "supabase_db_skillsaggregator";
const QUALITY_FLOOR = 0.6;

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry");
const sinceArg = [...args].find((a) => a.startsWith("--since="))?.split("=")[1];

function execPsql(sql) {
  return new Promise((resolve, reject) => {
    const p = spawn(
      "docker",
      ["exec", "-i", PG_CONTAINER, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (chunk) => (stdout += chunk));
    p.stderr.on("data", (chunk) => (stderr += chunk));
    p.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`psql exit ${code}: ${stderr}`));
    });
    p.stdin.write(sql);
    p.stdin.end();
  });
}

function sqlString(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function parseLogs() {
  if (!fs.existsSync(LOGS_DIR)) {
    console.error(`Logs dir ${LOGS_DIR} not found`);
    process.exit(2);
  }
  const files = fs
    .readdirSync(LOGS_DIR)
    .filter((f) => f.startsWith("nightly-") && f.endsWith(".log"))
    .filter((f) => !sinceArg || f >= `nightly-${sinceArg.replace(/-/g, "")}`)
    .sort();

  if (!files.length) {
    console.error("No nightly log files matched");
    process.exit(2);
  }

  // Key = `${video_id}:${skill_slug}` → best-scoring observation we've seen
  const candidates = new Map();

  for (const file of files) {
    const fullPath = path.join(LOGS_DIR, file);
    const content = fs.readFileSync(fullPath, "utf-8");
    let currentSkill = null;
    for (const line of content.split("\n")) {
      if (!line.startsWith("{")) continue;
      let evt;
      try { evt = JSON.parse(line); } catch { continue; }

      if (evt.event === "skill_run_started" && evt.skill) {
        currentSkill = evt.skill;
        continue;
      }

      if (evt.event === "candidate_scored" && currentSkill && evt.video_id) {
        if (typeof evt.relevance !== "number" || typeof evt.teaching_quality !== "number") continue;
        if (evt.relevance < QUALITY_FLOOR || evt.teaching_quality < QUALITY_FLOOR) continue;
        const key = `${evt.video_id}:${currentSkill}`;
        const existing = candidates.get(key);
        const score = evt.relevance + evt.teaching_quality;
        if (!existing || score > existing.score) {
          candidates.set(key, {
            kind: "primary",
            score,
            video_id: evt.video_id,
            skill_slug: currentSkill,
            title: evt.title,
            relevance: evt.relevance,
            teaching_quality: evt.teaching_quality,
            skill_level: evt.skill_level ?? null,
          });
        }
        continue;
      }

      if (evt.event === "secondary_suggestion_submitted" && evt.video_id && evt.secondary_skill) {
        if (typeof evt.relevance === "number" && evt.relevance < QUALITY_FLOOR) continue;
        const key = `${evt.video_id}:${evt.secondary_skill}`;
        if (candidates.has(key)) continue;
        candidates.set(key, {
          kind: "secondary",
          score: evt.relevance ?? QUALITY_FLOOR,
          video_id: evt.video_id,
          skill_slug: evt.secondary_skill,
          title: null,
          relevance: evt.relevance ?? null,
          teaching_quality: null,
          skill_level: null,
        });
      }
    }
  }

  return [...candidates.values()];
}

async function loadSkillMap() {
  const json = await execPsql(
    `select coalesce(json_agg(json_build_object('slug', slug, 'id', id, 'category_id', category_id)), '[]'::json) from public.skills where is_active;`,
  );
  return new Map(JSON.parse(json).map((r) => [r.slug, r]));
}

function buildSql(candidates, skillMap) {
  const linksByVid = new Map();
  const relations = [];
  let skipped = 0;
  for (const c of candidates) {
    const skill = skillMap.get(c.skill_slug);
    if (!skill) {
      skipped += 1;
      continue;
    }
    const canonical = `https://www.youtube.com/watch?v=${c.video_id}`;
    if (!linksByVid.has(c.video_id)) {
      linksByVid.set(c.video_id, {
        video_id: c.video_id,
        canonical_url: canonical,
        title: c.title ?? `YouTube video ${c.video_id}`,
      });
    }
    const upvoteSeed = Math.max(0, Math.round((c.score ?? 1) * 5));
    relations.push({
      video_id: c.video_id,
      skill_id: skill.id,
      skill_level: c.skill_level,
      public_note: c.kind === "primary"
        ? `Replayed from agent logs (relevance=${c.relevance.toFixed(2)}, quality=${c.teaching_quality.toFixed(2)}).`
        : `Replayed secondary attach (relevance=${(c.relevance ?? 0).toFixed(2)}).`,
      upvote_count: upvoteSeed,
    });
  }

  if (linksByVid.size === 0) {
    return { sql: null, links: 0, relations: 0, skipped };
  }

  const linkValues = [...linksByVid.values()]
    .map((l) => `(
      ${sqlString(l.canonical_url)},
      ${sqlString(l.canonical_url)},
      'youtube.com',
      ${sqlString(l.title)},
      ${sqlString(`https://i.ytimg.com/vi/${l.video_id}/hqdefault.jpg`)},
      'video', 'en', true, 'fetched', now()
    )`)
    .join(",\n");

  const relValues = relations
    .map((r) => `(
      (select id from public.links where canonical_url = ${sqlString(`https://www.youtube.com/watch?v=${r.video_id}`)}),
      ${sqlString(r.skill_id)}::uuid,
      ${sqlString(r.public_note)},
      ${r.skill_level ? sqlString(r.skill_level) : "NULL"},
      ${r.upvote_count},
      true, now()
    )`)
    .join(",\n");

  const sql = `
begin;
insert into public.links (url, canonical_url, domain, title, thumbnail_url, content_type, language, is_active, preview_status, fetched_at)
values ${linkValues}
on conflict (canonical_url) do nothing;

insert into public.link_skill_relations (link_id, skill_id, public_note, skill_level, upvote_count, is_active, last_checked_at)
select * from (values
${relValues}
) v(link_id, skill_id, public_note, skill_level, upvote_count, is_active, last_checked_at)
where v.link_id is not null
on conflict (link_id, skill_id) do nothing;
commit;

select 'links_total' tbl, count(*) from public.links where is_active
union all select 'relations_total', count(*) from public.link_skill_relations where is_active;
`;

  return { sql, links: linksByVid.size, relations: relations.length, skipped };
}

async function main() {
  const candidates = parseLogs();
  console.log(`parsed ${candidates.length} candidate observations from log files`);
  const skillMap = await loadSkillMap();
  console.log(`loaded ${skillMap.size} active skills from DB`);

  const { sql, links, relations, skipped } = buildSql(candidates, skillMap);
  console.log(`prepared ${links} unique links + ${relations} link_skill_relations (skipped ${skipped} candidates with unknown skill slug)`);

  if (dryRun) {
    console.log("dry-run: not writing to DB. Sample SQL preview (first 800 chars):");
    console.log(sql?.slice(0, 800) ?? "(no SQL)");
    return;
  }

  if (!sql) {
    console.log("nothing to insert");
    return;
  }

  const result = await execPsql(sql);
  console.log("\n=== Post-replay DB state ===");
  console.log(result);
}

main().catch((error) => {
  console.error("replay failed:", error.message);
  process.exit(1);
});
