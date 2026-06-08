import { getServiceClient } from "./supabase.ts";

const MAX_THUMBNAIL_BYTES = 500 * 1024;
const DEFAULT_CONTENT_TYPE = "image/jpeg";

function extensionForContentType(contentType: string) {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}

function normalizeObjectKey(key: string, contentType: string) {
  const trimmed = key.trim().replace(/^\/+/, "");
  const withoutBucket = trimmed.startsWith("thumbnails/")
    ? trimmed.slice("thumbnails/".length)
    : trimmed;
  if (/\.(jpe?g|png|webp)$/i.test(withoutBucket)) return withoutBucket;
  return `${withoutBucket}.${extensionForContentType(contentType)}`;
}

export async function cacheThumbnail(url: string, key: string) {
  const response = await fetch(url, {
    headers: {
      accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "user-agent": "skillsaggregator-thumbnail-cache/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`thumbnail_fetch_failed_${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? DEFAULT_CONTENT_TYPE;
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error(`thumbnail_content_type_rejected:${contentType}`);
  }

  const contentLength = Number(response.headers.get("content-length") ?? Number.NaN);
  if (Number.isFinite(contentLength) && contentLength > MAX_THUMBNAIL_BYTES) {
    throw new Error(`thumbnail_too_large:${contentLength}`);
  }

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_THUMBNAIL_BYTES) {
    throw new Error(`thumbnail_too_large:${bytes.byteLength}`);
  }

  const objectKey = normalizeObjectKey(key, contentType);
  const supabase = getServiceClient();
  const { error } = await supabase.storage
    .from("thumbnails")
    .upload(objectKey, bytes, {
      contentType,
      upsert: true,
    });
  if (error) throw error;
  return `thumbnails/${objectKey}`;
}
