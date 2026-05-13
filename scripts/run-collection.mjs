#!/usr/bin/env node
/**
 * Local content collection (free-tier, runs entirely on the developer's machine):
 *   1. yt-dlp lists recent uploads from each trusted YouTube channel for the target category
 *   2. yt-dlp downloads the auto-generated subtitle (transcript) for each candidate
 *   3. Ollama (qwen2.5:7b by default) scores the transcript via Stage 2 prompt with format=json
 *   4. Survivors POST to the local submit-suggestion Edge Function as `pending`
 *
 * Usage:
 *   node scripts/run-collection.mjs --skill <slug>
 *   node scripts/run-collection.mjs --category <slug> --all
 *   node scripts/run-collection.mjs --all
 *
 * Required env (or .env.local):
 *   SUPABASE_URL                  default http://127.0.0.1:54321
 *   SUPABASE_SERVICE_ROLE_KEY     local default printed by `supabase status`
 *   OLLAMA_URL                    default http://localhost:11434
 *   OLLAMA_MODEL                  default qwen2.5:7b
 *   YTDLP_BIN                     default ./bin/yt-dlp
 *   NODE_BIN_FOR_YTDLP            default $(which node) (yt-dlp uses it as JS runtime)
 *   STAGE2_RELEVANCE_THRESHOLD    default 0.7
 *   STAGE2_QUALITY_THRESHOLD      default 0.6
 *   COLLECT_MAX_VIDEOS_PER_CHANNEL default 25
 *   COLLECT_MIN_DURATION_SEC      default 60
 *   COLLECT_MAX_DURATION_SEC      default 2700  (45 min)
 *   COLLECT_MAX_VIDEO_AGE_DAYS    default 1825 (5 years)
 *   COLLECT_SECONDARY_RELEVANCE_THRESHOLD default 0.6
 *   COLLECT_MAX_SECONDARY_SKILLS   default 4
 *   COLLECT_TRANSCRIPT_TMP_DIR    default .collection/transcripts
 *   COLLECT_OUTPUT_DIR            default .collection/runs
 *   COLLECT_STOP_FILE             default .collection/STOP
 *   COLLECT_ABORT                 set to 1/true to fail fast before candidate work
 *   COLLECT_OLLAMA_TIMEOUT_MS     default 90000
 *   COLLECT_YTDLP_LIST_TIMEOUT_MS default 60000
 *   COLLECT_YTDLP_TRANSCRIPT_TIMEOUT_MS default 60000
 *   COLLECT_SUBMIT_TIMEOUT_MS     default 15000
 */
import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileP = promisify(execFile);

const config = {
  supabaseUrl: process.env.SUPABASE_URL ?? "http://127.0.0.1:54321",
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",
  ollamaModel: process.env.OLLAMA_MODEL ?? "qwen2.5:7b",
  ytdlpBin: process.env.YTDLP_BIN ?? join(root, "bin", "yt-dlp"),
  nodeBin: process.env.NODE_BIN_FOR_YTDLP ?? process.execPath,
  relevanceThreshold: Number(process.env.STAGE2_RELEVANCE_THRESHOLD ?? 0.7),
  qualityThreshold: Number(process.env.STAGE2_QUALITY_THRESHOLD ?? 0.6),
  maxVideosPerChannel: Number(process.env.COLLECT_MAX_VIDEOS_PER_CHANNEL ?? 25),
  minDurationSec: Number(process.env.COLLECT_MIN_DURATION_SEC ?? 60),
  maxDurationSec: Number(process.env.COLLECT_MAX_DURATION_SEC ?? 2700),
  maxVideoAgeDays: Number(process.env.COLLECT_MAX_VIDEO_AGE_DAYS ?? 1825),
  secondaryRelevanceThreshold: Number(process.env.COLLECT_SECONDARY_RELEVANCE_THRESHOLD ?? 0.6),
  maxSecondarySkills: Number(process.env.COLLECT_MAX_SECONDARY_SKILLS ?? 4),
  transcriptDir: process.env.COLLECT_TRANSCRIPT_TMP_DIR ?? join(root, ".collection", "transcripts"),
  outputDir: process.env.COLLECT_OUTPUT_DIR ?? join(root, ".collection", "runs"),
  ytdlpSleepRequests: Number(process.env.YTDLP_SLEEP_REQUESTS ?? 3),
  ytdlpSleepSubtitles: Number(process.env.YTDLP_SLEEP_SUBTITLES ?? 5),
  candidatesToScorePerSkill: Number(process.env.COLLECT_CANDIDATES_TO_SCORE ?? 30),
  searchResultsPerChannel: Number(process.env.COLLECT_SEARCH_RESULTS_PER_CHANNEL ?? 10),
  ytdlpListTimeoutMs: Number(process.env.COLLECT_YTDLP_LIST_TIMEOUT_MS ?? 60_000),
  ytdlpTranscriptTimeoutMs: Number(process.env.COLLECT_YTDLP_TRANSCRIPT_TIMEOUT_MS ?? 60_000),
  ollamaTimeoutMs: Number(process.env.COLLECT_OLLAMA_TIMEOUT_MS ?? 90_000),
  submitTimeoutMs: Number(process.env.COLLECT_SUBMIT_TIMEOUT_MS ?? 15_000),
  preflightTimeoutMs: Number(process.env.COLLECT_PREFLIGHT_TIMEOUT_MS ?? 15_000),
  dbQueryTimeoutMs: Number(process.env.COLLECT_DB_TIMEOUT_MS ?? 30_000),
  rateLimitWindowSize: Number(process.env.COLLECT_RATE_LIMIT_WINDOW_SIZE ?? 10),
  rateLimitThreshold: Number(process.env.COLLECT_RATE_LIMIT_THRESHOLD ?? 0.4),
  rateLimitConsecutiveSkillStop: Number(process.env.COLLECT_RATE_LIMIT_CONSECUTIVE_SKILLS ?? 2),
  stopFile: process.env.COLLECT_STOP_FILE ?? join(root, ".collection", "STOP"),
  skipSystemPressureCheck: process.env.COLLECT_SKIP_SYSTEM_PRESSURE === "1",
  systemPressurePauseMs: Number(process.env.COLLECT_SYSTEM_PRESSURE_PAUSE_MS ?? 60_000),
  freeMemoryAbortMb: Number(process.env.COLLECT_FREE_MEMORY_ABORT_MB ?? 100),
  systemCommandTimeoutMs: Number(process.env.COLLECT_SYSTEM_COMMAND_TIMEOUT_MS ?? 5_000),
  preflightChannelId: process.env.COLLECT_PREFLIGHT_CHANNEL_ID ?? "UCk2gRC4RewYvvXXqXZxaTbQ",
};

if (!config.serviceRoleKey) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is not set. Get it from `npx supabase status` and export it.");
  process.exit(1);
}
if (!existsSync(config.ytdlpBin)) {
  console.error(`yt-dlp binary not found at ${config.ytdlpBin}`);
  process.exit(1);
}

const sleep = (ms) => new Promise((resolveP) => setTimeout(resolveP, ms));
let activeRunId = null;
let activeRunState = null;
let runEventQueue = Promise.resolve();
let shuttingDown = false;

class SkillAbortError extends Error {
  constructor(code, message = code, metadata = {}) {
    super(message);
    this.name = "SkillAbortError";
    this.code = code;
    this.metadata = metadata;
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function enqueueAgentRunEvent(level, event, message, metadata) {
  if (!activeRunId) return;
  const runId = activeRunId;
  runEventQueue = runEventQueue
    .then(() => persistAgentRunEvent(runId, level, event, message, metadata))
    .catch((error) => {
      console.warn(JSON.stringify({
        run_id: runId,
        level: "warn",
        event: "agent_run_event_persist_failed",
        message: errorMessage(error),
        ts: new Date().toISOString(),
      }));
    });
}

async function flushAgentRunEvents() {
  await runEventQueue;
}

function log(level, event, message, metadata = {}) {
  const ts = new Date().toISOString();
  const line = JSON.stringify({ ...metadata, ts, level, event, message });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
  enqueueAgentRunEvent(level, event, message, { ...metadata, ts });
}

function arg(name, fallback = null) {
  const eq = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(eq));
  if (found) return found.slice(eq.length);
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) {
    return process.argv[i + 1];
  }
  return fallback;
}

const skillSlugFilter = arg("skill");
const categorySlugFilter = arg("category");
const runAll = process.argv.includes("--all");
if (!skillSlugFilter && !runAll) {
  console.error("Usage: node scripts/run-collection.mjs [--category <slug>] (--skill <slug> | --all)");
  process.exit(1);
}

async function dbQuery(sql, params = []) {
  // PostgREST RPC is awkward for arbitrary queries — we shell into docker exec psql.
  const sqlValue = (value) => {
    if (value === null) return "null";
    if (typeof value === "number" || typeof value === "bigint") return String(value);
    if (typeof value === "boolean") return value ? "true" : "false";
    return `'${String(value).replaceAll("'", "''")}'`;
  };
  const expanded = params.reduce(
    (acc, value, idx) => acc.replaceAll(`$${idx + 1}`, sqlValue(value)),
    sql,
  );
  const { stdout } = await execFileP(
    "docker",
    ["exec", "-i", "supabase_db_skillsaggregator", "psql", "-U", "postgres", "-A", "-t", "-F", "|||", "-c", expanded],
    { maxBuffer: 32 * 1024 * 1024, timeout: config.dbQueryTimeoutMs },
  );
  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((row) => row.split("|||"));
}

async function loadSkills(slug) {
  if (slug) {
    const params = categorySlugFilter ? [slug, categorySlugFilter] : [slug];
    const rows = await dbQuery(
      `select s.id, s.slug, s.name, coalesce(s.description, ''), s.category_id, c.slug
       from public.skills s join public.categories c on c.id = s.category_id
       where s.is_active and s.slug = $1
         ${categorySlugFilter ? "and c.slug = $2" : ""}`,
      params,
    );
    if (!rows.length) throw new Error(`Skill not found: ${slug}`);
    if (rows.length > 1) {
      throw new Error(`Skill slug "${slug}" exists in multiple categories; rerun with --category <slug>.`);
    }
    return rows.map(([id, slug, name, description, categoryId, categorySlug]) => ({
      id, slug, name, description, category_id: categoryId, category_slug: categorySlug,
    }));
  }
  const params = categorySlugFilter ? [categorySlugFilter] : [];
  const rows = await dbQuery(
    `select s.id, s.slug, s.name, coalesce(s.description, ''), s.category_id, c.slug
     from public.skills s join public.categories c on c.id = s.category_id
     where s.is_active
       ${categorySlugFilter ? "and c.slug = $1" : ""}
     order by c.slug, s.name`,
    params,
  );
  return rows.map(([id, slug, name, description, categoryId, categorySlug]) => ({
    id, slug, name, description, category_id: categoryId, category_slug: categorySlug,
  }));
}

async function loadCategorySkills(categoryId) {
  const rows = await dbQuery(
    `select s.id, s.slug, s.name, coalesce(s.description, ''), s.category_id, c.slug
     from public.skills s join public.categories c on c.id = s.category_id
     where s.is_active and s.category_id = $1
     order by s.name`,
    [categoryId],
  );
  return rows.map(([id, slug, name, description, categoryId, categorySlug]) => ({
    id, slug, name, description, category_id: categoryId, category_slug: categorySlug,
  }));
}

async function loadChannels(categoryId) {
  const rows = await dbQuery(
    `select identifier, display_name from public.trusted_sources
     where source_type = 'youtube_channel' and is_active
       and (category_id is null or category_id = $1)`,
    [categoryId],
  );
  return rows.map(([identifier, display_name]) => ({ identifier, display_name }));
}

async function persistAgentRunEvent(runId, level, eventType, message, metadata) {
  await dbQuery(
    `insert into public.agent_run_events (run_id, level, event_type, message, metadata_json)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [runId, level, eventType, message, JSON.stringify(metadata ?? {})],
  );
}

async function startAgentRun(skill = null) {
  const rows = await dbQuery(
    `insert into public.agent_runs (agent_type, agent_version, target_type, target_id)
     values ('link_searcher', 'local-v1', ${skill ? "'skill'" : "null"}, ${skill ? "$1" : "null"})
     returning id`,
    skill ? [skill.id] : [],
  );
  return rows[0][0];
}

async function finishAgentRun(runId, { status = "completed", suggestionsCreated = 0, costUsd = 0, errorMessage = null }) {
  await dbQuery(
    `update public.agent_runs
     set status = $1, suggestions_created = $2, cost_usd = $3,
         error_message = ${errorMessage === null ? "null" : "$4"},
         completed_at = now()
     where id = ${errorMessage === null ? "$4" : "$5"}`,
    errorMessage === null ? [status, suggestionsCreated, costUsd, runId] : [status, suggestionsCreated, costUsd, errorMessage, runId],
  );
}

async function ytdlp(args, { timeoutMs = config.ytdlpListTimeoutMs, label = "ytdlp" } = {}) {
  return new Promise((resolveP, rejectP) => {
    const child = spawn(config.ytdlpBin, ["--js-runtimes", `node:${config.nodeBin}`, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const killTimer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    }, timeoutMs);
    const settle = (handler, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      handler(value);
    };
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => settle(rejectP, error));
    child.on("close", (code) => {
      if (timedOut) {
        settle(rejectP, new Error(`${label}_timeout_after_${timeoutMs}ms`));
      } else if (code === 0) {
        settle(resolveP, { stdout, stderr });
      } else {
        settle(rejectP, new Error(`yt-dlp exit ${code}: ${stderr.split("\n").slice(-3).join(" | ")}`));
      }
    });
  });
}

async function listChannelUploads(channelId) {
  const url = `https://www.youtube.com/channel/${channelId}/videos`;
  const printFmt = "%(id)s\t%(title)s\t%(duration)s\t%(upload_date)s\t%(view_count)s";
  const { stdout } = await ytdlp([
    "--flat-playlist", "--skip-download",
    "--playlist-end", String(config.maxVideosPerChannel),
    "--sleep-requests", String(config.ytdlpSleepRequests),
    "--print", printFmt,
    url,
  ], { timeoutMs: config.ytdlpListTimeoutMs, label: "ytdlp_listing" });
  return stdout.trim().split("\n").filter(Boolean).map((line) => {
    const [id, title, duration, uploadDate, viewCount] = line.split("\t");
    return {
      video_id: id,
      title,
      duration_sec: duration && duration !== "NA" ? Number(duration) : null,
      upload_date: uploadDate && uploadDate !== "NA" ? uploadDate : null,
      view_count: viewCount && viewCount !== "NA" ? Number(viewCount) : null,
      channel_id: channelId,
      url: `https://www.youtube.com/watch?v=${id}`,
      canonical_url: `https://www.youtube.com/watch?v=${id}`,
    };
  });
}

async function searchChannel(channelId, query, limit) {
  const url = `https://www.youtube.com/channel/${channelId}/search?query=${encodeURIComponent(query)}`;
  const printFmt = "%(id)s\t%(title)s\t%(duration)s";
  const { stdout } = await ytdlp([
    "--flat-playlist", "--skip-download",
    "--playlist-end", String(limit),
    "--sleep-requests", String(config.ytdlpSleepRequests),
    "--print", printFmt,
    url,
  ], { timeoutMs: config.ytdlpListTimeoutMs, label: "ytdlp_listing" });
  return stdout.trim().split("\n").filter(Boolean).map((line) => {
    const [id, title, duration] = line.split("\t");
    return {
      video_id: id,
      title,
      duration_sec: duration && duration !== "NA" ? Number(duration) : null,
      upload_date: null,
      view_count: null,
      channel_id: channelId,
      url: `https://www.youtube.com/watch?v=${id}`,
      canonical_url: `https://www.youtube.com/watch?v=${id}`,
      source: "channel_search",
      query,
    };
  });
}

function termsForSkill(skill) {
  const stop = new Set(["badminton", "tutorial", "how", "the", "and", "for", "with", "from", "your", "shot"]);
  return [...new Set([
    skill.name.toLowerCase(),
    ...skill.name.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !stop.has(t)),
    ...skill.slug.split("-").filter((t) => t.length > 2 && !stop.has(t)),
  ])].filter(Boolean);
}

function relevanceForQuery(candidate, terms) {
  if (!terms.length) return 1;
  const haystack = `${candidate.title}`.toLowerCase();
  const hits = terms.filter((term) => haystack.includes(term)).length;
  return hits / terms.length;
}

function passesSoftFilters(candidate) {
  if (candidate.duration_sec !== null) {
    if (candidate.duration_sec < config.minDurationSec) return { ok: false, reason: "duration_too_short" };
    if (candidate.duration_sec > config.maxDurationSec) return { ok: false, reason: "duration_too_long" };
  }
  // Recency filter applies only when upload_date is known (channel_search results don't
  // expose it; we keep those candidates since technique videos don't age quickly).
  if (candidate.upload_date) {
    const ymd = candidate.upload_date;
    const uploaded = new Date(`${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`);
    const ageDays = (Date.now() - uploaded.getTime()) / 86_400_000;
    if (ageDays > config.maxVideoAgeDays) return { ok: false, reason: "too_old" };
  }
  return { ok: true };
}

function isYoutubeRateLimit(error) {
  const message = errorMessage(error).toLowerCase();
  return message.includes("429") || message.includes("too many requests") || message.includes("rate limit");
}

function rememberTranscriptAttempt(window, wasRateLimited) {
  window.push(wasRateLimited);
  while (window.length > config.rateLimitWindowSize) window.shift();
  const rateLimited = window.filter(Boolean).length;
  return {
    total: window.length,
    rate_limited: rateLimited,
    ratio: window.length ? rateLimited / window.length : 0,
    open: window.length >= config.rateLimitWindowSize && rateLimited / window.length > config.rateLimitThreshold,
  };
}

async function checkKillSwitch(skill, candidate = null) {
  const envStopped = ["1", "true", "yes"].includes(String(process.env.COLLECT_ABORT ?? "").toLowerCase());
  let fileStopped = false;
  try {
    await stat(config.stopFile);
    fileStopped = true;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  if (!envStopped && !fileStopped) return;
  if (fileStopped) await rm(config.stopFile, { force: true });
  log("warn", "stop_file_detected", "Collection stop switch detected", {
    skill: skill.slug,
    video_id: candidate?.video_id ?? null,
    stop_file: fileStopped ? config.stopFile : null,
    env_abort: envStopped,
  });
  throw new SkillAbortError("stop_file_detected", "Collection stop switch detected");
}

async function execForProbe(command, args) {
  const { stdout, stderr } = await execFileP(command, args, {
    timeout: config.systemCommandTimeoutMs,
    maxBuffer: 1024 * 1024,
  });
  return `${stdout}${stderr}`;
}

function parseVmStat(output) {
  const pageSize = Number(output.match(/page size of (\d+) bytes/i)?.[1] ?? 4096);
  const readPages = (label) => {
    const match = output.match(new RegExp(`${label}:\\s+([0-9.]+)`, "i"));
    return match ? Number(match[1].replaceAll(".", "")) : null;
  };
  const freePages = readPages("Pages free");
  const speculativePages = readPages("Pages speculative") ?? 0;
  return {
    page_size: pageSize,
    free_pages: freePages,
    speculative_pages: speculativePages,
    free_mb: freePages === null ? null : Math.round((freePages * pageSize) / 1024 / 1024),
    speculative_mb: Math.round((speculativePages * pageSize) / 1024 / 1024),
  };
}

function parseThermalLevel(output) {
  const numeric =
    output.match(/thermal(?:state| level| pressure level)?\D+([0-9]+)/i)?.[1]
    ?? output.match(/level\D+([0-9]+)/i)?.[1];
  if (numeric !== undefined) return Number(numeric);
  const normalized = output.toLowerCase();
  if (normalized.includes("critical") || normalized.includes("serious") || normalized.includes("heavy")) return 2;
  if (normalized.includes("fair") || normalized.includes("moderate")) return 1;
  if (normalized.includes("nominal") || normalized.includes("normal")) return 0;
  return null;
}

async function readSystemPressure() {
  if (config.skipSystemPressureCheck || platform() !== "darwin") {
    return { skipped: true, reason: config.skipSystemPressureCheck ? "disabled_by_env" : "non_darwin" };
  }

  const pressure = { skipped: false, memory: null, thermal_level: null, pmset_batt: null };
  try {
    pressure.memory = parseVmStat(await execForProbe("vm_stat", []));
  } catch (error) {
    pressure.memory_error = errorMessage(error);
  }

  try {
    const thermal = await execForProbe("pmset", ["-g", "thermlog"]);
    pressure.thermal_level = parseThermalLevel(thermal);
    pressure.thermal_sample = thermal.split("\n").slice(0, 5).join(" | ");
  } catch (error) {
    pressure.thermal_error = errorMessage(error);
  }

  try {
    pressure.pmset_batt = (await execForProbe("pmset", ["-g", "batt"])).split("\n").slice(0, 2).join(" | ");
  } catch (error) {
    pressure.pmset_batt_error = errorMessage(error);
  }

  return pressure;
}

function isPressureHigh(pressure) {
  const freeMb = pressure.memory?.free_mb;
  const lowMemory = typeof freeMb === "number" && freeMb < config.freeMemoryAbortMb;
  const hot = typeof pressure.thermal_level === "number" && pressure.thermal_level >= 2;
  return lowMemory || hot;
}

async function ensureSystemHealthy(skill, candidate) {
  const first = await readSystemPressure();
  log("debug", "system_pressure_checked", "System pressure checked before candidate", {
    skill: skill.slug,
    video_id: candidate.video_id,
    pressure: first,
  });
  if (!isPressureHigh(first)) return;

  log("warn", "system_pressure_high", "Pausing collection because local system pressure is high", {
    skill: skill.slug,
    video_id: candidate.video_id,
    pressure: first,
    pause_ms: config.systemPressurePauseMs,
  });
  await sleep(config.systemPressurePauseMs);

  const second = await readSystemPressure();
  log("debug", "system_pressure_rechecked", "System pressure rechecked after pause", {
    skill: skill.slug,
    video_id: candidate.video_id,
    pressure: second,
  });
  if (isPressureHigh(second)) {
    throw new SkillAbortError("system_pressure_abort", "System pressure stayed high after pause", {
      first_pressure: first,
      second_pressure: second,
    });
  }
}

async function fetchTranscript(videoId) {
  const baseOut = join(config.transcriptDir, videoId);
  await mkdir(config.transcriptDir, { recursive: true });
  await ytdlp([
    "--skip-download",
    "--write-auto-subs", "--write-subs",
    // Only the original English caption; "en.*" would match auto-translated targets
    // like en-ar, en-bn, en-yue and trigger HTTP 429 on YouTube's subtitle endpoint.
    "--sub-lang", "en,en-orig",
    "--sub-format", "vtt",
    "--sleep-requests", String(config.ytdlpSleepRequests),
    "--sleep-subtitles", String(config.ytdlpSleepSubtitles),
    "-o", `${baseOut}.%(ext)s`,
    `https://www.youtube.com/watch?v=${videoId}`,
  ], { timeoutMs: config.ytdlpTranscriptTimeoutMs, label: "ytdlp_transcript" });

  // yt-dlp may write any of en.vtt, en-orig.vtt, en-en.vtt depending on availability.
  const dirEntries = await readdir(config.transcriptDir);
  const candidate = dirEntries.find((entry) => entry.startsWith(`${videoId}.`) && entry.endsWith(".vtt"));
  if (!candidate) throw new Error("transcript_file_missing");

  const vtt = await readFile(join(config.transcriptDir, candidate), "utf8");
  return vttToText(vtt);
}

function vttToText(vtt) {
  const lines = vtt.split("\n");
  const out = [];
  let prevText = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("WEBVTT")) continue;
    if (trimmed.startsWith("Kind:") || trimmed.startsWith("Language:")) continue;
    if (/^\d{2}:\d{2}/.test(trimmed) || trimmed.includes("-->")) continue;
    if (trimmed.startsWith("NOTE")) continue;
    const stripped = trimmed.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    if (stripped !== prevText) {
      out.push(stripped);
      prevText = stripped;
    }
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}

function promptSystem(skill) {
  const category = skill.category_name ?? skill.category_slug ?? "the sport";
  return [
    `You score ${category} tutorial videos against a specific sub-skill.`,
    `A video qualifies if it substantially teaches, demonstrates, or improves the sub-skill — even when the title uses synonyms or focuses on a sub-aspect (e.g. "Pop Up Hand Position" still teaches the surf pop-up; "How to Squat Properly" still covers the barbell squat).`,
    `Equipment is implicit by context: a strength-training "squat" video counts as a barbell squat when performed with a barbell, "bandeja" counts as the padel bandeja, etc.`,
    `Score relevance < 0.4 only when the video is clearly about a different sub-skill or only mentions this sub-skill in passing.`,
    `Be strict on teaching_quality (clickbait and rambling = low) but generous on relevance for genuinely on-topic content.`,
    `Return JSON only.`,
  ].join(" ");
}
function promptUser(skill, candidate, transcript) {
  return [
    `Return JSON with these exact keys:`,
    `{"relevance": 0..1, "teaching_quality": 0..1, "demo_vs_talk": 0..1, "level": "beginner"|"intermediate"|"advanced", "public_note": "<=140 chars", "evidence_quote": "<=200 chars from the transcript"}`,
    "",
    `Rules:`,
    `- if the transcript does not actually teach the sub-skill, set relevance < 0.4`,
    `- be strict on teaching_quality; clickbait and rambling = low`,
    `- evidence_quote must be a real substring of the transcript`,
    "",
    `sub_skill: "${skill.name}"`,
    `sub_skill_description: "${skill.description}"`,
    `candidate_title: "${candidate.title}"`,
    `transcript_excerpt: "${transcript.slice(0, 4000)}"`,
  ].join("\n");
}

function parseOllamaJson(payload, context) {
  const cleaned = (payload.response ?? "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  try {
    return JSON.parse(cleaned);
  } catch (_error) {
    throw new Error(`${context}_json_parse_failed: ${cleaned.slice(0, 120)}`);
  }
}

async function fetchWithTimeout(url, options, timeoutMs, label) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`${label}_timeout_after_${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function scoreWithOllama(skill, candidate, transcript) {
  const body = {
    model: config.ollamaModel,
    stream: false,
    format: "json",
    options: { temperature: 0.1 },
    system: promptSystem(skill),
    prompt: promptUser(skill, candidate, transcript),
  };
  const response = await fetchWithTimeout(`${config.ollamaUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, config.ollamaTimeoutMs, "ollama_score");
  if (!response.ok) throw new Error(`Ollama ${response.status}`);
  const payload = await response.json();
  const parsed = parseOllamaJson(payload, "score");
  return {
    relevance: Number(parsed.relevance ?? 0),
    teaching_quality: Number(parsed.teaching_quality ?? 0),
    demo_vs_talk: Number(parsed.demo_vs_talk ?? 0.5),
    level: ["beginner", "intermediate", "advanced"].includes(parsed.level) ? parsed.level : null,
    public_note: String(parsed.public_note ?? "").slice(0, 140),
    evidence_quote: String(parsed.evidence_quote ?? "").slice(0, 200),
  };
}

function secondaryPromptSystem(skill) {
  const category = skill.category_name ?? skill.category_slug ?? "the category";
  return [
    `You identify secondary ${category} skills taught by a tutorial video.`,
    `Only include skills that the transcript substantially teaches, demonstrates, or improves.`,
    `Do not include the primary skill being scored.`,
    `Prefer 2 to ${config.maxSecondarySkills} secondary skills when genuinely supported; return an empty array when none are supported.`,
    `Return JSON only.`,
  ].join(" ");
}

function secondaryPromptUser(primarySkill, categorySkills, candidate, transcript) {
  const skillList = categorySkills
    .filter((skill) => skill.id !== primarySkill.id)
    .map((skill) => `- ${skill.slug}: ${skill.name} — ${skill.description}`)
    .join("\n");
  return [
    `Return JSON with this exact shape:`,
    `{"secondary":[{"skill_slug":"slug-from-list","relevance":0..1,"public_note":"<=140 chars explaining why this video teaches that skill"}]}`,
    "",
    `Rules:`,
    `- choose only from the skill list below`,
    `- relevance means how clearly this video teaches that secondary skill`,
    `- skip skills that are merely mentioned in passing`,
    `- keep public_note specific to that secondary skill`,
    "",
    `primary_skill: "${primarySkill.slug}: ${primarySkill.name}"`,
    `candidate_title: "${candidate.title}"`,
    "",
    `category_skill_list:`,
    skillList,
    "",
    `transcript_excerpt: "${transcript.slice(0, 5000)}"`,
  ].join("\n");
}

async function findSecondarySkills(primarySkill, categorySkills, candidate, transcript) {
  const body = {
    model: config.ollamaModel,
    stream: false,
    format: "json",
    options: { temperature: 0 },
    system: secondaryPromptSystem(primarySkill),
    prompt: secondaryPromptUser(primarySkill, categorySkills, candidate, transcript),
  };
  log("debug", "secondary_score_started", "Scoring secondary skill overlap", {
    video_id: candidate.video_id,
    primary_skill: primarySkill.slug,
    category_skill_count: categorySkills.length,
  });
  const response = await fetchWithTimeout(`${config.ollamaUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, config.ollamaTimeoutMs, "ollama_secondary");
  if (!response.ok) throw new Error(`Ollama secondary ${response.status}`);
  const payload = await response.json();
  const parsed = parseOllamaJson(payload, "secondary");
  const skillsBySlug = new Map(categorySkills.map((skill) => [skill.slug, skill]));
  const seen = new Set();
  const secondary = Array.isArray(parsed.secondary) ? parsed.secondary : [];
  return secondary.flatMap((item) => {
    const skillSlug = String(item.skill_slug ?? "").trim();
    const skill = skillsBySlug.get(skillSlug);
    const relevance = Number(item.relevance ?? 0);
    if (!skill || skill.id === primarySkill.id || seen.has(skill.id) || !Number.isFinite(relevance)) return [];
    seen.add(skill.id);
    return [{
      skill,
      relevance: Math.max(0, Math.min(1, relevance)),
      public_note: String(item.public_note ?? "").slice(0, 140),
    }];
  }).slice(0, config.maxSecondarySkills);
}

async function postSuggestion(skill, candidate, transcript, score, viewCount) {
  const payload = {
    type: "LINK_ADD",
    origin_type: "agent",
    origin_name: "local-collection",
    category_id: skill.category_id,
    skill_id: skill.id,
    payload_json: {
      url: candidate.url,
      canonical_url: candidate.canonical_url,
      domain: "youtube.com",
      title: candidate.title,
      description: null,
      thumbnail_url: `https://i.ytimg.com/vi/${candidate.video_id}/hqdefault.jpg`,
      content_type: "video",
      language: "en",
      target_skill_id: skill.id,
      public_note: score.public_note || `Auto-scored relevance=${score.relevance.toFixed(2)}, quality=${score.teaching_quality.toFixed(2)}.`,
      skill_level: score.level,
    },
    evidence_json: {
      source: "youtube_local_collection",
      channel_id: candidate.channel_id,
      video_id: candidate.video_id,
      view_count: viewCount,
      score,
      transcript_excerpt: transcript.slice(0, 600),
    },
    confidence: Math.min(score.relevance, score.teaching_quality),
  };
  const response = await fetchWithTimeout(`${config.supabaseUrl}/functions/v1/submit-suggestion`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }, config.submitTimeoutMs, "submit_suggestion");
  const text = await response.text();
  if (!response.ok) throw new Error(`submit-suggestion ${response.status}: ${text}`);
  return JSON.parse(text);
}

async function ensureLinkPlaceholder(candidate) {
  const thumbnailUrl = `https://i.ytimg.com/vi/${candidate.video_id}/hqdefault.jpg`;
  const rows = await dbQuery(
    `insert into public.links (
       url,
       canonical_url,
       domain,
       title,
       description,
       thumbnail_url,
       content_type,
       language,
       preview_status,
       fetched_at,
       is_active
     )
     values ($1, $2, 'youtube.com', $3, null, $4, 'video', 'en', 'fetched', now(), false)
     on conflict (canonical_url) do update set
       url = excluded.url,
       domain = excluded.domain,
       title = coalesce(excluded.title, public.links.title),
       thumbnail_url = coalesce(excluded.thumbnail_url, public.links.thumbnail_url),
       content_type = coalesce(excluded.content_type, public.links.content_type),
       language = coalesce(excluded.language, public.links.language),
       preview_status = excluded.preview_status,
       fetched_at = coalesce(public.links.fetched_at, excluded.fetched_at),
       updated_at = now()
     returning id`,
    [candidate.url, candidate.canonical_url, candidate.title, thumbnailUrl],
  );
  const linkId = rows[0]?.[0];
  if (!linkId) throw new Error("link_placeholder_missing");
  return linkId;
}

async function postAttachSuggestion(primarySkill, secondary, candidate, transcript, score, linkId) {
  const payload = {
    type: "LINK_ATTACH_SKILL",
    origin_type: "agent",
    origin_name: "local-collection-secondary",
    category_id: secondary.skill.category_id,
    skill_id: secondary.skill.id,
    link_id: linkId,
    payload_json: {
      link_id: linkId,
      target_skill_id: secondary.skill.id,
      public_note: secondary.public_note || `Also teaches ${secondary.skill.name}.`,
      skill_level: score.level,
    },
    evidence_json: {
      source: "youtube_local_collection_secondary",
      channel_id: candidate.channel_id,
      video_id: candidate.video_id,
      primary_skill_slug: primarySkill.slug,
      secondary_skill_slug: secondary.skill.slug,
      secondary_relevance: secondary.relevance,
      transcript_excerpt: transcript.slice(0, 600),
    },
    confidence: secondary.relevance,
  };
  const response = await fetchWithTimeout(`${config.supabaseUrl}/functions/v1/submit-suggestion`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }, config.submitTimeoutMs, "submit_secondary");
  const text = await response.text();
  if (!response.ok) throw new Error(`submit-secondary ${response.status}: ${text}`);
  return JSON.parse(text);
}

async function preflightCheck() {
  log("info", "preflight_started", "Checking Supabase, Ollama, and yt-dlp before collection", {
    supabase_url: config.supabaseUrl,
    ollama_url: config.ollamaUrl,
    preflight_channel_id: config.preflightChannelId,
  });

  const supabaseResponse = await fetchWithTimeout(config.supabaseUrl, {
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
    },
  }, config.preflightTimeoutMs, "preflight_supabase");
  if (supabaseResponse.status >= 500) {
    throw new Error(`preflight_supabase_${supabaseResponse.status}`);
  }

  const ollamaResponse = await fetchWithTimeout(`${config.ollamaUrl}/api/tags`, {}, config.preflightTimeoutMs, "preflight_ollama");
  if (!ollamaResponse.ok) {
    throw new Error(`preflight_ollama_${ollamaResponse.status}`);
  }

  const { stdout } = await ytdlp([
    "--flat-playlist", "--skip-download",
    "--playlist-end", "1",
    "--print", "%(id)s",
    `https://www.youtube.com/channel/${config.preflightChannelId}/videos`,
  ], { timeoutMs: config.ytdlpListTimeoutMs, label: "preflight_ytdlp_listing" });
  if (!stdout.trim()) throw new Error("preflight_ytdlp_no_results");

  log("info", "preflight_completed", "Preflight checks completed", {
    supabase_status: supabaseResponse.status,
    yt_dlp_sample_video: stdout.trim().split("\n")[0],
  });
}

async function persistPreflightFailure(error) {
  try {
    const runId = await startAgentRun();
    activeRunId = runId;
    activeRunState = { runId, phase: "preflight", suggestionsCreated: 0, finalized: false };
    log("error", "preflight_failed", errorMessage(error), {
      run_id: runId,
      supabase_url: config.supabaseUrl,
      ollama_url: config.ollamaUrl,
      preflight_channel_id: config.preflightChannelId,
    });
    await finishAgentRun(runId, { status: "failed", suggestionsCreated: 0, errorMessage: errorMessage(error) });
    activeRunState.finalized = true;
    await flushAgentRunEvents();
  } catch (persistError) {
    console.warn(JSON.stringify({
      level: "warn",
      event: "preflight_failure_persist_failed",
      message: errorMessage(persistError),
      ts: new Date().toISOString(),
    }));
  } finally {
    activeRunId = null;
    activeRunState = null;
  }
}

async function abortActiveRun(reason) {
  if (!activeRunId || activeRunState?.finalized) return;
  const runId = activeRunId;
  log("warn", "run_aborted", reason, {
    run_id: runId,
    skill: activeRunState?.skill?.slug ?? null,
    suggestions_created: activeRunState?.suggestionsCreated ?? 0,
  });
  await finishAgentRun(runId, {
    status: "aborted",
    suggestionsCreated: activeRunState?.suggestionsCreated ?? 0,
    errorMessage: reason,
  });
  activeRunState.finalized = true;
  await flushAgentRunEvents();
}

function installTerminationHandlers() {
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      if (shuttingDown) process.exit(signal === "SIGTERM" ? 143 : 130);
      shuttingDown = true;
      abortActiveRun(signal.toLowerCase()).finally(() => {
        process.exit(signal === "SIGTERM" ? 143 : 130);
      });
    });
  }
}

async function processSkill(skill, summary) {
  const runId = await startAgentRun(skill);
  let submitted = 0;
  let primarySubmitted = 0;
  let secondarySubmitted = 0;
  const transcriptRateWindow = [];
  activeRunId = runId;
  activeRunState = { runId, skill, suggestionsCreated: 0, finalized: false };

  try {
    log("info", "skill_run_started", "Starting collection for skill", { skill: skill.slug, run_id: runId });
    await checkKillSwitch(skill);

    const channels = await loadChannels(skill.category_id);
    const categorySkills = await loadCategorySkills(skill.category_id);
    const terms = termsForSkill(skill);
    const allCandidates = [];
    const seenVideoIds = new Set();

    // Channel search by skill name returns videos in-channel matching the skill — far
    // better signal density than the recent-uploads playlist, which is contaminated by
    // tournaments and vlogs.
    for (const channel of channels) {
      try {
        const searchResults = await searchChannel(channel.identifier, skill.name, config.searchResultsPerChannel);
        log("info", "channel_search_completed", "Searched channel for skill", {
          channel: channel.display_name, query: skill.name, count: searchResults.length,
        });
        for (const candidate of searchResults) {
          if (seenVideoIds.has(candidate.video_id)) continue;
          seenVideoIds.add(candidate.video_id);
          const soft = passesSoftFilters(candidate);
          if (!soft.ok) {
            log("debug", "candidate_rejected_soft", "Candidate rejected by soft filter", {
              video_id: candidate.video_id, reason: soft.reason,
            });
            continue;
          }
          candidate.title_relevance = relevanceForQuery(candidate, terms);
          allCandidates.push(candidate);
        }
      } catch (error) {
        log("warn", "channel_search_failed", errorMessage(error), { channel: channel.display_name });
      }
    }

    // Sort by title relevance and take top N for scoring (zero-relevance candidates fall to the bottom).
    allCandidates.sort((a, b) => b.title_relevance - a.title_relevance);
    const toScore = allCandidates.slice(0, config.candidatesToScorePerSkill);
    log("info", "candidates_ready_for_scoring", "Candidate pool assembled for skill", {
      skill: skill.slug, total: allCandidates.length, will_score: toScore.length,
    });

    let firstCandidate = true;
    for (const candidate of toScore) {
      await checkKillSwitch(skill, candidate);
      await ensureSystemHealthy(skill, candidate);
      if (!firstCandidate) {
        // Polite spacing between transcript+score iterations to avoid YouTube 429s.
        await sleep(2000);
      }
      firstCandidate = false;
      let transcript;
      try {
        transcript = await fetchTranscript(candidate.video_id);
        const rateStatus = rememberTranscriptAttempt(transcriptRateWindow, false);
        log("debug", "transcript_fetch_completed", "Transcript fetched", {
          video_id: candidate.video_id,
          length: transcript?.length ?? 0,
          rate_limit_window: rateStatus,
        });
        if (!transcript || transcript.length < 200) {
          log("debug", "candidate_skipped_no_transcript", "Transcript missing or too short", {
            video_id: candidate.video_id, length: transcript?.length ?? 0,
          });
          continue;
        }
      } catch (error) {
        const rateLimited = isYoutubeRateLimit(error);
        const rateStatus = rememberTranscriptAttempt(transcriptRateWindow, rateLimited);
        log("warn", "transcript_failed", errorMessage(error), {
          video_id: candidate.video_id,
          youtube_rate_limited: rateLimited,
          rate_limit_window: rateStatus,
        });
        if (rateStatus.open) {
          throw new SkillAbortError("youtube_rate_limit_circuit_open", "YouTube transcript rate-limit circuit opened", {
            rate_limit_window: rateStatus,
          });
        }
        continue;
      }

      let score;
      try {
        score = await scoreWithOllama(skill, candidate, transcript);
      } catch (error) {
        log("warn", "score_failed", errorMessage(error), { video_id: candidate.video_id });
        continue;
      }

      log("info", "candidate_scored", "Candidate scored", {
        video_id: candidate.video_id,
        title: candidate.title.slice(0, 80),
        relevance: score.relevance,
        teaching_quality: score.teaching_quality,
        skill_level: score.level,
        title_relevance: candidate.title_relevance,
      });

      if (score.relevance < config.relevanceThreshold || score.teaching_quality < config.qualityThreshold) {
        continue;
      }

      try {
        const result = await postSuggestion(skill, candidate, transcript, score, candidate.view_count);
        if (!result.duplicate) {
          submitted += 1;
          primarySubmitted += 1;
          activeRunState.suggestionsCreated = submitted;
        }
        log("info", "suggestion_submitted", "Suggestion submitted to local DB", {
          suggestion_id: result.suggestion_id, duplicate: Boolean(result.duplicate),
        });
      } catch (error) {
        log("error", "submit_failed", errorMessage(error), { video_id: candidate.video_id });
        continue;
      }

      try {
        const secondaryCandidates = await findSecondarySkills(skill, categorySkills, candidate, transcript);
        const acceptedSecondaries = secondaryCandidates.filter(
          (secondary) => secondary.relevance >= config.secondaryRelevanceThreshold,
        );
        if (!acceptedSecondaries.length) {
          log("debug", "secondary_skills_none", "No secondary skills passed threshold", {
            video_id: candidate.video_id,
            primary_skill: skill.slug,
            candidates: secondaryCandidates.map((secondary) => ({
              skill: secondary.skill.slug,
              relevance: secondary.relevance,
            })),
            threshold: config.secondaryRelevanceThreshold,
          });
          continue;
        }

        const linkId = await ensureLinkPlaceholder(candidate);
        for (const secondary of acceptedSecondaries) {
          try {
            const result = await postAttachSuggestion(skill, secondary, candidate, transcript, score, linkId);
            if (!result.duplicate) {
              submitted += 1;
              secondarySubmitted += 1;
              activeRunState.suggestionsCreated = submitted;
            }
            log("info", "secondary_suggestion_submitted", "Secondary skill attach submitted", {
              suggestion_id: result.suggestion_id,
              duplicate: Boolean(result.duplicate),
              video_id: candidate.video_id,
              link_id: linkId,
              primary_skill: skill.slug,
              secondary_skill: secondary.skill.slug,
              relevance: secondary.relevance,
            });
          } catch (error) {
            log("error", "secondary_submit_failed", errorMessage(error), {
              video_id: candidate.video_id,
              primary_skill: skill.slug,
              secondary_skill: secondary.skill.slug,
            });
          }
        }
      } catch (error) {
        log("warn", "secondary_score_failed", errorMessage(error), {
          video_id: candidate.video_id,
          primary_skill: skill.slug,
        });
      }
    }

    await finishAgentRun(runId, { suggestionsCreated: submitted });
    activeRunState.finalized = true;
    log("info", "skill_run_completed", "Skill run complete", {
      skill: skill.slug,
      submitted,
      primary_submitted: primarySubmitted,
      secondary_submitted: secondarySubmitted,
    });
    const item = {
      skill: skill.slug,
      status: "completed",
      submitted,
      primary_submitted: primarySubmitted,
      secondary_submitted: secondarySubmitted,
    };
    summary.push(item);
    await flushAgentRunEvents();
    return { ...item, circuitOpen: false };
  } catch (error) {
    const isSkillAbort = error instanceof SkillAbortError;
    const code = isSkillAbort ? error.code : "skill_run_failed";
    const status = code === "youtube_rate_limit_circuit_open" || !isSkillAbort ? "failed" : "aborted";
    const message = isSkillAbort ? code : errorMessage(error);
    const metadata = isSkillAbort ? error.metadata : {};
    log(status === "aborted" ? "warn" : "error", status === "aborted" ? "skill_run_aborted" : "skill_run_failed", message, {
      skill: skill.slug,
      run_id: runId,
      submitted,
      ...metadata,
    });
    await finishAgentRun(runId, { status, suggestionsCreated: submitted, errorMessage: message });
    activeRunState.finalized = true;
    const item = {
      skill: skill.slug,
      status,
      error: message,
      submitted,
      primary_submitted: primarySubmitted,
      secondary_submitted: secondarySubmitted,
    };
    summary.push(item);
    await flushAgentRunEvents();
    return { ...item, circuitOpen: code === "youtube_rate_limit_circuit_open" };
  } finally {
    activeRunId = null;
    activeRunState = null;
  }
}

async function main() {
  installTerminationHandlers();
  await mkdir(config.outputDir, { recursive: true });
  try {
    await preflightCheck();
  } catch (error) {
    await persistPreflightFailure(error);
    throw error;
  }

  const skills = await loadSkills(skillSlugFilter);
  if (!skills.length) throw new Error(`No active skills found${categorySlugFilter ? ` for category ${categorySlugFilter}` : ""}.`);
  log("info", "collection_started", "Starting collection", {
    skills: skills.length,
    category: categorySlugFilter,
    model: config.ollamaModel,
    supabase_url: config.supabaseUrl,
  });
  const summary = [];
  let consecutiveRateLimitCircuits = 0;
  let stoppedByRateLimitCircuit = false;
  for (const skill of skills) {
    try {
      const result = await processSkill(skill, summary);
      consecutiveRateLimitCircuits = result.circuitOpen ? consecutiveRateLimitCircuits + 1 : 0;
      if (consecutiveRateLimitCircuits >= config.rateLimitConsecutiveSkillStop) {
        stoppedByRateLimitCircuit = true;
        log("error", "collection_rate_limit_circuit_stop", "Stopping collection after consecutive skill rate-limit circuits", {
          consecutive_rate_limit_circuits: consecutiveRateLimitCircuits,
          threshold: config.rateLimitConsecutiveSkillStop,
        });
        break;
      }
    } catch (error) {
      consecutiveRateLimitCircuits = 0;
      log("error", "skill_run_failed", errorMessage(error), { skill: skill.slug });
      summary.push({ skill: skill.slug, status: "failed", error: errorMessage(error) });
    }
  }

  const outputPath = join(config.outputDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await writeFile(outputPath, JSON.stringify({ ts: new Date().toISOString(), stopped_by_rate_limit_circuit: stoppedByRateLimitCircuit, summary }, null, 2));
  log("info", "collection_finished", "Collection finished", { output: outputPath, stopped_by_rate_limit_circuit: stoppedByRateLimitCircuit, summary });
  if (stoppedByRateLimitCircuit) process.exitCode = 1;
}

main().catch(async (error) => {
  log("error", "collection_fatal", errorMessage(error));
  await flushAgentRunEvents();
  process.exit(1);
});
