/**
 * Transcripts for short-form video (TikTok, Instagram Reels) via local whisper.
 *
 * YouTube hands us a caption track; TikTok and Instagram do not, which is the
 * single reason short-form ran on a separate `engagement_authority` rubric with
 * no transcript and could never feed technique summaries. This module closes
 * that gap so the rest of the pipeline stops needing to know the platform.
 *
 * Shape: download the clip, strip 16 kHz mono audio, run whisper, gate the
 * result. Everything after that is the ordinary transcript path.
 *
 * MODEL. large-v3-turbo, NOT base.en. Counterintuitively turbo is both faster
 * and more accurate on Apple Silicon — 14.7s vs 30.4s on the same 143s clip,
 * and it hears "surfskate" where base.en gives "surfkit". The shallower decoder
 * benefits more from Metal. Roughly 10x real-time on an M3.
 *
 * COST. The download dominates, not the transcription: 7-28 MB of video to
 * obtain a 43-second voice track, against ~4s of CPU. Prefer small formats.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

const run = promisify(execFile);

const MODEL_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin";

export const config = {
  modelDir: process.env.COLLECT_WHISPER_MODEL_DIR ?? ".collection/models",
  modelName: process.env.COLLECT_WHISPER_MODEL ?? "ggml-large-v3-turbo.bin",
  whisperBin: process.env.COLLECT_WHISPER_BIN ?? "whisper-cli",
  ytDlpBin: process.env.COLLECT_YTDLP_BIN ?? "yt-dlp",
  ffmpegBin: process.env.COLLECT_FFMPEG_BIN ?? "ffmpeg",
  ffprobeBin: process.env.COLLECT_FFPROBE_BIN ?? "ffprobe",
  // instaloader is a Python package, not a system binary, so it is provisioned
  // into a venv beside the whisper model rather than assumed on PATH.
  instaloaderBin: process.env.COLLECT_INSTALOADER_BIN ?? null,
  venvDir: process.env.COLLECT_SHORTFORM_VENV_DIR ?? ".collection/venv",
  workDir: process.env.COLLECT_SHORTFORM_WORK_DIR ?? ".collection/shortform-tmp",
  downloadTimeoutMs: Number(process.env.COLLECT_SHORTFORM_DOWNLOAD_TIMEOUT_MS ?? 120_000),
  transcribeTimeoutMs: Number(process.env.COLLECT_SHORTFORM_TRANSCRIBE_TIMEOUT_MS ?? 300_000),
  // A clip whose audio is music or a song produces text, just not instruction.
  // Measured: usable clips run 13-20 chars/sec; a Spanish song transcribed at
  // 5.7 and a music-only demo at 0.8. The floor sits between those bands.
  minCharsPerSecond: Number(process.env.COLLECT_SHORTFORM_MIN_CHARS_PER_SEC ?? 8),
  minChars: Number(process.env.COLLECT_SHORTFORM_MIN_CHARS ?? 200),
  downloadRetries: Number(process.env.COLLECT_SHORTFORM_DOWNLOAD_RETRIES ?? 3),
  downloadRetryBackoffMs: Number(process.env.COLLECT_SHORTFORM_DOWNLOAD_BACKOFF_MS ?? 6000),
};

export function shortFormPlatform(url) {
  const value = String(url ?? "").toLowerCase();
  if (value.includes("tiktok.com")) return "tiktok";
  if (value.includes("instagram.com")) return "instagram";
  return null;
}

/** Instagram addresses posts by shortcode; instaloader takes it with a `-` prefix. */
export function instagramShortcode(url) {
  const match = String(url ?? "").match(/instagram\.com\/(?:[^/]+\/)?(?:reel|reels|p)\/([A-Za-z0-9_-]+)/i);
  return match ? match[1] : null;
}

export async function ensureWhisperModel({ log = () => {} } = {}) {
  const path = join(config.modelDir, config.modelName);
  if (existsSync(path) && statSync(path).size > 100_000_000) return path;

  mkdirSync(config.modelDir, { recursive: true });
  log("info", "whisper_model_download_started", "Fetching whisper model", {
    model: config.modelName,
    dir: config.modelDir,
  });
  // curl rather than fetch(): 1.5 GB streamed to disk, with resume, and no need
  // to hold it in memory.
  await run("curl", ["-sL", "--retry", "3", "-o", path, MODEL_URL], {
    timeout: 30 * 60_000,
    maxBuffer: 1024 * 1024,
  });
  if (!existsSync(path) || statSync(path).size < 100_000_000) {
    throw new Error(`whisper model download produced no usable file at ${path}`);
  }
  log("info", "whisper_model_ready", "Whisper model available", { path });
  return path;
}

/** execFile rejects with an Error whose useful detail is on .stderr, not .message. */
function toolError(prefix, error) {
  const stderr = String(error?.stderr ?? "").trim().split("\n").filter(Boolean).pop() ?? "";
  const base = error instanceof Error ? error.message : String(error);
  return new Error(`${prefix}: ${stderr || base}`.slice(0, 400));
}

/**
 * instaloader lives in a venv under .collection/ rather than on PATH, for the
 * same reason the whisper model does: it is a dependency of this pipeline, not
 * of the machine, and a fresh checkout should be able to provision it without a
 * README step. Returns the executable path.
 */
export async function ensureInstaloader({ log = () => {} } = {}) {
  if (config.instaloaderBin) return config.instaloaderBin;
  const bin = join(config.venvDir, "bin", "instaloader");
  if (existsSync(bin)) return bin;

  mkdirSync(dirname(config.venvDir), { recursive: true });
  log("info", "instaloader_install_started", "Provisioning instaloader venv", { dir: config.venvDir });
  await run("python3", ["-m", "venv", config.venvDir], { timeout: 120_000 });
  await run(join(config.venvDir, "bin", "pip"), [
    "install", "-q", "--disable-pip-version-check", "instaloader",
  ], { timeout: 300_000, maxBuffer: 8 * 1024 * 1024 });
  if (!existsSync(bin)) throw new Error(`instaloader install produced no binary at ${bin}`);
  log("info", "instaloader_ready", "instaloader available", { bin });
  return bin;
}

/**
 * TikTok: prefer h264, because the h265 formats lie about having audio.
 *
 * `b[acodec!=none]` looks like the principled answer — state the requirement
 * rather than name a format — and it is wrong, because the requirement is
 * evaluated against TikTok's own metadata and that metadata is false. Every
 * bytevc1_* (h265) row in the format table advertises `aac`; ffprobe on the
 * delivered file finds a single hevc video stream and no audio at all.
 * Reproduced on three videos. yt-dlp preferred those rows on size, so roughly
 * half the clips in a nightly run were discarded as `download_had_no_audio`
 * — recorded as a property of the clip when it was a property of the format.
 *
 * The h264_* rows are honest: 3 of 3 delivered audio, including the two videos
 * that had just failed. So ask for h264 first and keep the old chain behind it.
 *
 * Two further dead ends, both of which look like they work:
 *   -x            fails postprocessing with "unable to obtain file audio codec
 *                 with ffprobe" and silently leaves a VIDEO-ONLY file.
 *   -f download   the watermarked combined format. Genuinely carries audio, but
 *                 serves 403 Forbidden for many videos — 7 of 10 in the first
 *                 backlog batch — so it is a fallback, not the first choice.
 *
 * Instagram: instaloader is the only downloader that works anonymously. yt-dlp
 * fails with "login required" and gallery-dl redirects to the login page;
 * instaloader pulled 6 of 6 test reels with no credentials.
 */
async function downloadMedia(url, dir, { log } = {}) {
  const platform = shortFormPlatform(url);
  mkdirSync(dir, { recursive: true });

  if (platform === "tiktok") {
    // TikTok throttles by returning HTTP errors on the media CDN rather than
    // blocking outright, and it is not deterministic: the same URL can serve a
    // clip, then 403, then 404 within minutes. Observed repeatedly while
    // building this. Retry with linear backoff rather than treating a transient
    // status as "this video is gone" — each abandoned download discards a
    // candidate that already passed discovery.
    let lastError = null;
    for (let attempt = 0; attempt < config.downloadRetries; attempt += 1) {
      if (attempt > 0) await delay(config.downloadRetryBackoffMs * attempt);
      try {
        await run(config.ytDlpBin, [
          "-f", "b[vcodec*=264]/download/b[acodec!=none]/bv*+ba/b", "--no-warnings",
          "-o", join(dir, "clip.%(ext)s"), url,
        ], { timeout: config.downloadTimeoutMs, maxBuffer: 8 * 1024 * 1024 });
        lastError = null;
        break;
      } catch (error) {
        lastError = toolError("yt-dlp", error);
      }
    }
    if (lastError) throw lastError;
  } else if (platform === "instagram") {
    const code = instagramShortcode(url);
    if (!code) throw new Error(`no Instagram shortcode in ${url}`);
    const instaloader = await ensureInstaloader({ log });
    try {
      await run(instaloader, [
        "--no-metadata-json", "--no-compress-json", "--quiet",
        `--dirname-pattern=${dir}`, "--", `-${code}`,
      ], { timeout: config.downloadTimeoutMs, maxBuffer: 8 * 1024 * 1024 });
    } catch (error) {
      throw toolError("instaloader", error);
    }
  } else {
    throw new Error(`unsupported short-form url: ${url}`);
  }

  const media = readdirSync(dir).filter((name) => name.endsWith(".mp4")).sort();
  // No mp4 is an ordinary outcome, not a failure. Instagram serves photo posts
  // and carousels under /p/ and sometimes /reel/, and a search engine cannot
  // tell them apart from a video — instaloader downloads the jpg and there is
  // nothing to transcribe. Reporting it as a thrown error made a routine
  // not-a-video look like broken tooling in the run stats.
  if (!media.length) return { media: null, caption: readCaption(dir) };
  return { media: join(dir, media[0]), caption: readCaption(dir) };
}

/**
 * The caption instaloader already wrote to disk.
 *
 * Worth reading because Instagram gives us nothing else. Its meta tags carry no
 * caption (only a templated twitter:title), and the search engine's description
 * for a reel is that same template — so a reel whose audio is music had literally
 * no text to score against and was correctly, but uselessly, rejected at
 * relevance 0. instaloader fetches the caption as a side effect of the download
 * we are already paying for, so this costs one file read.
 *
 * TikTok needs none of this: its caption comes back in the search result.
 */
function readCaption(dir) {
  const file = readdirSync(dir).filter((name) => name.endsWith(".txt")).sort()[0];
  if (!file) return null;
  try {
    const text = readFileSync(join(dir, file), "utf8").trim();
    return text ? text.slice(0, 2000) : null;
  } catch {
    return null;
  }
}

/**
 * Whether the download actually contains sound. A video-only file is the
 * signature failure here — ffmpeg produces an empty wav from it, whisper
 * returns a few characters, and the clip gets rejected as "too_short" as though
 * it were a silent demo. That misattributes a download bug as a content
 * property, so check explicitly and fail with a distinguishable reason.
 */
async function hasAudioStream(mediaPath) {
  const { stdout } = await run(config.ffprobeBin, [
    "-v", "error", "-select_streams", "a",
    "-show_entries", "stream=codec_type", "-of", "csv=p=0", mediaPath,
  ], { timeout: 30_000 });
  return String(stdout).includes("audio");
}

async function extractAudio(mediaPath, wavPath) {
  // 16 kHz mono PCM is what whisper wants; -vn drops the video stream so a
  // 28 MB download becomes a few MB of audio.
  await run(config.ffmpegBin, [
    "-v", "error", "-y", "-i", mediaPath, "-vn",
    "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wavPath,
  ], { timeout: config.downloadTimeoutMs, maxBuffer: 4 * 1024 * 1024 });

  const { stdout } = await run(config.ffprobeBin, [
    "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wavPath,
  ], { timeout: 30_000 });
  const seconds = Number.parseFloat(String(stdout).trim());
  return Number.isFinite(seconds) ? seconds : 0;
}

async function runWhisper(modelPath, wavPath, outPrefix) {
  // -nt strips timestamps, -np strips progress; -otxt writes <prefix>.txt so we
  // read a file rather than parsing stdout, which whisper also uses for logs.
  await run(config.whisperBin, [
    "-m", modelPath, "-f", wavPath, "-nt", "-np", "-otxt", "-of", outPrefix,
  ], { timeout: config.transcribeTimeoutMs, maxBuffer: 16 * 1024 * 1024 });
  return (await readFile(`${outPrefix}.txt`, "utf8")).trim();
}

/**
 * Transcribe one short-form URL.
 *
 * Returns `{ ok, text, seconds, chars, charsPerSecond, reason }`. `ok: false` is
 * an ordinary outcome, not an error: a clip whose audio is music or a song
 * cannot be transcribed into instruction, and storing what whisper returns for
 * one would be actively harmful. A Spanish song came back as 241 characters of
 * fluent text that would have been stored as surfing technique and fed to the
 * coach and the summary routine. The caller stores nothing and lets the link
 * fall back to metadata scoring, exactly as a caption-less YouTube video does.
 */
export async function transcribeShortForm(url, { modelPath, log = () => {} } = {}) {
  const platform = shortFormPlatform(url);
  if (!platform) return { ok: false, reason: "unsupported_platform", text: "" };

  const model = modelPath ?? (await ensureWhisperModel({ log }));
  const dir = join(config.workDir, `sf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  try {
    const { media, caption } = await downloadMedia(url, dir, { log });
    // The caption rides along on every outcome, including the failures: a clip
    // with no usable speech is exactly the one whose caller needs something to
    // score against.
    if (!media) return { ok: false, reason: "not_a_video", text: "", seconds: 0, caption, platform };
    if (!(await hasAudioStream(media))) {
      return { ok: false, reason: "download_had_no_audio", text: "", seconds: 0, caption, platform };
    }
    const wav = join(dir, "audio.wav");
    const seconds = await extractAudio(media, wav);
    if (!seconds) return { ok: false, reason: "no_audio_stream", text: "", seconds: 0, caption, platform };

    const text = await runWhisper(model, wav, join(dir, "out"));
    const chars = text.length;
    const charsPerSecond = seconds > 0 ? chars / seconds : 0;

    if (chars < config.minChars) {
      return { ok: false, reason: "too_short", text, seconds, chars, charsPerSecond, caption, platform };
    }
    if (charsPerSecond < config.minCharsPerSecond) {
      // Music, a song, or a silent demo with a soundtrack.
      return { ok: false, reason: "low_speech_density", text, seconds, chars, charsPerSecond, caption, platform };
    }
    return { ok: true, text, seconds, chars, charsPerSecond, caption, platform };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
