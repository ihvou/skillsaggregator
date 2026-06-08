const SUPABASE_STORAGE_MARKER = "/storage/v1/object/public/";

function cleanHost(hostname: string) {
  return hostname.replace(/^www\./, "").toLowerCase();
}

export function youtubeVideoIdFromUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const host = cleanHost(parsed.hostname);
    if (host === "youtu.be") return parsed.pathname.split("/").filter(Boolean)[0] ?? null;
    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      if (parsed.pathname.startsWith("/shorts/")) return parsed.pathname.split("/")[2] ?? null;
      if (parsed.pathname.startsWith("/embed/")) return parsed.pathname.split("/")[2] ?? null;
      return parsed.searchParams.get("v");
    }
    if (host === "i.ytimg.com" || host.endsWith(".ytimg.com") || host === "img.youtube.com") {
      const parts = parsed.pathname.split("/").filter(Boolean);
      const videoIndex = parts.findIndex((part) => part === "vi");
      return videoIndex >= 0 ? parts[videoIndex + 1] ?? null : null;
    }
  } catch {
    return null;
  }
  return null;
}

function youtubeThumbnailUrl(value: string | null | undefined) {
  const videoId = youtubeVideoIdFromUrl(value);
  return videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null;
}

function isAllowedAbsoluteThumbnail(parsed: URL) {
  const host = cleanHost(parsed.hostname);
  if (parsed.protocol === "https:") {
    return (
      host === "i.ytimg.com" ||
      host.endsWith(".ytimg.com") ||
      host === "img.youtube.com" ||
      host.endsWith(".supabase.co") ||
      host.endsWith(".supabase.in")
    );
  }
  if (parsed.protocol !== "http:") return false;
  return (
    (host === "localhost" || host === "127.0.0.1" || host === "192.168.10.108") &&
    parsed.port === "54321"
  );
}

function storageKeyFromValue(value: string) {
  const trimmed = value.trim().replace(/^\/+/, "");
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    const markerIndex = parsed.pathname.indexOf(SUPABASE_STORAGE_MARKER);
    if (markerIndex === -1) return null;
    return decodeURIComponent(parsed.pathname.slice(markerIndex + SUPABASE_STORAGE_MARKER.length));
  } catch {
    return trimmed.startsWith("link-thumbnails/") ? trimmed : null;
  }
}

function publicStorageUrl(key: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  if (!supabaseUrl) return null;
  return `${supabaseUrl}/storage/v1/object/public/${key.replace(/^\/+/, "")}`;
}

export function normalizeThumbnailUrl(
  thumbnailUrl: string | null | undefined,
  canonicalUrl?: string | null,
) {
  const youtubeFallback = youtubeThumbnailUrl(thumbnailUrl) ?? youtubeThumbnailUrl(canonicalUrl);
  if (!thumbnailUrl) return youtubeFallback;

  try {
    const parsed = new URL(thumbnailUrl);
    if (isAllowedAbsoluteThumbnail(parsed)) return thumbnailUrl;

    const storageKey = storageKeyFromValue(thumbnailUrl);
    return storageKey ? publicStorageUrl(storageKey) ?? youtubeFallback : youtubeFallback;
  } catch {
    const storageKey = storageKeyFromValue(thumbnailUrl);
    return storageKey ? publicStorageUrl(storageKey) ?? youtubeFallback : youtubeFallback;
  }
}

