#!/usr/bin/env node
// One-off: migrate collected catalog data (links + link_skill_relations) from the
// local Supabase DB to the hosted project over the REST API.
//
// Why this shape: the migration-seeded skills/categories have RANDOM uuids, so
// hosted IDs != local IDs. We keep hosted's seeded skills/categories and remap
// link_skill_relations.skill_id local->hosted by slug. links carry no skill FK
// (only contributor_profile_id, which we null since we don't migrate contributors).
import { execFileSync } from "node:child_process";

const HOSTED_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DB = process.env.LOCAL_DB_CONTAINER;
if (!HOSTED_URL || !SERVICE_KEY || !DB) throw new Error("need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LOCAL_DB_CONTAINER");

function localJson(sql) {
  const out = execFileSync("docker", ["exec", DB, "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-c", sql], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return JSON.parse(out.trim() || "[]");
}

// jsonb strip expression for generated columns (can't be inserted via PostgREST)
function stripGen(table) {
  const cols = execFileSync("docker", ["exec", DB, "psql", "-U", "postgres", "-d", "postgres", "-t", "-A", "-c",
    `select coalesce(string_agg(column_name, ','), '') from information_schema.columns where table_schema='public' and table_name='${table}' and is_generated='ALWAYS'`], { encoding: "utf8" }).trim();
  return cols ? cols.split(",").map((c) => ` - '${c}'`).join("") : "";
}

async function restGet(path) {
  const res = await fetch(`${HOSTED_URL}/rest/v1/${path}`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

async function restInsert(table, rows) {
  const BATCH = 100;
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const res = await fetch(`${HOSTED_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json", Prefer: "return=minimal,resolution=merge-duplicates" },
      body: JSON.stringify(batch),
    });
    if (!res.ok) throw new Error(`POST ${table} [${i}..] -> ${res.status} ${(await res.text()).slice(0, 400)}`);
    done += batch.length;
  }
  console.log(`  ${table}: inserted ${done}/${rows.length}`);
}

// 1) hosted skill slug -> id map
const hostedSkills = await restGet("skills?select=id,slug&limit=5000");
const skillMap = new Map(hostedSkills.map((s) => [s.slug, s.id]));
console.log(`hosted skills available: ${hostedSkills.length}`);

// 2) links (contributor_profile_id nulled — we don't migrate contributors/auth.users)
const links = localJson(`select coalesce(json_agg((to_jsonb(l)${stripGen("links")}) || jsonb_build_object('contributor_profile_id', null)), '[]'::json) from links l`);
console.log(`local links: ${links.length}`);
await restInsert("links", links);

// 3) link_skill_relations with skill_id remapped local->hosted by slug
const relsRaw = localJson(`select coalesce(json_agg((to_jsonb(r)${stripGen("link_skill_relations")}) || jsonb_build_object('_slug', s.slug)), '[]'::json) from link_skill_relations r join skills s on s.id = r.skill_id`);
console.log(`local relations: ${relsRaw.length}`);
const missing = new Set();
const rels = relsRaw.map((r) => {
  const slug = r._slug; delete r._slug;
  const hid = skillMap.get(slug);
  if (!hid) { missing.add(slug); return null; }
  r.skill_id = hid;
  return r;
}).filter(Boolean);
if (missing.size) console.log(`  WARN: ${missing.size} slugs missing on hosted, dropped: ${[...missing].slice(0, 10).join(", ")}`);
await restInsert("link_skill_relations", rels);

console.log("migration complete");
