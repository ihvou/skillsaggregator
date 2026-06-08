#!/usr/bin/env node
/**
 * Extract YouTube cookies from Arc and write them as a Netscape-format cookies.txt
 * that yt-dlp can consume via `--cookies <file>`.
 *
 * Why this script exists:
 *   yt-dlp's --cookies-from-browser supports Chromium-family browsers but
 *   looks up the cookie-encryption key under the hard-coded entry name
 *   "Chrome Safe Storage". Arc stores its key as "Arc Safe Storage", so the
 *   lookup misses and yt-dlp silently returns only un-encrypted cookies
 *   (no YouTube auth tokens). This script does the lookup explicitly under
 *   the right name, decrypts Arc's Chromium v10 cookies, and dumps a file
 *   that bypasses Keychain at agent runtime.
 *
 * Usage:
 *   node scripts/grab-arc-cookies.mjs            # default profile, default output path
 *   node scripts/grab-arc-cookies.mjs --profile "Profile 1" --out path/to/cookies.txt
 *
 * Runs interactively the first time — macOS will prompt for Keychain access
 * to the "Arc Safe Storage" entry. Grant "Always Allow" to make subsequent
 * runs (re-export when YouTube auth expires, ~monthly) silent.
 *
 * No npm deps: built-in `crypto` + `sqlite3` CLI + `security` CLI only.
 */
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { createHash, pbkdf2Sync, createDecipheriv } from "node:crypto";
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const execFileP = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------- CLI args ----------
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")) {
    return process.argv[i + 1];
  }
  return fallback;
}

const config = {
  profile: arg("profile", "Default"),
  arcUserData: arg(
    "arc-user-data",
    join(homedir(), "Library", "Application Support", "Arc", "User Data"),
  ),
  keychainService: arg("keychain", "Arc Safe Storage"),
  out: arg("out", join(ROOT, ".collection", "youtube-cookies.txt")),
  // Comma-separated list of host suffixes to include. YouTube's get_transcript
  // precondition checks identity signals across both youtube.com AND google.com
  // (the accounts/oauth cookies live on .google.com). Exporting only youtube.com
  // cookies passes basic SAPISID auth but fails the cross-domain precondition.
  domainMatch: arg("domain", "youtube.com,google.com"),
};

// ---------- Chromium v10 decryption ----------
// Cookies whose value starts with "v10" are AES-128-CBC encrypted using a key
// derived from the Keychain entry via PBKDF2(salt="saltysalt", iter=1003, len=16).
// IV is 16 bytes of 0x20 (space). PKCS7 padding.
const SALT = "saltysalt";
const ITER = 1003;
const KEY_LEN = 16;
const IV = Buffer.alloc(16, 0x20);

function deriveKey(keychainPassword) {
  return pbkdf2Sync(keychainPassword, SALT, ITER, KEY_LEN, "sha1");
}

function decryptV10(blob, key) {
  if (blob.length < 3) return null;
  const prefix = blob.slice(0, 3).toString("utf8");
  if (prefix !== "v10") {
    // v11+ (Linux gnome keyring, irrelevant here) or unencrypted — skip.
    return null;
  }
  const cipher = blob.slice(3);
  const dec = createDecipheriv("aes-128-cbc", key, IV);
  dec.setAutoPadding(true);
  let plain;
  try {
    plain = Buffer.concat([dec.update(cipher), dec.final()]);
  } catch {
    return null;
  }
  // Chromium 116+ prepends a 32-byte SHA-256 host hash to the plaintext as an
  // integrity / domain-binding check. The actual cookie value starts at byte 32.
  // Older v10 cookies don't have this prefix — detect by checking whether the
  // first 32 bytes are printable ASCII (cookie value) or binary (hash).
  if (plain.length > 32) {
    const head = plain.slice(0, 32);
    let printableHeadCount = 0;
    for (const byte of head) {
      // Printable ASCII (0x20–0x7E) or tab
      if ((byte >= 0x20 && byte <= 0x7e) || byte === 0x09) printableHeadCount += 1;
    }
    // If >80% of the first 32 bytes are non-printable, it's a host hash — strip it.
    if (printableHeadCount < 26) {
      plain = plain.slice(32);
    }
  }
  return plain.toString("utf8");
}

// ---------- Keychain access ----------
function fetchKeychainPassword(service) {
  try {
    // -s matches service name (not account; Chromium-family entries set
    // acct="Arc" but svce="Arc Safe Storage"). -w outputs only the password.
    const out = execFileSync(
      "/usr/bin/security",
      ["find-generic-password", "-w", "-s", service],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return out.replace(/\n$/, "");
  } catch (error) {
    const stderr = error?.stderr?.toString?.() ?? "";
    if (stderr.includes("could not be found")) {
      throw new Error(`Keychain entry "${service}" not found. Is Arc installed?`);
    }
    if (error.status === 51) {
      throw new Error(
        `Keychain access to "${service}" was denied. Run again and click "Always Allow" in the prompt, or check Keychain Access.app.`,
      );
    }
    throw error;
  }
}

// ---------- SQLite read ----------
async function readCookieRows(dbPath, domainMatch) {
  // Use a temp copy of the SQLite DB so we don't fight Arc for the file lock if Arc is running.
  const tmpDb = join(tmpdir(), `arc-cookies-${Date.now()}.db`);
  copyFileSync(dbPath, tmpDb);
  try {
    // Hex-encode the encrypted_value BLOB so binary 0x0a / separator bytes in the
    // ciphertext don't break our row/column split. Multi-char "|||" is safe — cookie
    // names + paths + hex strings don't contain "|||".
    const sep = "|||";
    const domains = domainMatch.split(",").map((d) => d.trim()).filter(Boolean);
    const whereClause = domains
      .map((d) => `host_key LIKE '%${d.replace(/'/g, "''")}%'`)
      .join(" OR ");
    const sql = `
      SELECT host_key, path, name, value, hex(encrypted_value), expires_utc, is_secure, is_httponly, has_expires
      FROM cookies
      WHERE ${whereClause};
    `;
    const { stdout } = await execFileP("/usr/bin/sqlite3", [tmpDb, "-separator", sep, sql], {
      maxBuffer: 32 * 1024 * 1024,
      encoding: "utf8",
    });
    return stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const cols = line.split(sep);
        return {
          host_key: cols[0],
          path: cols[1],
          name: cols[2],
          value: cols[3],
          encrypted_value: Buffer.from(cols[4] ?? "", "hex"),
          expires_utc: BigInt(cols[5] || "0"),
          is_secure: cols[6] === "1",
          is_httponly: cols[7] === "1",
          has_expires: cols[8] === "1",
        };
      });
  } finally {
    try { execFileSync("/bin/rm", ["-f", tmpDb]); } catch { /* ignore */ }
  }
}

// ---------- Time conversion ----------
// Chromium stores time as microseconds since 1601-01-01 UTC.
// Netscape format wants Unix epoch seconds (0 for session cookies).
const CHROMIUM_EPOCH_DIFF_MICROS = 11644473600000000n;
function chromiumToUnix(chromiumMicros) {
  if (chromiumMicros === 0n) return 0;
  const unixMicros = chromiumMicros - CHROMIUM_EPOCH_DIFF_MICROS;
  if (unixMicros < 0n) return 0;
  return Number(unixMicros / 1000000n);
}

// ---------- Netscape format writer ----------
function netscapeLine(row, plainValue) {
  const host = row.host_key.startsWith(".") ? row.host_key : `.${row.host_key}`;
  const includeSubdomains = host.startsWith(".") ? "TRUE" : "FALSE";
  const path = row.path || "/";
  const secure = row.is_secure ? "TRUE" : "FALSE";
  const expires = row.has_expires ? chromiumToUnix(row.expires_utc) : 0;
  // yt-dlp tolerates HttpOnly cookies prefixed with #HttpOnly_ per Netscape conventions
  const prefix = row.is_httponly ? "#HttpOnly_" : "";
  return [
    `${prefix}${host}`,
    includeSubdomains,
    path,
    secure,
    String(expires),
    row.name,
    plainValue,
  ].join("\t");
}

// ---------- Main ----------
async function main() {
  const dbPath = join(config.arcUserData, config.profile, "Cookies");
  if (!existsSync(dbPath)) {
    console.error(`Cookies DB not found at ${dbPath}. Use --profile if you have multiple Arc profiles.`);
    process.exit(2);
  }

  console.log(`Reading Arc cookies for ${config.domainMatch} from ${dbPath}`);
  console.log("  → fetching Keychain password (Keychain may prompt the first time)…");
  const password = fetchKeychainPassword(config.keychainService);
  const key = deriveKey(password);

  const rows = await readCookieRows(dbPath, config.domainMatch);
  console.log(`  → read ${rows.length} cookie rows matching '${config.domainMatch}'`);

  const lines = [
    "# Netscape HTTP Cookie File",
    `# Exported from Arc by scripts/grab-arc-cookies.mjs at ${new Date().toISOString()}`,
    `# Domain filter: ${config.domainMatch}`,
    "",
  ];
  let decryptedCount = 0;
  let skippedCount = 0;
  let plainCount = 0;
  for (const row of rows) {
    // Filter rows that lost their name during DB roundtrip (sqlite3 NULL handling
    // can produce these for tracking cookies with weird schemas).
    if (!row.name || !row.host_key) {
      skippedCount += 1;
      continue;
    }
    let value;
    if (row.encrypted_value && row.encrypted_value.length > 0) {
      const plain = decryptV10(row.encrypted_value, key);
      if (plain === null) {
        skippedCount += 1;
        continue;
      }
      value = plain;
      decryptedCount += 1;
    } else if (row.value) {
      value = row.value;
      plainCount += 1;
    } else {
      skippedCount += 1;
      continue;
    }
    // Reject values containing non-printable bytes that would break HTTP header
    // encoding (yt-dlp uses latin-1 for cookies — non-ASCII chokes the requests lib).
    let isClean = true;
    for (let i = 0; i < value.length; i += 1) {
      const code = value.charCodeAt(i);
      if (code > 0x7e || (code < 0x20 && code !== 0x09)) { isClean = false; break; }
    }
    if (!isClean) {
      skippedCount += 1;
      continue;
    }
    lines.push(netscapeLine(row, value));
  }
  lines.push("");

  mkdirSync(dirname(config.out), { recursive: true });
  writeFileSync(config.out, lines.join("\n"));
  console.log(`  → wrote ${config.out}`);
  console.log(`  → decrypted: ${decryptedCount}, plain: ${plainCount}, skipped: ${skippedCount}`);
  console.log("\nNext: agent picks this up via COLLECT_YTDLP_COOKIES_FILE in apps/web/.env.local.");
  console.log("      Refresh by re-running this script (~monthly, or when YouTube auth expires).");

  // Sanity hint
  const authHints = ["SAPISID", "__Secure-3PSID", "LOGIN_INFO", "HSID"];
  const found = authHints.filter((name) => lines.some((line) => line.includes(`\t${name}\t`)));
  if (!found.length) {
    console.warn("\n⚠️  No YouTube auth cookies (SAPISID / __Secure-3PSID / LOGIN_INFO / HSID) found.");
    console.warn("    Open Arc, visit https://www.youtube.com, sign in, and re-run this script.");
  } else {
    console.log(`\n✅ Found auth cookies: ${found.join(", ")} — looks logged-in.`);
  }
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exit(1);
});
