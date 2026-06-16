import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

function unquote(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export async function loadEnvFile(path, { override = false, required = false } = {}) {
  const resolved = resolve(path);
  if (!existsSync(resolved)) {
    if (required) throw new Error(`Env file not found: ${resolved}`);
    return false;
  }

  const body = await readFile(resolved, "utf8");
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!override && process.env[key] !== undefined) continue;
    process.env[key] = unquote(rawValue);
  }
  return true;
}

export async function loadCollectionEnv({ preferHosted = false } = {}) {
  const envFile = process.env.COLLECT_ENV_FILE ?? "apps/web/.env.local";
  await loadEnvFile(envFile, { override: false });

  const target = process.env.COLLECT_TARGET ?? (preferHosted ? "hosted" : "");
  if (target === "hosted" || preferHosted) {
    const hostedEnvFile = process.env.COLLECT_HOSTED_ENV_FILE ?? ".env.hosted";
    await loadEnvFile(hostedEnvFile, { override: true });
    process.env.COLLECT_TARGET = "hosted";
  }

  if ((process.env.COLLECT_TARGET ?? "local") === "local") {
    process.env.SUPABASE_URL ??= process.env.NEXT_PUBLIC_SUPABASE_URL;
  }
}
