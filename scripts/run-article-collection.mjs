#!/usr/bin/env node

import * as cheerio from "cheerio";

const DEFAULT_DOMAINS = ["badmintonbites.com", "badmintonfamly.com", "badmintonpassion.com"];

function option(name, fallback = null) {
  const prefix = `--${name}=`;
  const withEquals = process.argv.find((arg) => arg.startsWith(prefix));
  if (withEquals) return withEquals.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) {
    return process.argv[index + 1];
  }
  return fallback;
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function envList(name, fallback) {
  const value = process.env[name];
  if (!value) return fallback;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberOption(name, fallback) {
  const value = option(name, process.env[name.toUpperCase().replaceAll("-", "_")]);
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function log(level, event, message, metadata = {}) {
  const line = {
    ts: new Date().toISOString(),
    level,
    event,
    message,
    ...metadata,
  };
  const text = JSON.stringify(line);
  if (level === "error") console.error(text);
  else if (level === "warn") console.warn(text);
  else console.log(text);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function baseDomain(domain) {
  return domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
}

function originForDomain(domain) {
  const normalized = baseDomain(domain);
  return `https://${normalized}`;
}

function canonicalizeUrl(rawUrl, baseUrl) {
  try {
    const parsed = new URL(rawUrl, baseUrl);
    parsed.hash = "";
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (key.startsWith("utm_") || key === "fbclid" || key === "gclid") parsed.searchParams.delete(key);
    }
    parsed.pathname = parsed.pathname.replace(/\/{2,}/g, "/");
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function looksLikeArticleUrl(url, domain) {
  try {
    const parsed = new URL(url);
    const host = baseDomain(parsed.hostname);
    if (host !== baseDomain(domain)) return false;
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    if (parsed.pathname === "/" || parsed.pathname.length < 2) return false;
    if (/\.(jpg|jpeg|png|gif|svg|webp|pdf|zip|mp4|mp3|xml)$/i.test(parsed.pathname)) return false;
    if (/\/(tag|tags|category|categories|author|page|feed|wp-json|cart|shop|account)\b/i.test(parsed.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

async function fetchText(url, { timeoutMs = 20_000, headers = {} } = {}) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    log("debug", "fetch_started", "Fetching remote URL", { url, timeout_ms: timeoutMs });
    const response = await fetch(url, {
      headers: {
        "User-Agent": "skillsaggregator-article-collector/0.1",
        Accept: "text/html,application/xml,text/xml,application/rss+xml,*/*;q=0.8",
        ...headers,
      },
      signal: controller.signal,
    });
    const text = await response.text();
    log(response.ok ? "debug" : "warn", "fetch_completed", "Remote fetch completed", {
      url,
      status: response.status,
      ok: response.ok,
      bytes: text.length,
      duration_ms: Date.now() - startedAt,
    });
    if (!response.ok) return null;
    return text;
  } catch (error) {
    log("warn", "fetch_failed", "Remote fetch failed", {
      url,
      duration_ms: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractUrlsFromXml(xml, baseUrl) {
  const $ = cheerio.load(xml, { xmlMode: true });
  const urls = new Set();

  $("url > loc, sitemap > loc").each((_, node) => {
    const url = canonicalizeUrl($(node).text().trim(), baseUrl);
    if (url) urls.add(url);
  });

  $("item > link").each((_, node) => {
    const url = canonicalizeUrl($(node).text().trim(), baseUrl);
    if (url) urls.add(url);
  });

  $("entry > link").each((_, node) => {
    const href = $(node).attr("href") ?? $(node).text();
    const url = canonicalizeUrl(href.trim(), baseUrl);
    if (url) urls.add(url);
  });

  return Array.from(urls);
}

function extractLinksFromHtml(html, baseUrl) {
  const $ = cheerio.load(html);
  const urls = new Set();
  $("a[href]").each((_, node) => {
    const url = canonicalizeUrl($(node).attr("href") ?? "", baseUrl);
    if (url) urls.add(url);
  });
  return Array.from(urls);
}

async function collectDomainUrls(domain, maxPerDomain) {
  const origin = originForDomain(domain);
  const feedUrls = [
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
    `${origin}/post-sitemap.xml`,
    `${origin}/feed`,
    `${origin}/rss`,
    `${origin}/blog/feed`,
    `${origin}/?feed=rss2`,
  ];
  const discovered = new Set();
  const sitemapChildren = [];

  for (const feedUrl of feedUrls) {
    const text = await fetchText(feedUrl);
    if (!text) continue;
    const urls = extractUrlsFromXml(text, origin);
    for (const url of urls) {
      if (url.endsWith(".xml")) sitemapChildren.push(url);
      else if (looksLikeArticleUrl(url, domain)) discovered.add(url);
    }
    log("info", "feed_scanned", "Scanned feed or sitemap", {
      domain,
      feed_url: feedUrl,
      extracted_urls: urls.length,
      accepted_urls: discovered.size,
      child_sitemaps: sitemapChildren.length,
    });
    if (discovered.size >= maxPerDomain) break;
  }

  for (const sitemapUrl of sitemapChildren.slice(0, 6)) {
    if (discovered.size >= maxPerDomain) break;
    const text = await fetchText(sitemapUrl);
    if (!text) continue;
    const urls = extractUrlsFromXml(text, origin).filter((url) => looksLikeArticleUrl(url, domain));
    for (const url of urls) discovered.add(url);
    log("info", "child_sitemap_scanned", "Scanned child sitemap", {
      domain,
      sitemap_url: sitemapUrl,
      extracted_urls: urls.length,
      accepted_urls: discovered.size,
    });
  }

  if (discovered.size === 0) {
    const html = await fetchText(origin);
    if (html) {
      const urls = extractLinksFromHtml(html, origin).filter((url) => looksLikeArticleUrl(url, domain));
      for (const url of urls) discovered.add(url);
      log("info", "homepage_links_scanned", "Scanned homepage links as fallback", {
        domain,
        extracted_urls: urls.length,
        accepted_urls: discovered.size,
      });
    }
  }

  const urls = Array.from(discovered).slice(0, maxPerDomain);
  log("info", "domain_url_collection_completed", "Finished URL discovery for trusted domain", {
    domain,
    url_count: urls.length,
  });
  return urls;
}

function cleanText(value) {
  return value.replace(/\s+/g, " ").trim();
}

async function scrapeArticle(url) {
  const html = await fetchText(url);
  if (!html) return null;
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, nav, header, footer, form, aside").remove();

  const canonicalUrl = canonicalizeUrl($('link[rel="canonical"]').attr("href") ?? url, url) ?? url;
  const title = cleanText(
    $('meta[property="og:title"]').attr("content") ??
      $("h1").first().text() ??
      $("title").first().text() ??
      "",
  );
  const description = cleanText(
    $('meta[name="description"]').attr("content") ??
      $('meta[property="og:description"]').attr("content") ??
      "",
  );
  const body = cleanText(
    $("article").first().text() ||
      $("main").first().text() ||
      $('[role="main"]').first().text() ||
      $("body").text(),
  );

  if (!title || body.length < 400) {
    log("warn", "article_skipped_insufficient_content", "Article page did not expose enough readable content", {
      url,
      title_present: Boolean(title),
      body_chars: body.length,
    });
    return null;
  }

  const article = {
    url,
    canonical_url: canonicalUrl,
    domain: baseDomain(new URL(canonicalUrl).hostname),
    title: title.slice(0, 220),
    description: description.slice(0, 500),
    excerpt: body.slice(0, 3000),
    body_chars: body.length,
  };
  log("info", "article_scraped", "Scraped article content", {
    url,
    canonical_url: article.canonical_url,
    title: article.title,
    body_chars: article.body_chars,
  });
  return article;
}

async function supabaseRest(path, params = new URLSearchParams()) {
  const supabaseUrl = requireEnv("SUPABASE_URL").replace(/\/+$/, "");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const url = new URL(`${supabaseUrl}/rest/v1/${path}`);
  for (const [key, value] of params) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  const payload = await response.text();
  if (!response.ok) throw new Error(`Supabase REST ${path} failed with ${response.status}: ${payload}`);
  return payload ? JSON.parse(payload) : null;
}

async function loadTrustedDomains() {
  try {
    const params = new URLSearchParams({
      select: "identifier,display_name,category_id",
      source_type: "eq.domain",
      is_active: "eq.true",
      order: "identifier.asc",
    });
    const rows = await supabaseRest("trusted_sources", params);
    if (Array.isArray(rows) && rows.length > 0) {
      log("info", "trusted_domains_loaded", "Loaded trusted domains from Supabase", {
        domains: rows.map((row) => row.identifier),
      });
      return rows.map((row) => row.identifier);
    }
  } catch (error) {
    log("warn", "trusted_domains_fallback", "Could not load trusted domains from Supabase; using defaults", {
      error: error instanceof Error ? error.message : String(error),
      defaults: DEFAULT_DOMAINS,
    });
  }
  return DEFAULT_DOMAINS;
}

async function loadSkills(skillSlugs, skillLimit) {
  const params = new URLSearchParams({
    select: "id,slug,name,description,category_id",
    is_active: "eq.true",
    order: "slug.asc",
  });
  const rows = await supabaseRest("skills", params);
  const filtered = (rows ?? []).filter((skill) => skillSlugs.length === 0 || skillSlugs.includes(skill.slug));
  const selected = filtered.slice(0, skillLimit);
  log("info", "skills_loaded", "Loaded skills for article scoring", {
    requested_slugs: skillSlugs,
    total_active_skills: rows?.length ?? 0,
    selected_skills: selected.map((skill) => skill.slug),
  });
  return selected;
}

function renderArticleScorePrompt(skill, article) {
  const system = [
    "You evaluate a candidate learning resource against a sub-skill.",
    "",
    "Return JSON with schema:",
    "{",
    '  "relevance": number,',
    '  "teaching_quality": number,',
    '  "demo_vs_talk": number,',
    '  "level": "beginner"|"intermediate"|"advanced",',
    '  "public_note": string,',
    '  "evidence_quote": string',
    "}",
    "",
    "Rules:",
    "- if the article does not actually teach the sub-skill, set relevance < 0.4",
    "- be strict on teaching_quality; listicles, thin SEO, and vague advice = low",
    "- if uncertain, prefer lower scores",
  ].join("\n");
  const user = [
    "INPUT:",
    `sub_skill: "${skill.name}"`,
    `sub_skill_description: "${skill.description ?? ""}"`,
    `candidate_title: "${article.title}"`,
    `candidate_domain: "${article.domain}"`,
    `article_description: "${article.description ?? ""}"`,
    `article_excerpt: "${article.excerpt}"`,
  ].join("\n");
  return [`SYSTEM: ${system}`, "", user].join("\n");
}

function parseJsonObject(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Ollama response did not contain JSON");
  return JSON.parse(match[0]);
}

function clamp01(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(1, parsed));
}

function normalizeScore(raw) {
  const levels = new Set(["beginner", "intermediate", "advanced"]);
  return {
    relevance: clamp01(raw.relevance),
    teaching_quality: clamp01(raw.teaching_quality),
    demo_vs_talk: clamp01(raw.demo_vs_talk),
    level: levels.has(raw.level) ? raw.level : "beginner",
    public_note: String(raw.public_note ?? "").slice(0, 140) || "Relevant article resource.",
    evidence_quote: String(raw.evidence_quote ?? "").slice(0, 200) || "No direct quote returned.",
  };
}

async function scoreArticleWithOllama(skill, article, ollamaBaseUrl, ollamaModel) {
  const startedAt = Date.now();
  const prompt = renderArticleScorePrompt(skill, article);
  log("debug", "ollama_score_started", "Scoring article with local Ollama", {
    skill_slug: skill.slug,
    article_url: article.canonical_url,
    model: ollamaModel,
  });
  const response = await fetch(`${ollamaBaseUrl.replace(/\/+$/, "")}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ollamaModel,
      prompt,
      stream: false,
      format: "json",
      options: { temperature: 0 },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Ollama scoring failed with ${response.status}: ${JSON.stringify(payload).slice(0, 500)}`);
  }
  const score = normalizeScore(parseJsonObject(payload.response ?? "{}"));
  log("info", "ollama_score_completed", "Finished local Stage 2 score", {
    skill_slug: skill.slug,
    article_url: article.canonical_url,
    relevance: score.relevance,
    teaching_quality: score.teaching_quality,
    demo_vs_talk: score.demo_vs_talk,
    level: score.level,
    prompt_eval_count: payload.prompt_eval_count ?? null,
    eval_count: payload.eval_count ?? null,
    duration_ms: Date.now() - startedAt,
  });
  return score;
}

async function submitSuggestion(skill, article, score, dryRun) {
  const supabaseUrl = requireEnv("SUPABASE_URL").replace(/\/+$/, "");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const functionsUrl = (process.env.SUPABASE_FUNCTIONS_URL ?? `${supabaseUrl}/functions/v1`).replace(/\/+$/, "");
  const payload = {
    type: "LINK_ADD",
    status: "pending",
    requested_status: "pending",
    origin_type: "agent",
    origin_name: "article-collector",
    category_id: skill.category_id,
    skill_id: skill.id,
    payload_json: {
      url: article.url,
      canonical_url: article.canonical_url,
      domain: article.domain,
      title: article.title,
      description: article.description,
      content_type: "article",
      language: "en",
      target_skill_id: skill.id,
      public_note: score.public_note,
      skill_level: score.level,
    },
    evidence_json: {
      source: "trusted_domain_article",
      article_domain: article.domain,
      article_title: article.title,
      score,
      article_excerpt: article.excerpt.slice(0, 800),
      evidence_quote: score.evidence_quote,
    },
    confidence: Math.min(score.relevance, score.teaching_quality),
  };

  if (dryRun) {
    log("info", "suggestion_dry_run", "Dry run skipped submit-suggestion POST", {
      skill_slug: skill.slug,
      article_url: article.canonical_url,
      payload,
    });
    return { suggestion_id: null, duplicate: false, status: "dry_run" };
  }

  const response = await fetch(`${functionsUrl}/submit-suggestion`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(payload),
  });
  const resultText = await response.text();
  let result = {};
  try {
    result = resultText ? JSON.parse(resultText) : {};
  } catch {
    result = { raw: resultText };
  }
  if (!response.ok) {
    throw new Error(`submit-suggestion failed with ${response.status}: ${resultText}`);
  }
  log("info", "suggestion_submitted", "Submitted article suggestion", {
    skill_slug: skill.slug,
    article_url: article.canonical_url,
    suggestion_id: result.suggestion_id ?? null,
    duplicate: Boolean(result.duplicate),
    status: result.status ?? null,
  });
  return result;
}

async function main() {
  const dryRun = flag("dry-run");
  const ollamaBaseUrl = option("ollama-url", process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434");
  const ollamaModel = option("model", process.env.OLLAMA_MODEL ?? "qwen2.5:7b");
  const maxPerDomain = numberOption("max-per-domain", Number(process.env.ARTICLE_MAX_PER_DOMAIN ?? 12));
  const maxArticles = numberOption("max-articles", Number(process.env.ARTICLE_MAX_ARTICLES ?? 30));
  const skillLimit = numberOption("skill-limit", Number(process.env.ARTICLE_SKILL_LIMIT ?? 21));
  const maxSuggestions = numberOption("max-suggestions", Number(process.env.ARTICLE_MAX_SUGGESTIONS ?? 25));
  const relevanceThreshold = Number(process.env.STAGE2_RELEVANCE_THRESHOLD ?? 0.7);
  const qualityThreshold = Number(process.env.STAGE2_QUALITY_THRESHOLD ?? 0.6);
  const cliSkill = option("skill");
  const skillSlugs = envList("ARTICLE_SKILL_SLUGS", cliSkill ? [cliSkill] : []);
  const configuredDomains = envList("ARTICLE_DOMAINS", null);
  const domains = configuredDomains ?? (await loadTrustedDomains());

  log("info", "article_collection_started", "Starting trusted article collection", {
    dry_run: dryRun,
    domains,
    max_per_domain: maxPerDomain,
    max_articles: maxArticles,
    skill_limit: skillLimit,
    max_suggestions: maxSuggestions,
    relevance_threshold: relevanceThreshold,
    quality_threshold: qualityThreshold,
    ollama_url: ollamaBaseUrl,
    ollama_model: ollamaModel,
  });

  const skills = await loadSkills(skillSlugs, skillLimit);
  if (skills.length === 0) throw new Error("No active skills selected for article scoring");

  const urls = [];
  for (const domain of domains) {
    const domainUrls = await collectDomainUrls(domain, maxPerDomain);
    for (const url of domainUrls) {
      if (!urls.includes(url)) urls.push(url);
      if (urls.length >= maxArticles) break;
    }
    if (urls.length >= maxArticles) break;
  }

  let scraped = 0;
  let scored = 0;
  let suggestionsSubmitted = 0;
  let duplicates = 0;

  for (const url of urls) {
    if (suggestionsSubmitted >= maxSuggestions) break;
    const article = await scrapeArticle(url);
    if (!article) continue;
    scraped += 1;

    for (const skill of skills) {
      if (suggestionsSubmitted >= maxSuggestions) break;
      try {
        const score = await scoreArticleWithOllama(skill, article, ollamaBaseUrl, ollamaModel);
        scored += 1;
        if (score.relevance < relevanceThreshold || score.teaching_quality < qualityThreshold) {
          log("debug", "article_rejected_threshold", "Article score failed configured thresholds", {
            skill_slug: skill.slug,
            article_url: article.canonical_url,
            relevance: score.relevance,
            teaching_quality: score.teaching_quality,
            relevance_threshold: relevanceThreshold,
            quality_threshold: qualityThreshold,
          });
          continue;
        }
        const result = await submitSuggestion(skill, article, score, dryRun);
        if (result.duplicate) duplicates += 1;
        else suggestionsSubmitted += 1;
      } catch (error) {
        log("warn", "article_skill_processing_failed", "Failed to score or submit article for skill", {
          skill_slug: skill.slug,
          article_url: article.canonical_url,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  log("info", "article_collection_completed", "Trusted article collection finished", {
    discovered_urls: urls.length,
    scraped_articles: scraped,
    score_calls: scored,
    suggestions_submitted: suggestionsSubmitted,
    duplicates,
    dry_run: dryRun,
  });
}

main().catch((error) => {
  log("error", "article_collection_failed", "Trusted article collection failed", {
    error: error instanceof Error ? error.stack ?? error.message : String(error),
  });
  process.exitCode = 1;
});
