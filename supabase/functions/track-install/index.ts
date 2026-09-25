/**
 * Records one row in public.app_installs the first time an app is launched.
 *
 * WHY THIS IS A FUNCTION AND NOT A CLIENT INSERT. The anonymous Supabase user is
 * created lazily on first real action (M120), so a user who installs, opens the
 * app and never acts has no identity — and app_events' RLS policy only accepts
 * inserts from an authenticated user writing their own row. Those people were
 * therefore completely invisible, which is what made every funnel rate near 100%.
 *
 * Letting `anon` insert into app_installs directly would fix that too, but it
 * would mean an unauthenticated write path on a public table — exactly the shape
 * of the 2026-09-16 exposure that 0062 was written to close. So the table stays
 * service-role-only and this function is the single door, with the same IP rate
 * limit the public suggestion path uses.
 *
 * Deliberately says nothing about the device: the id is a random uuid the client
 * generates and keeps in local storage. No IDFV, no advertising id, nothing that
 * survives a reinstall — which keeps the store listing's "nothing about you is
 * sold or shared" true, at the cost of counting first launches rather than store
 * installs.
 */
import { getServiceClient } from "../_shared/supabase.ts";
import {
  corsForbiddenResponse,
  errorResponse,
  isAllowedCorsOrigin,
  jsonResponse,
  optionsResponse,
  readJson,
} from "../_shared/responses.ts";

// Generous: one device legitimately calls this once, but a shared NAT (a gym's
// wifi, a university) can carry many real first launches in a day.
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_SECONDS = 3600;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLATFORMS = new Set(["ios", "android", "web"]);

// How the build was distributed. `app_store` covers TestFlight too: both ship
// without an embedded provisioning profile, which is all expo-application can
// read. Enough to separate our own launches from real ones, not enough to match
// App Store Connect exactly.
const RELEASE_TYPES = new Set([
  "app_store",
  "ad_hoc",
  "enterprise",
  "development",
  "simulator",
  "unknown",
]);

type Payload = {
  install_id?: unknown;
  platform?: unknown;
  app_version?: unknown;
  release_type?: unknown;
};

function clientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    request.headers.get("cf-connecting-ip") ??
    forwardedFor ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return optionsResponse(request);
  if (!isAllowedCorsOrigin(request)) return corsForbiddenResponse(request);
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, request);

  try {
    const body = await readJson<Payload>(request);

    const installId = typeof body.install_id === "string" ? body.install_id.trim() : "";
    if (!UUID_RE.test(installId)) {
      return jsonResponse({ error: "install_id must be a uuid" }, 400, request);
    }

    const platform = typeof body.platform === "string" && PLATFORMS.has(body.platform)
      ? body.platform
      : null;
    const appVersion = typeof body.app_version === "string" && body.app_version.length <= 32
      ? body.app_version
      : null;
    const releaseType = typeof body.release_type === "string" && RELEASE_TYPES.has(body.release_type)
      ? body.release_type
      : null;

    const supabase = getServiceClient();

    // Namespaced key. check_suggest_rate_limit stores one counter per IP in
    // suggest_rate_limits, so calling it with the bare IP put install pings in the
    // same bucket submit-suggestion checks against its own ceiling of 10/hour:
    // ten first launches behind one NAT would have blocked a real suggestion for
    // an hour, and suggestions would silently eat the install budget.
    const { data: limit, error: limitError } = await supabase.rpc("check_suggest_rate_limit", {
      p_ip: `install:${clientIp(request)}`,
      p_limit: RATE_LIMIT_MAX,
      p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    }).single();
    if (limitError) throw limitError;
    if (limit && (limit as { allowed: boolean }).allowed === false) {
      // 200, not 429: a failed install ping must never be something the user can
      // notice. `stored: false` is what tells the client to try again next launch.
      console.warn("track_install_rate_limited", { ip: clientIp(request) });
      return jsonResponse({ ok: true, stored: false, inserted: false, reason: "rate_limited" }, 200, request);
    }

    // first_seen_at is left to the column default so the server clock decides the
    // cohort. ignoreDuplicates keeps a re-send from moving an existing install's
    // date — the client retries until confirmed and the id is stable.
    const { data: insertedRows, error } = await supabase
      .from("app_installs")
      .upsert(
        { install_id: installId, platform, app_version: appVersion, release_type: releaseType },
        { onConflict: "install_id", ignoreDuplicates: true },
      )
      .select("install_id");
    if (error) throw error;

    // `stored` answers the only question the client has: is this install on the
    // server, so it can stop pinging? An ignored duplicate returns no row, which
    // is success too — confirmed with a read rather than inferred, so the client
    // never retries forever because of a PostgREST detail.
    const inserted = (insertedRows?.length ?? 0) > 0;
    let stored = inserted;
    if (!stored) {
      const { data: existing, error: readError } = await supabase
        .from("app_installs")
        .select("install_id")
        .eq("install_id", installId)
        .maybeSingle();
      if (readError) throw readError;
      stored = Boolean(existing);
    }

    console.info("track_install_recorded", {
      platform,
      app_version: appVersion,
      release_type: releaseType,
      inserted,
    });
    return jsonResponse({ ok: true, stored, inserted }, 200, request);
  } catch (error) {
    console.error("track_install_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return errorResponse(error, 500, request);
  }
});
