#!/usr/bin/env node
/**
 * Weekly source discovery.
 *
 * Finds reputable YouTube channels and blogs for each active category, validates
 * them, auto-trusts high-confidence sources, and sends borderline candidates to
 * moderation as SOURCE_ADD suggestions.
 */
import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileP = promisify(execFile);

const config = {
  supabaseUrl: process.env.SUPABASE_URL ?? "http://127.0.0.1:54321",
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  perplexityApiKey: process.env.PERPLEXITY_API_KEY ?? "",
  perplexityModel: process.env.DISCOVER_SOURCES_PERPLEXITY_MODEL ?? "sonar",
  ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",
  ollamaModel: process.env.OLLAMA_MODEL ?? "qwen2.5:7b",
  ytdlpBin: process.env.YTDLP_BIN ?? join(root, "bin", "yt-dlp"),
  nodeBin: process.env.NODE_BIN_FOR_YTDLP ?? process.execPath,
  minFollowers: Number(process.env.DISCOVER_SOURCES_MIN_FOLLOWERS ?? 2000),
  maxIdleDays: Number(process.env.DISCOVER_SOURCES_MAX_IDLE_DAYS ?? 180),
  autoTrustThreshold: Number(process.env.DISCOVER_SOURCES_AUTO_TRUST_THRESHOLD ?? 4.0),
  suggestThreshold: Number(process.env.DISCOVER_SOURCES_SUGGEST_THRESHOLD ?? 2.5),
  ytdlpTimeoutMs: Number(process.env.DISCOVER_SOURCES_YTDLP_TIMEOUT_MS ?? 60_000),
  fetchTimeoutMs: Number(process.env.DISCOVER_SOURCES_FETCH_TIMEOUT_MS ?? 20_000),
  ollamaTimeoutMs: Number(process.env.DISCOVER_SOURCES_OLLAMA_TIMEOUT_MS ?? 45_000),
  dbQueryTimeoutMs: Number(process.env.COLLECT_DB_TIMEOUT_MS ?? 30_000),
  outputDir: process.env.DISCOVER_SOURCES_OUTPUT_DIR ?? join(root, ".collection", "source-discovery"),
  categorySlug: process.argv.includes("--category")
    ? process.argv[process.argv.indexOf("--category") + 1]
    : null,
};

if (!config.serviceRoleKey) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  process.exit(1);
}
if (!config.perplexityApiKey) {
  console.error("PERPLEXITY_API_KEY is not set.");
  process.exit(1);
}
if (!existsSync(config.ytdlpBin)) {
  console.error(`yt-dlp binary not found at ${config.ytdlpBin}`);
  process.exit(1);
}

function log(level, event, message, metadata = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, message, ...metadata });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function dbQuery(sql, params = []) {
  const sqlValue = (value) => {
    if (value === null || value === undefined) return "null";
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

async function startRun() {
  const rows = await dbQuery(
    `insert into public.agent_runs (agent_type, agent_version)
     values ('source_discoverer', 'local-v1')
     returning id`,
  );
  return rows[0][0];
}

async function finishRun(runId, { status = "completed", suggestionsCreated = 0, errorMessage = null } = {}) {
  await dbQuery(
    `update public.agent_runs
     set status = $1,
         suggestions_created = $2,
         error_message = ${errorMessage === null ? "null" : "$3"},
         completed_at = now()
     where id = ${errorMessage === null ? "$3" : "$4"}`,
    errorMessage === null ? [status, suggestionsCreated, runId] : [status, suggestionsCreated, errorMessage, runId],
  );
}

async function persistEvent(runId, level, eventType, message, metadata = {}) {
  await dbQuery(
    `insert into public.agent_run_events (run_id, level, event_type, message, metadata_json)
     values ($1, $2, $3, $4, $5::jsonb)`,
    [runId, level, eventType, message, JSON.stringify(metadata)],
  );
}

async function loadCategories() {
  const params = config.categorySlug ? [config.categorySlug] : [];
  const rows = await dbQuery(
    `select id, slug, name, coalesce(description, '')
     from public.categories
     where is_active
       ${config.categorySlug ? "and slug = $1" : ""}
     order by name`,
    params,
  );
  return rows.map(([id, slug, name, description]) => ({ id, slug, name, description }));
}

async function sourceAlreadyKnown(sourceType, identifier) {
  const rows = await dbQuery(
    `select 1 from public.trusted_sources
     where source_type = $1 and lower(identifier) = lower($2)
     limit 1`,
    [sourceType, identifier],
  );
  return rows.length > 0;
}

async function ytdlp(args) {
  return new Promise((resolveP, rejectP) => {
    const child = spawn(config.ytdlpBin, ["--js-runtimes", `node:${config.nodeBin}`, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
    }, config.ytdlpTimeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectP(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolveP({ stdout, stderr });
      else rejectP(new Error(`yt-dlp exit ${code}: ${stderr.split("\n").slice(-3).join(" | ")}`));
    });
  });
}

function extractJsonArray(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced ?? text;
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end < start) throw new Error("source_discovery_json_array_missing");
  return JSON.parse(raw.slice(start, end + 1));
}

async function queryCandidates(category) {
  const prompt = [
    `List 10 to 15 reputable YouTube channels and blogs that teach ${category.name}.`,
    `Return JSON only, as an array. Each item must include:`,
    `{"name":"...", "url":"channel URL or homepage", "source_type":"youtube_channel or domain", "audience_tier":"beginner/intermediate/advanced/mixed", "why_reputable":"one line"}`,
    `Favor practical teaching sources over entertainment-only accounts.`,
  ].join("\n");

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.perplexityApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.perplexityModel,
      messages: [
        { role: "system", content: "You return compact JSON arrays and no prose." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error?.message ?? `Perplexity ${response.status}`);
  }
  const text = body.choices?.[0]?.message?.content;
  if (!text) throw new Error("Perplexity response missing content");
  const parsed = extractJsonArray(text);
  if (!Array.isArray(parsed)) throw new Error("Perplexity response was not an array");
  return parsed.flatMap((item) => {
    const url = String(item.url ?? "").trim();
    const name = String(item.name ?? "").trim();
    if (!url || !name) return [];
    return [{
      name,
      url,
      source_type: item.source_type === "domain" ? "domain" : "youtube_channel",
      audience_tier: String(item.audience_tier ?? "mixed"),
      why_reputable: String(item.why_reputable ?? ""),
    }];
  });
}

function domainFromUrl(url) {
  const parsed = new URL(url);
  return parsed.hostname.replace(/^www\./, "").toLowerCase();
}

function isoFromYtdlpUploadDate(value) {
  if (!value || value === "NA") return null;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00.000Z`;
}

function recencyBonus(latestUploadIso) {
  if (!latestUploadIso) return 0;
  const ageDays = (Date.now() - Date.parse(latestUploadIso)) / 86_400_000;
  if (ageDays <= 30) return 1;
  if (ageDays <= 90) return 0.5;
  if (ageDays <= config.maxIdleDays) return 0.25;
  return -2;
}

async function validateYouTube(candidate) {
  const printFmt = "%(channel_id)s\t%(channel)s\t%(channel_follower_count)s\t%(upload_date)s";
  const url = candidate.url.includes("/videos") ? candidate.url : `${candidate.url.replace(/\/+$/, "")}/videos`;
  const { stdout } = await ytdlp([
    "--flat-playlist",
    "--skip-download",
    "--playlist-end", "1",
    "--print", printFmt,
    url,
  ]);
  const [channelId, channelTitle, followersRaw, uploadDateRaw] = stdout.trim().split("\n")[0]?.split("\t") ?? [];
  if (!channelId || channelId === "NA") throw new Error("youtube_channel_id_missing");
  const followers = Number(followersRaw);
  const latestUploadDate = isoFromYtdlpUploadDate(uploadDateRaw);
  if (Number.isFinite(followers) && followers < config.minFollowers) {
    throw new Error(`followers_below_min:${followers}`);
  }
  if (latestUploadDate) {
    const idleDays = (Date.now() - Date.parse(latestUploadDate)) / 86_400_000;
    if (idleDays > config.maxIdleDays) throw new Error(`channel_idle:${Math.round(idleDays)}d`);
  }
  return {
    source_type: "youtube_channel",
    identifier: channelId,
    display_name: channelTitle && channelTitle !== "NA" ? channelTitle : candidate.name,
    followers: Number.isFinite(followers) ? followers : null,
    latest_upload_date: latestUploadDate,
  };
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.fetchTimeoutMs);
  try {
    return await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "SkillsAggregatorSourceDiscovery/1.0" },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function validateDomain(candidate) {
  const normalizedUrl = candidate.url.startsWith("http") ? candidate.url : `https://${candidate.url}`;
  const response = await fetchWithTimeout(normalizedUrl);
  if (!response.ok) throw new Error(`domain_http_${response.status}`);
  const html = await response.text();
  const title =
    html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ??
    candidate.name;
  return {
    source_type: "domain",
    identifier: domainFromUrl(response.url || normalizedUrl),
    display_name: title.trim().replace(/\s+/g, " ").slice(0, 120),
    followers: null,
    latest_upload_date: null,
  };
}

async function nicheMatch(category, validation, candidate) {
  try {
    const response = await fetch(`${config.ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(config.ollamaTimeoutMs),
      body: JSON.stringify({
        model: config.ollamaModel,
        stream: false,
        format: "json",
        options: { temperature: 0 },
        system: "Return JSON only.",
        prompt: [
          `Does this source primarily teach ${category.name}?`,
          `source_name: ${validation.display_name}`,
          `source_type: ${validation.source_type}`,
          `candidate_claim: ${candidate.why_reputable}`,
          `Return {"match":true|false,"reason":"<=120 chars"}.`,
        ].join("\n"),
      }),
    });
    if (!response.ok) throw new Error(`ollama_${response.status}`);
    const payload = await response.json();
    const parsed = JSON.parse(String(payload.response ?? "{}"));
    return { match: parsed.match === true, reason: String(parsed.reason ?? "") };
  } catch (error) {
    const haystack = `${validation.display_name} ${candidate.why_reputable}`.toLowerCase();
    const terms = category.name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const matched = terms.some((term) => haystack.includes(term));
    return { match: matched, reason: `heuristic fallback after ${errorMessage(error)}` };
  }
}

function scoreCandidate(validation, niche) {
  const followerScore = validation.followers ? Math.log10(Math.max(validation.followers, 1)) : 2.6;
  return followerScore + recencyBonus(validation.latest_upload_date) + (niche.match ? 0.75 : -1.5);
}

async function autoTrustSource(category, validation, score, evidence) {
  const rows = await dbQuery(
    `insert into public.trusted_sources (
       source_type,
       identifier,
       display_name,
       category_id,
       is_active,
       origin_type,
       discovered_at,
       discovery_score,
       discovery_evidence_json,
       last_validated_at,
       last_seen_activity_at
     )
     values ($1, $2, $3, $4, true, 'agent', now(), $5, $6::jsonb, now(), ${validation.latest_upload_date ? "$7" : "null"})
     on conflict (source_type, identifier) do update set
       display_name = excluded.display_name,
       is_active = true,
       origin_type = coalesce(public.trusted_sources.origin_type, 'agent'),
       discovered_at = coalesce(public.trusted_sources.discovered_at, excluded.discovered_at),
       discovery_score = greatest(coalesce(public.trusted_sources.discovery_score, 0), excluded.discovery_score),
       discovery_evidence_json = excluded.discovery_evidence_json,
       last_validated_at = now(),
       last_seen_activity_at = coalesce(excluded.last_seen_activity_at, public.trusted_sources.last_seen_activity_at)
     returning id`,
    validation.latest_upload_date
      ? [
          validation.source_type,
          validation.identifier,
          validation.display_name,
          category.id,
          score,
          JSON.stringify(evidence),
          validation.latest_upload_date,
        ]
      : [
          validation.source_type,
          validation.identifier,
          validation.display_name,
          category.id,
          score,
          JSON.stringify(evidence),
        ],
  );
  return rows[0]?.[0] ?? null;
}

async function suggestSource(category, validation, score, evidence) {
  const payload = {
    type: "SOURCE_ADD",
    origin_type: "agent",
    origin_name: "source-discoverer",
    category_id: category.id,
    payload_json: {
      source_type: validation.source_type,
      identifier: validation.identifier,
      display_name: validation.display_name,
      category_id: category.id,
      discovery_score: score,
      discovery_evidence_json: evidence,
    },
    evidence_json: evidence,
    confidence: Math.max(0, Math.min(1, score / config.autoTrustThreshold)),
  };
  const response = await fetch(`${config.supabaseUrl.replace(/\/+$/, "")}/functions/v1/submit-suggestion`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`submit SOURCE_ADD ${response.status}: ${text}`);
  return JSON.parse(text);
}

async function validateCandidate(candidate) {
  return candidate.source_type === "domain"
    ? validateDomain(candidate)
    : validateYouTube(candidate);
}

async function processCategory(runId, category) {
  const candidates = await queryCandidates(category);
  await persistEvent(runId, "info", "source_candidates_loaded", "Loaded source candidates", {
    category: category.slug,
    candidate_count: candidates.length,
  });

  const results = [];
  for (const candidate of candidates) {
    try {
      const validation = await validateCandidate(candidate);
      if (await sourceAlreadyKnown(validation.source_type, validation.identifier)) {
        await persistEvent(runId, "debug", "source_candidate_known", "Source already trusted", {
          category: category.slug,
          source_type: validation.source_type,
          identifier: validation.identifier,
        });
        results.push({ candidate, validation, action: "known" });
        continue;
      }
      const niche = await nicheMatch(category, validation, candidate);
      const score = scoreCandidate(validation, niche);
      const evidence = {
        original_candidate: candidate,
        followers: validation.followers,
        latest_upload_date: validation.latest_upload_date,
        niche_match: niche,
        score,
      };

      if (score >= config.autoTrustThreshold && niche.match) {
        const sourceId = await autoTrustSource(category, validation, score, evidence);
        await persistEvent(runId, "info", "SOURCE_ADD", "Auto-trusted discovered source", {
          category: category.slug,
          trusted_source_id: sourceId,
          source_type: validation.source_type,
          identifier: validation.identifier,
          display_name: validation.display_name,
          score,
        });
        results.push({ candidate, validation, action: "trusted", score });
      } else if (score >= config.suggestThreshold) {
        const suggestion = await suggestSource(category, validation, score, evidence);
        await persistEvent(runId, "info", "SOURCE_ADD_SUGGESTED", "Submitted source candidate for moderation", {
          category: category.slug,
          suggestion_id: suggestion.suggestion_id,
          duplicate: Boolean(suggestion.duplicate),
          source_type: validation.source_type,
          identifier: validation.identifier,
          display_name: validation.display_name,
          score,
        });
        results.push({ candidate, validation, action: suggestion.duplicate ? "duplicate_suggestion" : "suggested", score });
      } else {
        await persistEvent(runId, "debug", "source_candidate_rejected_score", "Source candidate below score threshold", {
          category: category.slug,
          source_type: validation.source_type,
          identifier: validation.identifier,
          display_name: validation.display_name,
          score,
          niche,
        });
        results.push({ candidate, validation, action: "rejected", score });
      }
    } catch (error) {
      await persistEvent(runId, "warn", "source_candidate_rejected_validation", errorMessage(error), {
        category: category.slug,
        candidate,
      });
      results.push({ candidate, action: "validation_failed", error: errorMessage(error) });
    }
  }
  return results;
}

async function main() {
  await mkdir(config.outputDir, { recursive: true });
  const runId = await startRun();
  const categories = await loadCategories();
  const summary = [];
  try {
    log("info", "source_discovery_started", "Starting weekly source discovery", {
      run_id: runId,
      categories: categories.map((category) => category.slug),
      min_followers: config.minFollowers,
      max_idle_days: config.maxIdleDays,
    });
    for (const category of categories) {
      const results = await processCategory(runId, category);
      summary.push({
        category: category.slug,
        trusted: results.filter((item) => item.action === "trusted").length,
        suggested: results.filter((item) => item.action === "suggested").length,
        known: results.filter((item) => item.action === "known").length,
        rejected: results.filter((item) => item.action?.startsWith("rejected") || item.action === "validation_failed").length,
      });
    }
    const suggestionsCreated = summary.reduce((sum, item) => sum + item.suggested, 0);
    await finishRun(runId, { suggestionsCreated });
    const outputPath = join(config.outputDir, `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    await writeFile(outputPath, JSON.stringify({ ts: new Date().toISOString(), run_id: runId, summary }, null, 2));
    log("info", "source_discovery_finished", "Source discovery finished", { run_id: runId, output: outputPath, summary });
  } catch (error) {
    await persistEvent(runId, "error", "source_discovery_failed", errorMessage(error));
    await finishRun(runId, { status: "failed", errorMessage: errorMessage(error) });
    throw error;
  }
}

main().catch((error) => {
  log("error", "source_discovery_fatal", errorMessage(error));
  process.exit(1);
});
