#!/usr/bin/env node
// Content operations reports, rebuilt from scratch on every run.
//
//   1. content-ops.md      - rows are dates, columns are pipeline stages
//                            (collected / channel / open search / tiktok /
//                             no-transcript / ingested / scored / published)
//   2. skill-coverage.csv  - rows are dates, one column per category+skill,
//                            cells are cumulative link counts to that date
//      skill-coverage.md   - the same data transposed and trimmed to the
//                            recent window, so it stays readable in git
//
// Everything is derived, never appended, so a missed day self-heals on the
// next run. The only non-DB input is the no-transcript count, which the
// collector logs but never persists; those per-night counts are cached in
// .log-stats.json so old logs are parsed once rather than on every run.
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile, readdir } from "node:fs/promises";
import { createInterface } from "node:readline";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileP = promisify(execFile);
const fieldSep = "";

function arg(name, fallback = null) {
  const eq = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(eq));
  if (found) return found.slice(eq.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) {
    return process.argv[index + 1];
  }
  return fallback;
}

function supabaseRefFromUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    const suffix = ".supabase.co";
    return hostname.endsWith(suffix) ? hostname.slice(0, -suffix.length) : null;
  } catch (_error) {
    return null;
  }
}

function buildCollectDbUrlFromEnv() {
  if (process.env.COLLECT_DB_URL) return process.env.COLLECT_DB_URL;
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!password) return "";
  const projectRef = process.env.SUPABASE_PROJECT_REF
    ?? supabaseRefFromUrl(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  if (!projectRef) return "";
  const host = process.env.COLLECT_DB_POOLER_HOST ?? "aws-1-ap-southeast-2.pooler.supabase.com";
  const port = process.env.COLLECT_DB_POOLER_PORT ?? "5432";
  return `postgresql://postgres.${encodeURIComponent(projectRef)}:${encodeURIComponent(password)}@${host}:${port}/postgres`;
}

const config = {
  dbContainer: process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_skillsaggregator",
  collectDbUrl: buildCollectDbUrlFromEnv(),
  psqlBin: process.env.PSQL_BIN ?? "psql",
  dbTimeoutMs: Number(process.env.CONTENT_OPS_DB_TIMEOUT_MS ?? 120_000),
  // Collection runs 03:00-09:00 local, which straddles midnight UTC. Grouping by
  // local date keeps one night's work on one row instead of splitting it in two.
  reportTz: process.env.CONTENT_OPS_TZ ?? process.env.NIGHTLY_REPORT_TZ
    ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
  reportsDir: process.env.CONTENT_OPS_REPORT_DIR ?? join(root, ".collection", "reports"),
  logsDir: process.env.CONTENT_OPS_LOG_DIR ?? join(root, ".collection", "logs"),
  // Which relations report 2 counts. `published` is what is actually live on the
  // site; `active` is the whole collected catalog, most of which is still queued
  // behind the coaches.
  metric: arg("metric", "published"),
  // How many recent dates the transposed markdown keeps. The CSV always holds
  // the full history.
  mdDays: Number(arg("md-days", 14)),
  days: Number(arg("days", 0)),
};

if (!["active", "published"].includes(config.metric)) {
  throw new Error(`--metric must be "active" or "published", got "${config.metric}"`);
}

function sqlValue(value) {
  if (value === null) return "null";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function dbRows(sql, params = []) {
  const expanded = params.reduce(
    (acc, value, index) => acc.replaceAll(`$${index + 1}`, sqlValue(value)),
    sql,
  );
  const command = config.collectDbUrl ? config.psqlBin : "docker";
  const args = config.collectDbUrl
    ? [config.collectDbUrl, "-X", "-A", "-t", "-F", fieldSep, "-c", expanded]
    : ["exec", "-i", config.dbContainer, "psql", "-U", "postgres", "-X", "-A", "-t", "-F", fieldSep, "-c", expanded];
  try {
    const { stdout } = await execFileP(command, args, {
      maxBuffer: 256 * 1024 * 1024,
      timeout: config.dbTimeoutMs,
    });
    return stdout.trim().split("\n").filter(Boolean).map((row) => row.split(fieldSep));
  } catch (error) {
    // psql echoes the whole connection string, password included, on failure.
    throw new Error(redact(error instanceof Error ? error.message : String(error)));
  }
}

function redact(text) {
  return String(text).replace(/postgres(?:ql)?:\/\/[^\s"']+/g, "postgresql://[redacted]");
}

const num = (value) => Number(value ?? 0) || 0;

// --- Report 1: pipeline stages by date ------------------------------------

// `source` in evidence_json is the submission pipeline; `discovery_source` is how
// the candidate was found. The latter was only added 2026-08-13, so earlier rows
// have no split and are reported as unattributed rather than guessed at.
const collectedSql = `
  select (s.created_at at time zone $1)::date::text,
         count(*)::text,
         count(*) filter (
           where s.evidence_json->>'discovery_source'
                 in ('channel_search', 'fresh_uploads', 'recent_uploads')
         )::text,
         count(*) filter (where s.evidence_json->>'discovery_source' = 'open_search')::text,
         count(*) filter (where s.evidence_json->>'source' = 'tiktok_local_collection')::text
  from public.suggestions s
  group by 1 order by 1`;

const ingestedSql = `
  select (created_at at time zone $1)::date::text, count(*)::text
  from public.link_skill_relations
  group by 1 order by 1`;

// A relation counts as scored on the day its *second* coach role voted, because
// that is when it becomes eligible for the publish gate.
const scoredSql = `
  select (t.second_at at time zone $1)::date::text, count(*)::text
  from (
    select link_skill_relation_id,
           max(created_at) as second_at,
           count(distinct coach_role) as roles
    from public.curator_votes
    group by 1
  ) t
  where t.roles >= 2
  group by 1 order by 1`;

const publishedSql = `
  select (published_at at time zone $1)::date::text, count(*)::text
  from public.link_skill_relations
  where published_at is not null
  group by 1 order by 1`;

// --- Report 2: per-skill catalog growth -----------------------------------

const skillsSql = `
  select c.slug || '/' || s.slug, c.name, s.name
  from public.skills s
  join public.categories c on c.id = s.category_id
  where s.is_active and c.is_active
  order by 1`;

// Each metric has to be dated by its own event. Bucketing published relations by
// created_at would credit them to the night they were collected, which is weeks
// before the coaches scored them and the gate made them visible.
const perSkillSql = (metric) => {
  const dateColumn = metric === "published" ? "lsr.published_at" : "lsr.created_at";
  const filter = metric === "published" ? "lsr.published" : "lsr.is_active";
  return `
  select c.slug || '/' || s.slug,
         (${dateColumn} at time zone $1)::date::text,
         count(*)::text
  from public.link_skill_relations lsr
  join public.skills s on s.id = lsr.skill_id
  join public.categories c on c.id = s.category_id
  where s.is_active and c.is_active and ${filter}
  group by 1, 2 order by 1, 2`;
};

// --- No-transcript counts, parsed out of the collector logs ---------------

function dateInTz(iso, timeZone) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  // en-CA renders as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

async function countNoTranscriptInLog(path, timeZone) {
  const dates = {};
  const stream = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of stream) {
    // Cheap pre-filter: the substring test skips JSON.parse for ~99% of lines.
    if (!line.includes("candidate_skipped_no_transcript")) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch (_error) {
      continue;
    }
    if (event.event !== "candidate_skipped_no_transcript") continue;
    const date = dateInTz(event.ts, timeZone);
    if (date) dates[date] = (dates[date] ?? 0) + 1;
  }
  return dates;
}

async function loadNoTranscriptCounts() {
  const cachePath = join(config.reportsDir, ".log-stats.json");
  let cache = { version: 1, tz: config.reportTz, files: {} };
  try {
    const parsed = JSON.parse(await readFile(cachePath, "utf8"));
    // A timezone change reshuffles every date bucket, so drop the cache.
    if (parsed?.version === 1 && parsed.tz === config.reportTz) cache = parsed;
  } catch (_error) {
    // No usable cache; parse everything once.
  }

  let names = [];
  try {
    names = (await readdir(config.logsDir))
      .filter((name) => name.startsWith("nightly-") && name.endsWith(".log"));
  } catch (_error) {
    return { counts: {}, parsed: 0, available: false };
  }

  let parsedNow = 0;
  const nextFiles = {};
  for (const name of names) {
    const path = join(config.logsDir, name);
    const info = await stat(path);
    const cached = cache.files[name];
    if (cached && cached.size === info.size && cached.mtimeMs === info.mtimeMs) {
      nextFiles[name] = cached;
      continue;
    }
    nextFiles[name] = {
      size: info.size,
      mtimeMs: info.mtimeMs,
      dates: await countNoTranscriptInLog(path, config.reportTz),
    };
    parsedNow += 1;
  }

  const counts = {};
  for (const entry of Object.values(nextFiles)) {
    for (const [date, value] of Object.entries(entry.dates)) {
      counts[date] = (counts[date] ?? 0) + value;
    }
  }

  await mkdir(config.reportsDir, { recursive: true });
  await writeFile(cachePath, JSON.stringify({ version: 1, tz: config.reportTz, files: nextFiles }));
  return { counts, parsed: parsedNow, available: true, logs: names.length };
}

// --- Rendering -------------------------------------------------------------

function mdTable(headers, rows, aligns = []) {
  const widths = headers.map((header, index) => Math.max(
    String(header).length,
    ...rows.map((row) => String(row[index] ?? "").length),
  ));
  const pad = (value, index) => (aligns[index] === "r"
    ? String(value ?? "").padStart(widths[index])
    : String(value ?? "").padEnd(widths[index]));
  const line = [
    `| ${headers.map(pad).join(" | ")} |`,
    `|${widths.map((width, index) => (aligns[index] === "r" ? `${"-".repeat(width + 1)}:` : `${"-".repeat(width + 2)}`)).join("|")}|`,
  ];
  for (const row of rows) line.push(`| ${row.map(pad).join(" | ")} |`);
  return line.join("\n");
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function renderReport1({ dates, collected, ingested, scored, published, noTranscript, logInfo, generatedAt }) {
  const rows = dates.map((date) => {
    const c = collected[date] ?? {};
    const attributed = num(c.channel) + num(c.open) + num(c.tiktok);
    const unattributed = Math.max(0, num(c.total) - attributed);
    return [
      date,
      num(c.total),
      num(c.channel) || (unattributed ? "-" : 0),
      num(c.open) || (unattributed ? "-" : 0),
      num(c.tiktok),
      logInfo.available ? (noTranscript[date] ?? 0) : "-",
      num(ingested[date]),
      num(scored[date]),
      num(published[date]),
    ];
  });

  const sum = (pick) => dates.reduce((acc, date) => acc + num(pick(date)), 0);
  const totals = [
    "**Total**",
    sum((d) => collected[d]?.total),
    sum((d) => collected[d]?.channel),
    sum((d) => collected[d]?.open),
    sum((d) => collected[d]?.tiktok),
    logInfo.available ? sum((d) => noTranscript[d]) : "-",
    sum((d) => ingested[d]),
    sum((d) => scored[d]),
    sum((d) => published[d]),
  ];

  const headers = [
    "Date", "Collected", "Channel", "Open search", "TikTok",
    "No transcript", "Ingested", "Scored", "Published",
  ];
  const aligns = ["l", "r", "r", "r", "r", "r", "r", "r", "r"];
  const ordered = [...rows].reverse();

  return [
    "# Content Operations Report",
    "",
    `Generated ${generatedAt} · timezone \`${config.reportTz}\` · newest first`,
    "",
    mdTable(headers, [totals, ...ordered], aligns),
    "",
    "## Column definitions",
    "",
    "- **Collected** — candidate suggestions created that day (what entered the system).",
    "- **Channel** — discovered via a trusted channel: `channel_search` or `fresh_uploads`.",
    "- **Open search** — discovered via whole-of-YouTube search (`open_search`).",
    "- **TikTok** — collected by the TikTok phase, which has no discovery split.",
    "- **No transcript** — candidates dropped for a missing or too-short transcript. These never",
    "  become suggestions, so they sit *outside* Collected rather than inside it.",
    "- **Ingested** — `link_skill_relations` rows created.",
    "- **Scored** — relations whose *second* coach role voted that day, i.e. became gate-eligible.",
    "- **Published** — relations whose `published_at` falls on that day.",
    "",
    "## Reading notes",
    "",
    "- `-` in Channel/Open search means the split was not recorded. The collector only began",
    "  persisting `evidence_json.discovery_source` on 2026-08-13; earlier nights are genuinely",
    "  unattributable and are left blank rather than estimated.",
    "- Dates are local collection nights, not UTC. A run starts 03:00 and ends ~09:00 local, which",
    "  straddles midnight UTC, so UTC grouping would split one night across two rows.",
    "- Collected, Ingested, Scored and Published are *not* a same-day funnel. Coach scoring runs",
    "  hourly in the cloud against a FIFO backlog, so a row's Scored and Published counts usually",
    "  refer to content collected days or weeks earlier.",
    "- The newest row is partial. The report regenerates after collection finishes (~09:00 local)",
    "  while coach scoring continues hourly all day, so today's Scored and Published keep rising",
    "  until tomorrow's run rewrites the row with its final values.",
    "- An all-zero row is a night collection did not run. Those are real outages, not missing data.",
    logInfo.available
      ? `- No-transcript counts parsed from ${logInfo.logs} collector logs (${logInfo.parsed} re-read this run).`
      : "- No-transcript counts unavailable: collector logs not found on this machine.",
    "",
  ].join("\n");
}

function renderReport2Csv({ dates, skillKeys, cumulative }) {
  // `total` sits up front so the catalog-wide curve is readable without building
  // a formula across 249 columns. Sub-skill columns are already sorted A-Z.
  const lines = [["date", "total", ...skillKeys].map(csvCell).join(",")];
  for (const date of dates) {
    const cells = skillKeys.map((key) => cumulative[key]?.[date] ?? 0);
    const total = cells.reduce((sum, value) => sum + value, 0);
    lines.push([date, total, ...cells].map(csvCell).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function renderReport2Md({ dates, skills, cumulative, generatedAt }) {
  const window = config.mdDays > 0 ? dates.slice(-config.mdDays) : dates;
  const latest = dates.at(-1);
  const first = window[0];
  const rows = skills
    .map((skill) => {
      const series = cumulative[skill.key] ?? {};
      const now = series[latest] ?? 0;
      const then = first ? (series[first] ?? 0) : 0;
      const delta = now - then;
      return {
        skill,
        now,
        delta,
        cells: window.map((date) => series[date] ?? 0),
      };
    })
    .sort((a, b) => a.skill.key.localeCompare(b.skill.key));

  // Catalog-wide row. With --metric published its Total must equal the Published
  // total in content-ops.md; they are the same relations counted two ways.
  const totals = {
    now: rows.reduce((sum, row) => sum + row.now, 0),
    delta: rows.reduce((sum, row) => sum + row.delta, 0),
    cells: window.map((_, index) => rows.reduce((sum, row) => sum + row.cells[index], 0)),
  };

  const headers = ["Category / sub-skill", "Total", `+${config.mdDays}d`, ...window.map((d) => d.slice(5))];
  const aligns = ["l", "r", "r", ...window.map(() => "r")];
  const body = [
    [`**All ${skills.length} sub-skills**`, totals.now, totals.delta ? `+${totals.delta}` : "0", ...totals.cells],
    ...rows.map((row) => [
      row.skill.key,
      row.now,
      row.delta ? `+${row.delta}` : "0",
      ...row.cells,
    ]),
  ];

  const empty = rows.filter((row) => row.now === 0);

  return [
    `# Catalog Coverage by Sub-skill (${config.metric})`,
    "",
    `Generated ${generatedAt} · timezone \`${config.reportTz}\` · ${skills.length} sub-skills`,
    "",
    `Cumulative **${config.metric}** link–sub-skill relations to each date, dated by`,
    config.metric === "published"
      ? "`published_at` — when the gate made each one visible, not when it was collected."
      : "`created_at` — when each one was collected, regardless of whether it is visible.",
    `Rows are sorted A–Z by category and sub-skill. Transposed and trimmed to the last`,
    `${config.mdDays} days so it stays readable; the full history in the specified orientation`,
    "(dates as rows, one column per sub-skill) is in `skill-coverage.csv`.",
    "",
    mdTable(headers, body, aligns),
    "",
    `## Sub-skills with no ${config.metric} content (${empty.length})`,
    "",
    empty.length ? empty.map((row) => `- ${row.skill.key}`).join("\n") : "None.",
    "",
  ].join("\n");
}

// --- Main ------------------------------------------------------------------

async function main() {
  const tz = config.reportTz;
  const [collectedRows, ingestedRows, scoredRows, publishedRows, skillRows, perSkillRows, logStats] =
    await Promise.all([
      dbRows(collectedSql, [tz]),
      dbRows(ingestedSql, [tz]),
      dbRows(scoredSql, [tz]),
      dbRows(publishedSql, [tz]),
      dbRows(skillsSql),
      dbRows(perSkillSql(config.metric), [tz]),
      loadNoTranscriptCounts(),
    ]);

  const collected = {};
  for (const [date, total, channel, open, tiktok] of collectedRows) {
    collected[date] = { total: num(total), channel: num(channel), open: num(open), tiktok: num(tiktok) };
  }
  const toMap = (rows) => Object.fromEntries(rows.map(([date, count]) => [date, num(count)]));
  const ingested = toMap(ingestedRows);
  const scored = toMap(scoredRows);
  const published = toMap(publishedRows);

  const skills = skillRows.map(([key, categoryName, skillName]) => ({ key, categoryName, skillName }));
  const skillKeys = skills.map((skill) => skill.key);

  // Every date any stage saw activity, then filled in so the series has no holes.
  const seen = new Set([
    ...Object.keys(collected), ...Object.keys(ingested), ...Object.keys(scored),
    ...Object.keys(published), ...Object.keys(logStats.counts), ...perSkillRows.map(([, date]) => date),
  ]);
  let dates = [...seen].filter(Boolean).sort();
  if (dates.length) {
    const filled = [];
    const cursor = new Date(`${dates[0]}T00:00:00Z`);
    const last = new Date(`${dates.at(-1)}T00:00:00Z`);
    while (cursor <= last) {
      filled.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    dates = filled;
  }
  const windowed = config.days > 0 ? dates.slice(-config.days) : dates;

  // Daily per-skill deltas accumulated forward into a running total.
  const daily = {};
  for (const [key, date, count] of perSkillRows) {
    (daily[key] ??= {})[date] = num(count);
  }
  const cumulative = {};
  for (const key of skillKeys) {
    const series = {};
    let running = 0;
    for (const date of dates) {
      running += daily[key]?.[date] ?? 0;
      series[date] = running;
    }
    cumulative[key] = series;
  }

  const generatedAt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: tz, dateStyle: "short", timeStyle: "short",
  }).format(new Date());

  await mkdir(config.reportsDir, { recursive: true });
  const report1 = renderReport1({
    dates: windowed, collected, ingested, scored, published,
    noTranscript: logStats.counts, logInfo: logStats, generatedAt,
  });
  const csv = renderReport2Csv({ dates, skillKeys, cumulative });
  const report2 = renderReport2Md({ dates, skills, cumulative, generatedAt });

  const paths = {
    ops: join(config.reportsDir, "content-ops.md"),
    csv: join(config.reportsDir, "skill-coverage.csv"),
    coverage: join(config.reportsDir, "skill-coverage.md"),
  };
  await Promise.all([
    writeFile(paths.ops, report1),
    writeFile(paths.csv, csv),
    writeFile(paths.coverage, report2),
  ]);

  console.log(`content-ops report: ${windowed.length} dates, ${skills.length} sub-skills`);
  for (const path of Object.values(paths)) console.log(`  wrote ${path}`);
}

main().catch((error) => {
  console.error(redact(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
