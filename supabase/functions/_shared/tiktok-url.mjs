export function tiktokVideoIdFromUrl(value) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (hostname !== "tiktok.com" && !hostname.endsWith(".tiktok.com")) return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    const videoIndex = parts.findIndex((part) => part === "video");
    return videoIndex >= 0 ? parts[videoIndex + 1] ?? null : null;
  } catch {
    return null;
  }
}
