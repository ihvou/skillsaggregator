#!/usr/bin/env node
/**
 * Bulk-import researched YouTube channels into public.trusted_sources.
 *
 * Input is the CSV produced by the channel-research pass:
 *   category,identifier,display_name,source_type,is_active,last_upload,subs,confidence
 * where `identifier` is the UC… channel id and `category` is a categories.slug.
 *
 * Usage:
 *   node scripts/import-trusted-sources.mjs <csv>                  # dry run (default)
 *   node scripts/import-trusted-sources.mjs <csv> --apply
 *   node scripts/import-trusted-sources.mjs <csv> --apply --category padel
 *   node scripts/import-trusted-sources.mjs <csv> --apply --skip-dormant
 *
 * Dry run by default: prints exactly what would be inserted and every row it would
 * reject, and touches nothing. Re-runnable — the insert is an upsert on the existing
 * (source_type, identifier) unique constraint, so a partial run can just be repeated.
 *
 * NOTE: new channels are picked up automatically by the per-skill rotation added in
 * migration 0034 (no skill_source_searches row => sorts first for every skill), so
 * nothing else needs to be primed after this runs.
 */
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { loadEnvFile } from "./_lib/script-env.mjs";

const execFileP = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await loadEnvFile(resolve(root, ".env.hosted"));

const args = process.argv.slice(2);
const csvPath = args.find((a) => !a.startsWith("--"));
const apply = args.includes("--apply");
const skipDormant = args.includes("--skip-dormant");
const onlyCategory = args.includes("--category") ? args[args.indexOf("--category") + 1] : null;

if (!csvPath) {
  console.error("usage: node scripts/import-trusted-sources.mjs <csv> [--apply] [--category <slug>] [--skip-dormant]");
  process.exit(1);
}

const dbUrl = process.env.COLLECT_DB_URL;
if (!dbUrl) {
  console.error("COLLECT_DB_URL is not set (expected in .env.hosted).");
  process.exit(1);
}
const psqlBin = process.env.PSQL_BIN ?? "psql";

// Same shape as run-collection.mjs dbQuery: psql, unaligned, custom separator.
const SEP = "|||";
async function dbQuery(sql) {
  const { stdout } = await execFileP(psqlBin, [dbUrl, "-A", "-t", "-F", SEP, "-v", "ON_ERROR_STOP=1", "-c", sql], {
    maxBuffer: 32 * 1024 * 1024,
    timeout: 60_000,
  });
  return stdout.trim().split("\n").filter(Boolean).map((line) => line.split(SEP));
}
const lit = (v) => (v === null || v === undefined || v === "" ? "null" : `'${String(v).replaceAll("'", "''")}'`);

// discovery_score is on the same ~0-5 scale discover-sources.mjs uses (autoTrust 4.0,
// suggest 2.5). Mapping the research confidence tier onto it makes higher-confidence
// channels win the loadChannels() tiebreak when recency is equal.
const SCORE = { high: 4.5, medium: 3.5, low: 2.5 };

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    // display_name is the only quoted field and may contain commas.
    const out = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === "," && !inQ) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return Object.fromEntries(header.map((h, i) => [h, (out[i] ?? "").trim()]));
  });
}

const rows = parseCsv(readFileSync(csvPath, "utf8"));

const catRows = await dbQuery("select slug, id from public.categories;");
const catId = new Map(catRows.map(([slug, id]) => [slug, id]));

const existingRows = await dbQuery(
  "select identifier, display_name from public.trusted_sources where source_type = 'youtube_channel';",
);
const existing = new Map(existingRows.map(([identifier, name]) => [identifier, name]));

const ACTIVE_CUTOFF = "2026-02-12";
const accepted = [], rejected = [];

for (const r of rows) {
  const reject = (why) => rejected.push({ ...r, why });
  if (onlyCategory && r.category !== onlyCategory) continue;
  if (!/^UC[A-Za-z0-9_-]{22}$/.test(r.identifier)) { reject("identifier is not a UC… channel id"); continue; }
  if (!catId.has(r.category)) { reject(`unknown category slug "${r.category}"`); continue; }
  if (existing.has(r.identifier)) { reject(`already in trusted_sources as "${existing.get(r.identifier)}"`); continue; }
  const dormant = r.last_upload && r.last_upload < ACTIVE_CUTOFF;
  if (skipDormant && dormant) { reject(`dormant (last upload ${r.last_upload})`); continue; }
  accepted.push({ ...r, dormant, categoryId: catId.get(r.category) });
}

// trusted_sources is unique on (source_type, identifier), so a channel lives in exactly
// ONE category. The research pass judges each category independently, so a genuinely
// cross-domain channel (a physio covering both gym and running, say) can be accepted
// more than once. Collapse to a single row deterministically — highest confidence wins,
// then the better in-category rank as implied by CSV order — otherwise Postgres rejects
// the whole batch with "ON CONFLICT DO UPDATE cannot affect row a second time".
const RANK = { high: 0, medium: 1, low: 2 };
const collapsed = [];
const bestByIdentifier = new Map();
accepted.forEach((a, csvOrder) => {
  const prev = bestByIdentifier.get(a.identifier);
  if (!prev) { bestByIdentifier.set(a.identifier, { ...a, csvOrder }); return; }
  const better = (RANK[a.confidence] ?? 9) < (RANK[prev.confidence] ?? 9);
  if (better) {
    collapsed.push({ name: a.display_name, kept: a.category, dropped: prev.category });
    bestByIdentifier.set(a.identifier, { ...a, csvOrder });
  } else {
    collapsed.push({ name: a.display_name, kept: prev.category, dropped: a.category });
  }
});
const deduped = [...bestByIdentifier.values()].sort((x, y) => x.csvOrder - y.csvOrder);
if (collapsed.length) {
  console.log(`\ncross-category duplicates collapsed (${collapsed.length}) — one category per channel:`);
  for (const c of collapsed) console.log(`  ${c.name}: kept ${c.kept}, dropped ${c.dropped}`);
}
accepted.length = 0;
accepted.push(...deduped);

const byCat = {};
for (const a of accepted) byCat[a.category] = (byCat[a.category] ?? 0) + 1;

console.log(`csv rows: ${rows.length}`);
console.log(`to insert: ${accepted.length}  (${accepted.filter((a) => a.dormant).length} dormant)`);
console.log(`skipped:   ${rejected.length}`);
console.log(Object.entries(byCat).map(([c, n]) => `  ${c}: ${n}`).join("\n"));
if (rejected.length) {
  console.log("\nskipped rows:");
  for (const x of rejected) console.log(`  ${x.category}/${x.display_name || x.identifier} — ${x.why}`);
}

if (!apply) {
  console.log("\nDRY RUN — nothing written. Re-run with --apply to insert.");
  process.exit(0);
}
if (!accepted.length) {
  console.log("\nnothing to insert.");
  process.exit(0);
}

const values = accepted.map((a) => {
  const evidence = JSON.stringify({
    source: "channel-research-2026-08-12",
    confidence: a.confidence,
    last_upload: a.last_upload || null,
    subscribers: a.subs ? Number(a.subs) : null,
    dormant_at_import: a.dormant,
  });
  return `(
    'youtube_channel', ${lit(a.identifier)}, ${lit(a.display_name)}, ${lit(a.categoryId)}::uuid, true,
    'import', now(), ${SCORE[a.confidence] ?? 3.0}, ${lit(evidence)}::jsonb,
    ${a.last_upload ? `${lit(a.last_upload)}::timestamptz` : "null"}
  )`;
}).join(",\n");

const sql = `
insert into public.trusted_sources (
  source_type, identifier, display_name, category_id, is_active,
  origin_type, discovered_at, discovery_score, discovery_evidence_json, last_seen_activity_at
) values
${values}
on conflict (source_type, identifier) do update set
  display_name = excluded.display_name,
  category_id = coalesce(public.trusted_sources.category_id, excluded.category_id),
  discovery_score = greatest(coalesce(public.trusted_sources.discovery_score, 0), excluded.discovery_score),
  discovery_evidence_json = coalesce(public.trusted_sources.discovery_evidence_json, excluded.discovery_evidence_json),
  last_seen_activity_at = coalesce(excluded.last_seen_activity_at, public.trusted_sources.last_seen_activity_at)
returning identifier;
`;

const inserted = await dbQuery(sql);
// Count only well-formed channel ids: psql can emit an extra bare line around a
// multi-row RETURNING, which would otherwise inflate the reported total by one.
const writtenCount = inserted.filter(([id]) => /^UC[A-Za-z0-9_-]{22}$/.test(id ?? "")).length;
console.log(`\ninserted/updated: ${writtenCount} (expected ${accepted.length})`);

const totals = await dbQuery(`
  select c.slug, count(*)
  from public.trusted_sources ts join public.categories c on c.id = ts.category_id
  where ts.source_type = 'youtube_channel' and ts.is_active
  group by c.slug order by c.slug;`);
console.log("\nactive youtube channels per category now:");
for (const [slug, n] of totals) console.log(`  ${slug}: ${n}`);
