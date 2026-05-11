#!/usr/bin/env node

function option(name) {
  const prefix = `--${name}=`;
  const withEquals = process.argv.find((arg) => arg.startsWith(prefix));
  if (withEquals) return withEquals.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")) {
    return process.argv[index + 1];
  }
  return null;
}

function log(level, event, message, metadata = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, message, ...metadata });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function readBody(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

async function main() {
  const email = option("email") ?? process.argv[2];
  if (!email) throw new Error("Usage: node scripts/add-moderator.mjs --email you@example.com");

  const supabaseUrl = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  if (!supabaseUrl) throw new Error("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is required");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };

  log("info", "auth_user_create_started", "Creating confirmed Supabase Auth user", { email });
  const authResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, email_confirm: true }),
  });
  const authBody = await readBody(authResponse);
  if (!authResponse.ok && !/already|registered|exists/i.test(JSON.stringify(authBody))) {
    throw new Error(`Auth user create failed with ${authResponse.status}: ${JSON.stringify(authBody)}`);
  }
  log(authResponse.ok ? "info" : "warn", "auth_user_create_completed", "Auth user is present", {
    email,
    status: authResponse.status,
  });

  log("info", "moderator_upsert_started", "Upserting public moderator row", { email });
  const moderatorUrl = new URL(`${supabaseUrl}/rest/v1/moderators`);
  moderatorUrl.searchParams.set("on_conflict", "email");
  const moderatorResponse = await fetch(moderatorUrl, {
    method: "POST",
    headers: {
      ...headers,
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify([{ email, is_active: true }]),
  });
  const moderatorBody = await readBody(moderatorResponse);
  if (!moderatorResponse.ok) {
    throw new Error(`Moderator upsert failed with ${moderatorResponse.status}: ${JSON.stringify(moderatorBody)}`);
  }
  log("info", "moderator_upsert_completed", "Moderator login is ready", { email });
}

main().catch((error) => {
  log("error", "add_moderator_failed", "Could not add moderator", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
