#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileP = promisify(execFile);
const fieldSep = "\u001f";

const config = {
  dbContainer: process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_skillsaggregator",
  dbTimeoutMs: Number(process.env.NIGHTLY_REPORT_DB_TIMEOUT_MS ?? 30_000),
  reportTz: process.env.NIGHTLY_REPORT_TZ ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
  reportsDir: process.env.NIGHTLY_REPORT_DIR ?? join(root, ".collection", "reports"),
};

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
  const { stdout } = await execFileP(
    "docker",
    ["exec", "-i", config.dbContainer, "psql", "-U", "postgres", "-A", "-t", "-F", fieldSep, "-c", expanded],
    { maxBuffer: 32 * 1024 * 1024, timeout: config.dbTimeoutMs },
  );
  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((row) => row.split(fieldSep));
}

async function one(sql, params = []) {
  const rows = await dbRows(sql, params);
  return rows[0] ?? null;
}

function countBy(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function formatCountMap(counts) {
  if (!counts.size) return "none";
  return [...counts.entries()]
    .sort(([a], [b]) => String(a).localeCompare(String(b)))
    .map(([key, count]) => `${key}: ${count}`)
    .join(", ");
}

function parseJson(value) {
  try {
    return value ? JSON.parse(value) : {};
  } catch (_error) {
    return {};
  }
}

function httpStatusFor(event) {
  const status = event.metadata.http_status;
  if (typeof status === "number") return String(status);
  const fromMessage = String(event.message).match(/\b(\d{3})\b/)?.[1];
  return fromMessage ?? "unknown";
}

function edgeRuntimeSignal(events, runs, submitStatusCounts) {
  const preflightDown = events.some((event) =>
    event.event_type === "preflight_failed" && event.message === "edge_runtime_down"
  );
  const circuitOpen = runs.some((run) => run.error_message === "circuit_open:edge_runtime_503");
  const submit503s = submitStatusCounts.get("503") ?? 0;
  if (!preflightDown && !circuitOpen && submit503s === 0) return null;
  const parts = [];
  if (preflightDown) parts.push("preflight edge_runtime_down");
  if (circuitOpen) parts.push("submit circuit opened");
  if (submit503s) parts.push(`${submit503s} submit 503 failure${submit503s === 1 ? "" : "s"}`);
  return parts.join("; ");
}

async function reportWindow() {
  const dateArg = arg("date");
  const date = dateArg ?? (await one(
    `select (started_at at time zone $1)::date::text
     from public.agent_runs
     where agent_type = 'link_searcher'
     order by started_at desc
     limit 1`,
    [config.reportTz],
  ))?.[0];

  if (!date) throw new Error("No link_searcher agent_runs found.");

  const [start, end] = await one(
    `select (($1::date)::timestamp at time zone $2)::text,
            ((($1::date + interval '1 day')::timestamp at time zone $2))::text`,
    [date, config.reportTz],
  );
  return { date, start, end };
}

async function loadRuns(start, end) {
  const rows = await dbRows(
    `select ar.id,
            ar.status,
            ar.suggestions_created::text,
            coalesce(ar.error_message, ''),
            ar.started_at::text,
            coalesce(ar.completed_at::text, ''),
            coalesce(s.slug, ''),
            coalesce(s.name, ''),
            coalesce(c.slug, '')
     from public.agent_runs ar
     left join public.skills s on ar.target_type = 'skill' and ar.target_id = s.id
     left join public.categories c on c.id = s.category_id
     where ar.agent_type = 'link_searcher'
       and ar.started_at >= $1::timestamptz
       and ar.started_at < $2::timestamptz
     order by ar.started_at`,
    [start, end],
  );
  return rows.map(([id, status, suggestionsCreated, errorMessage, startedAt, completedAt, skillSlug, skillName, categorySlug]) => ({
    id,
    status,
    suggestions_created: Number(suggestionsCreated),
    error_message: errorMessage || null,
    started_at: startedAt,
    completed_at: completedAt || null,
    skill_slug: skillSlug || null,
    skill_name: skillName || null,
    category_slug: categorySlug || null,
  }));
}

async function loadEvents(start, end) {
  const rows = await dbRows(
    `select e.event_type,
            e.level,
            e.message,
            e.metadata_json::text,
            e.created_at::text,
            e.run_id::text
     from public.agent_run_events e
     join public.agent_runs ar on ar.id = e.run_id
     where ar.agent_type = 'link_searcher'
       and ar.started_at >= $1::timestamptz
       and ar.started_at < $2::timestamptz
     order by e.created_at`,
    [start, end],
  );
  return rows.map(([eventType, level, message, metadata, createdAt, runId]) => ({
    event_type: eventType,
    level,
    message,
    metadata: parseJson(metadata),
    created_at: createdAt,
    run_id: runId,
  }));
}

async function loadSuggestionStatusCounts(start, end) {
  const rows = await dbRows(
    `select status::text, count(*)::text
     from public.suggestions
     where created_at >= $1::timestamptz
       and created_at < $2::timestamptz
     group by status
     order by status`,
    [start, end],
  );
  return new Map(rows.map(([status, count]) => [status, Number(count)]));
}

async function loadTopSkillDeltas(start, end) {
  const rows = await dbRows(
    `select c.slug,
            s.slug,
            s.name,
            count(distinct lsr.id)::text
     from public.link_skill_relations lsr
     join public.links l on l.id = lsr.link_id
     join public.skills s on s.id = lsr.skill_id
     join public.categories c on c.id = s.category_id
     where lsr.is_active
       and l.is_active
       and l.created_at >= $1::timestamptz
       and l.created_at < $2::timestamptz
     group by c.slug, s.slug, s.name
     order by count(distinct lsr.id) desc, c.slug, s.slug
     limit 5`,
    [start, end],
  );
  return rows.map(([categorySlug, skillSlug, skillName, count]) => ({
    category_slug: categorySlug,
    skill_slug: skillSlug,
    skill_name: skillName,
    count: Number(count),
  }));
}

function renderReport({ date, start, end, runs, events, suggestionStatusCounts, topSkillDeltas }) {
  const skillRuns = runs.filter((run) => run.skill_slug);
  const runStatusCounts = countBy(skillRuns, (run) => run.status);
  const scored = events.filter((event) => event.event_type === "candidate_scored").length;
  const submittedEvents = events.filter((event) =>
    event.event_type === "suggestion_submitted" || event.event_type === "secondary_suggestion_submitted"
  );
  const submitted = submittedEvents.filter((event) => event.metadata.duplicate !== true).length;
  const submitFailures = events.filter((event) =>
    event.event_type === "submit_failed" || event.event_type === "secondary_submit_failed"
  );
  const submitStatusCounts = countBy(submitFailures, httpStatusFor);
  const startedAt = runs[0]?.started_at ?? start;
  const endedAt = [...runs].reverse().find((run) => run.completed_at)?.completed_at ?? end;
  const signal = edgeRuntimeSignal(events, runs, submitStatusCounts);
  const approved = (suggestionStatusCounts.get("approved") ?? 0) + (suggestionStatusCounts.get("auto_approved") ?? 0);
  const rejected = suggestionStatusCounts.get("declined") ?? 0;

  const lines = [
    `# Nightly Collection Report - ${date}`,
    "",
    `Window (${config.reportTz}): ${start} -> ${end}`,
    `Observed run span: ${startedAt} -> ${endedAt}`,
    "",
    "## Skills",
    `Attempted: ${skillRuns.length}`,
    `Completed: ${runStatusCounts.get("completed") ?? 0}`,
    `Aborted: ${runStatusCounts.get("aborted") ?? 0}`,
    `Failed: ${runStatusCounts.get("failed") ?? 0}`,
    "",
    "## Candidates And Suggestions",
    `Candidates scored: ${scored}`,
    `Submitted: ${submitted}`,
    `Approved now: ${approved}`,
    `Rejected now: ${rejected}`,
    `Suggestion status mix: ${formatCountMap(suggestionStatusCounts)}`,
    "",
    "## Submit Failures",
    `Total: ${submitFailures.length}`,
    `By HTTP status: ${formatCountMap(submitStatusCounts)}`,
  ];

  if (signal) {
    lines.push("", "## Infra Signal", `EDGE RUNTIME DOWN: ${signal}`);
  }

  lines.push("", "## Top Approved Resource Delta");
  if (topSkillDeltas.length) {
    for (const [index, row] of topSkillDeltas.entries()) {
      lines.push(`${index + 1}. ${row.category_slug}/${row.skill_slug} (${row.skill_name}): +${row.count}`);
    }
  } else {
    lines.push("None");
  }

  const abortedOrFailed = skillRuns.filter((run) => run.status !== "completed");
  if (abortedOrFailed.length) {
    lines.push("", "## Aborted Or Failed Skills");
    for (const run of abortedOrFailed.slice(0, 10)) {
      lines.push(`- ${run.category_slug}/${run.skill_slug}: ${run.status}${run.error_message ? ` - ${run.error_message}` : ""}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const window = await reportWindow();
  const [runs, events, suggestionStatusCounts, topSkillDeltas] = await Promise.all([
    loadRuns(window.start, window.end),
    loadEvents(window.start, window.end),
    loadSuggestionStatusCounts(window.start, window.end),
    loadTopSkillDeltas(window.start, window.end),
  ]);
  const report = renderReport({ ...window, runs, events, suggestionStatusCounts, topSkillDeltas });
  process.stdout.write(report);

  if (!process.argv.includes("--no-write")) {
    await mkdir(config.reportsDir, { recursive: true });
    const reportPath = join(config.reportsDir, `${window.date}.md`);
    await writeFile(reportPath, report);
    console.error(`Report written to ${reportPath}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
