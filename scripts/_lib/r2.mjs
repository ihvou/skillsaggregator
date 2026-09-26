/**
 * Cloudflare R2, through its S3-compatible API, for the web thumbnails
 * (scripts/rehost-thumbnails.mjs). Only PUT is needed, signed with AWS Signature
 * Version 4. Written out here rather than pulled in as an SDK: it is one request
 * type, and the nightly scripts run from the repo's node_modules as they are.
 *
 * Credentials come from .env.hosted and never leave this process:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 */
import { createHash, createHmac } from "node:crypto";

function sha256Hex(data) {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key, data) {
  return createHmac("sha256", key).update(data).digest();
}

// S3's canonical URI: each path segment percent-encoded once, per RFC 3986.
function canonicalPath(pathname) {
  return pathname
    .split("/")
    .map((segment) =>
      encodeURIComponent(decodeURIComponent(segment)).replace(
        /[!'()*]/g,
        (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join("/");
}

function canonicalQuery(searchParams) {
  const encode = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return [...searchParams.entries()]
    .map(([key, value]) => [encode(key), encode(value)])
    .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : x > y ? 1 : 0) : a < b ? -1 : 1))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

/**
 * Headers for a SigV4-signed request, `authorization` included. `host` is part of
 * the signature but is returned separately: fetch sets it from the URL itself.
 */
export function signRequest({
  method,
  url,
  headers = {},
  body = "",
  accessKeyId,
  secretAccessKey,
  region = "auto",
  service = "s3",
  date = new Date(),
}) {
  const parsed = new URL(url);
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const lowered = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), String(value)]));
  const payloadHash = lowered["x-amz-content-sha256"] ?? sha256Hex(body);
  const signed = { ...lowered, host: parsed.host, "x-amz-date": amzDate, "x-amz-content-sha256": payloadHash };
  const names = Object.keys(signed).sort();
  const canonicalHeaders = names.map((name) => `${name}:${signed[name].trim().replace(/\s+/g, " ")}\n`).join("");
  const signedHeaders = names.join(";");
  const canonicalRequest = [
    method.toUpperCase(),
    canonicalPath(parsed.pathname),
    canonicalQuery(parsed.searchParams),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), service), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const { host: _host, ...rest } = signed;
  return {
    ...rest,
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

/** The R2 settings from the environment, or null when any is missing. */
export function r2ConfigFromEnv(env = process.env) {
  const accountId = env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = env.R2_BUCKET?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { endpoint: `https://${accountId}.r2.cloudflarestorage.com`, bucket, accessKeyId, secretAccessKey };
}

/** Uploads `body` to `key`. Same key and same bytes is a harmless overwrite. */
export async function putObject(config, key, body, { contentType, cacheControl }) {
  const url = `${config.endpoint}/${config.bucket}/${key}`;
  const headers = signRequest({
    method: "PUT",
    url,
    body,
    headers: { "content-type": contentType, "cache-control": cacheControl },
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  });
  const response = await fetch(url, { method: "PUT", headers, body, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    throw new Error(`r2_put_failed_${response.status}${detail ? `: ${detail}` : ""}`);
  }
}
