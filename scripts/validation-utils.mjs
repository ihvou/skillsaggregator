import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const root = resolve(import.meta.dirname, "..");
export const validationDir = resolve(root, ".validation");

export const channels = [
  "UC2cKr3rQwlR2Z6CSNa3Lqlw",
  "UCkzL9CwOJ4ZDSkpb2rj_RIw",
  "UCtuSKlYXWXwlu6_3OYDjVTQ",
  "UCWHtFQg1mOHLXLqM_GFaXgw",
  "UC_kCu9-TFC4jPQXNvmsMcUw",
  "UCvxrFGFY-w5p_Z4OS7yyEhA",
];

export const skills = [
  "Forehand clear",
  "Backhand clear",
  "Forehand smash",
  "Backhand smash",
  "Drop shot",
  "Net shot",
  "Drive",
  "Lift",
  "Push",
  "Serve high",
  "Serve low",
  "Footwork front court",
  "Footwork rear court",
  "Footwork split step",
  "Defense block",
  "Defense lift",
  "Singles strategy",
  "Doubles rotation",
  "Grip technique",
  "Wrist rotation",
  "Stringing and tension",
];

export function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function readJson(path, fallback = null) {
  try {
    return JSON.parse(readFileSync(resolve(root, path), "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(path, value) {
  const fullPath = resolve(root, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, `${JSON.stringify(value, null, 2)}\n`);
}

export function appendValidationRow({ hypothesis, procedure, result, decision }) {
  const path = resolve(root, "docs/hypothesis_validation.md");
  const date = new Date().toISOString().slice(0, 10);
  const clean = (value) => String(value).replace(/\|/g, "/").replace(/\n/g, " ");
  const row = `| ${date} | ${clean(hypothesis)} | ${clean(procedure)} | ${clean(result)} | ${clean(decision)} |`;
  const current = readFileSync(path, "utf8");
  writeFileSync(path, `${current.trimEnd()}\n${row}\n`);
}

export function uploadPlaylistId(channelId) {
  return channelId.startsWith("UC") ? `UU${channelId.slice(2)}` : channelId;
}

export function termsForSkill(skill) {
  return skill
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2 && term !== "badminton");
}

export async function youtubeJson(url) {
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) {
    const reason = payload.error?.errors?.[0]?.reason ?? "unknown";
    throw new Error(`YouTube ${response.status} ${reason}: ${payload.error?.message ?? "request failed"}`);
  }
  return payload;
}
