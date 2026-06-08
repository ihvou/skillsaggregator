#!/usr/bin/env node
/**
 * Build a seed migration from a deep-research catalog JSON.
 *
 * Pipeline:
 *   1. Parse the research JSON (new_categories / existing_skill_backfill /
 *      existing_category_new_sources).
 *   2. For every trusted_source, resolve its @handle (or URL) to a YouTube
 *      UC… channel ID via yt-dlp. The collector scrapes
 *      https://www.youtube.com/channel/<ID>/videos, which ONLY accepts UC… IDs,
 *      not handles — so this resolution is mandatory. A handle that won't
 *      resolve = unverifiable = dropped.
 *   3. Dedupe by channel ID; skip any channel already in public.trusted_sources.
 *   4. Map each surviving channel to a category and emit an idempotent
 *      seed migration (categories + skills + trusted_sources) plus a report.
 *
 * Usage:
 *   node scripts/build-catalog-seed.mjs <research.json> [out.sql]
 *
 * Reads existing DB state via `docker exec … psql` (same path as run-collection.mjs).
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const INPUT = process.argv[2];
if (!INPUT) {
  console.error("usage: node scripts/build-catalog-seed.mjs <research.json> [out.sql]");
  process.exit(2);
}

const YTDLP = ["/opt/homebrew/bin/yt-dlp", "/usr/local/bin/yt-dlp", join(ROOT, "bin", "yt-dlp")]
  .find((p) => existsSync(p)) ?? join(ROOT, "bin", "yt-dlp");
const COOKIES = process.env.COLLECT_YTDLP_COOKIES_FILE || join(ROOT, ".collection", "youtube-cookies.txt");
const HAS_COOKIES = existsSync(COOKIES);
const DB_CONTAINER = process.env.SUPABASE_DB_CONTAINER || "supabase_db_skillsaggregator";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sqlStr = (v) => (v === null || v === undefined ? "null" : `'${String(v).replaceAll("'", "''")}'`);
const UC_RE = /(UC[0-9A-Za-z_-]{22})/;

async function db(sql) {
  const { stdout } = await execFileP(
    "docker",
    ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-A", "-t", "-F", "\t", "-c", sql],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  return stdout.trim().split("\n").filter(Boolean).map((l) => l.split("\t"));
}

async function resolveUC(url, handle) {
  const direct = (url || "").match(/\/channel\/(UC[0-9A-Za-z_-]{22})/);
  if (direct) return direct[1];
  let target = url || (handle ? `https://www.youtube.com/${handle.startsWith("@") ? handle : "@" + handle}` : null);
  if (!target) return null;
  const args = ["--dump-single-json", "--flat-playlist", "--playlist-end", "1", "--no-warnings"];
  if (HAS_COOKIES) args.push("--cookies", COOKIES);
  args.push(target);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { stdout } = await execFileP(YTDLP, args, { maxBuffer: 64 * 1024 * 1024, timeout: 45000 });
      const d = JSON.parse(stdout);
      const id = d.channel_id || (d.channel_url || "").match(UC_RE)?.[1];
      if (id && /^UC[0-9A-Za-z_-]{22}$/.test(id)) return id;
      return null;
    } catch {
      if (attempt === 0) { await sleep(2500); continue; }
      return null;
    }
  }
  return null;
}

async function main() {
  let raw = readFileSync(INPUT, "utf8").trim();
  raw = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const data = JSON.parse(raw);

  // ---- existing DB state ----
  const existingIds = new Set((await db("select identifier from public.trusted_sources where source_type='youtube_channel'")).map((r) => r[0]));
  const existingCatSlugs = new Set((await db("select slug from public.categories")).map((r) => r[0]));
  const skillCat = new Map(
    (await db("select s.slug, c.slug from public.skills s join public.categories c on c.id = s.category_id")).map((r) => [r[0], r[1]]),
  );

  // ---- accumulate ----
  const categories = [];
  const skills = [];
  const channelRefs = new Map(); // key: url/handle/name -> { name, handle, url, catSlug }
  function addChannel(src, catSlug) {
    if (!src || (!src.url && !src.handle && !src.name)) return;
    const key = (src.url || src.handle || src.name).toLowerCase();
    if (!channelRefs.has(key)) channelRefs.set(key, { name: src.name, handle: src.handle, url: src.url, catSlug });
  }

  for (const cat of data.new_categories || []) {
    categories.push({ slug: cat.slug, name: cat.name, description: cat.description });
    for (const sk of cat.skills || []) skills.push({ catSlug: cat.slug, slug: sk.slug, name: sk.name, description: sk.description });
    for (const ch of cat.trusted_sources || []) addChannel(ch, cat.slug);
  }
  // explicit category placements take precedence over backfill skill mapping
  for (const entry of data.existing_category_new_sources || []) {
    for (const ch of entry.trusted_sources || []) addChannel(ch, entry.category_slug);
  }
  for (const entry of data.existing_skill_backfill || []) {
    const catSlug = skillCat.get(entry.skill_slug) || null;
    for (const ch of entry.trusted_sources || []) addChannel(ch, catSlug);
  }

  // ---- resolve ----
  const resolved = new Map(); // uc -> { name, catSlug }
  const failed = [];
  let i = 0;
  for (const ch of channelRefs.values()) {
    i += 1;
    process.stderr.write(`[${i}/${channelRefs.size}] ${ch.name} … `);
    const uc = await resolveUC(ch.url, ch.handle);
    if (!uc) {
      failed.push(ch.name);
      process.stderr.write("FAILED\n");
      await sleep(1000);
      continue;
    }
    if (!resolved.has(uc)) resolved.set(uc, { name: ch.name, catSlug: ch.catSlug });
    process.stderr.write(`${uc}${existingIds.has(uc) ? " (exists)" : ""}\n`);
    await sleep(1000);
  }

  // ---- partition ----
  const netNew = [];
  const skippedExisting = [];
  for (const [uc, v] of resolved) {
    if (existingIds.has(uc)) { skippedExisting.push(v.name); continue; }
    netNew.push({ identifier: uc, display_name: v.name, catSlug: v.catSlug });
  }
  netNew.sort((a, b) => (a.catSlug || "").localeCompare(b.catSlug || "") || a.display_name.localeCompare(b.display_name));

  // ---- build SQL ----
  const newCats = categories.filter((c) => !existingCatSlugs.has(c.slug));
  const lines = [];
  lines.push("-- Catalog expansion: 8 new categories + skills + net-new trusted YouTube channels.");
  lines.push(`-- Generated by scripts/build-catalog-seed.mjs from ${INPUT.split("/").pop()} on ${new Date().toISOString()}.`);
  lines.push("-- Channel handles resolved to UC… IDs via yt-dlp; unresolved/duplicate/already-present channels dropped.");
  lines.push("");
  lines.push("begin;");
  lines.push("");

  if (newCats.length) {
    lines.push("insert into public.categories (slug, name, description) values");
    lines.push(newCats.map((c) => `  (${sqlStr(c.slug)}, ${sqlStr(c.name)}, ${sqlStr(c.description)})`).join(",\n") + "");
    lines.push("on conflict (slug) do nothing;");
    lines.push("");
  }

  if (skills.length) {
    lines.push("insert into public.skills (category_id, slug, name, description)");
    lines.push("select c.id, v.slug, v.name, v.description");
    lines.push("from (values");
    lines.push(skills.map((s) => `  (${sqlStr(s.catSlug)}, ${sqlStr(s.slug)}, ${sqlStr(s.name)}, ${sqlStr(s.description)})`).join(",\n"));
    lines.push(") as v(cat_slug, slug, name, description)");
    lines.push("join public.categories c on c.slug = v.cat_slug");
    lines.push("on conflict (category_id, slug) do nothing;");
    lines.push("");
  }

  if (netNew.length) {
    lines.push("insert into public.trusted_sources (source_type, identifier, display_name, category_id)");
    lines.push("select 'youtube_channel', v.identifier, v.display_name,");
    lines.push("       (select id from public.categories where slug = v.cat_slug)");
    lines.push("from (values");
    lines.push(netNew.map((n) => `  (${sqlStr(n.identifier)}, ${sqlStr(n.display_name)}, ${sqlStr(n.catSlug)})`).join(",\n"));
    lines.push(") as v(identifier, display_name, cat_slug)");
    lines.push("on conflict (source_type, identifier) do nothing;");
    lines.push("");
  }

  lines.push("commit;");
  lines.push("");

  const migDir = join(ROOT, "supabase", "migrations");
  const nums = readdirSync(migDir).map((f) => parseInt(f.slice(0, 4), 10)).filter((n) => !Number.isNaN(n));
  const next = String(Math.max(0, ...nums) + 1).padStart(4, "0");
  const outPath = process.argv[3] || join(migDir, `${next}_catalog_expansion.sql`);
  writeFileSync(outPath, lines.join("\n"));

  // ---- report ----
  const report = [
    "===== CATALOG SEED BUILD REPORT =====",
    `input:                 ${INPUT}`,
    `migration written:     ${outPath}`,
    `cookies used:          ${HAS_COOKIES ? COOKIES : "(none)"}`,
    "",
    `new categories:        ${newCats.length}  (${newCats.map((c) => c.slug).join(", ")})`,
    `skills:                ${skills.length}`,
    `channel refs parsed:   ${channelRefs.size}`,
    `resolved to UC IDs:    ${resolved.size}`,
    `  → net-new inserted:  ${netNew.length}`,
    `  → already in DB:     ${skippedExisting.length}  (${skippedExisting.join(", ") || "—"})`,
    `failed to resolve:     ${failed.length}  (${failed.join(", ") || "—"})`,
    "",
    "net-new channels by category:",
    ...Object.entries(netNew.reduce((m, n) => { (m[n.catSlug || "(global)"] ??= []).push(n.display_name); return m; }, {}))
      .map(([cat, names]) => `  ${cat}: ${names.length} — ${names.join(", ")}`),
    "=====================================",
  ].join("\n");
  const reportPath = join(ROOT, ".collection", "catalog-seed-report.txt");
  try { writeFileSync(reportPath, report + "\n"); } catch { /* ignore */ }
  console.log(report);
}

main().catch((e) => { console.error(e?.stack || e?.message || e); process.exit(1); });
