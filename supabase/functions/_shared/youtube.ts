import { YoutubeTranscript } from "npm:youtube-transcript@1.2.1";
import { normalizeCanonicalUrl } from "./normalization.ts";

export interface YouTubeCandidate {
  video_id: string;
  url: string;
  canonical_url: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  channel_id: string;
  channel_title: string;
}

export class YouTubeApiError extends Error {
  status: number;
  reason: string | null;
  quotaExceeded: boolean;

  constructor(message: string, status: number, reason: string | null) {
    super(message);
    this.name = "YouTubeApiError";
    this.status = status;
    this.reason = reason;
    this.quotaExceeded = status === 403 && reason === "quotaExceeded";
  }
}

export class TranscriptUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscriptUnavailableError";
  }
}

export class TranscriptFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranscriptFetchError";
  }
}

const uploadCache = new Map<string, Promise<YouTubeCandidate[]>>();

function uploadsPlaylistId(channelId: string) {
  return channelId.startsWith("UC") ? `UU${channelId.slice(2)}` : channelId;
}

function queryTerms(query: string) {
  const stop = new Set(["badminton", "tutorial", "how", "to", "the", "and", "for", "drill", "with"]);
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2 && !stop.has(term));
}

function relevanceForQuery(candidate: YouTubeCandidate, query: string) {
  const haystack = `${candidate.title} ${candidate.description ?? ""}`.toLowerCase();
  const terms = queryTerms(query);
  if (terms.length === 0) return 1;
  return terms.filter((term) => haystack.includes(term)).length / terms.length;
}

async function loadRecentUploads(channelId: string): Promise<YouTubeCandidate[]> {
  const apiKey = Deno.env.get("YOUTUBE_API_KEY");
  if (!apiKey) throw new Error("YOUTUBE_API_KEY is not configured");

  const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("maxResults", "25");
  url.searchParams.set("playlistId", uploadsPlaylistId(channelId));
  url.searchParams.set("key", apiKey);

  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) {
    const reason = payload.error?.errors?.[0]?.reason ?? null;
    throw new YouTubeApiError(
      payload.error?.message ?? `YouTube playlistItems failed with ${response.status}`,
      response.status,
      reason,
    );
  }

  return (payload.items ?? [])
    .filter((item: { snippet?: { resourceId?: { videoId?: string } } }) => item.snippet?.resourceId?.videoId)
    .map((item: {
      snippet: {
        resourceId: { videoId: string };
        title: string;
        description?: string;
        channelId: string;
        channelTitle: string;
        thumbnails?: { medium?: { url?: string }; high?: { url?: string } };
      };
    }) => {
      const videoUrl = `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`;
      return {
        video_id: item.snippet.resourceId.videoId,
        url: videoUrl,
        canonical_url: normalizeCanonicalUrl(videoUrl),
        title: item.snippet.title,
        description: item.snippet.description ?? null,
        thumbnail_url: item.snippet.thumbnails?.high?.url ?? item.snippet.thumbnails?.medium?.url ?? null,
        channel_id: item.snippet.channelId,
        channel_title: item.snippet.channelTitle,
      };
    });
}

export async function searchYouTube(query: string, channelId: string): Promise<YouTubeCandidate[]> {
  if (!uploadCache.has(channelId)) {
    uploadCache.set(channelId, loadRecentUploads(channelId));
  }

  const uploads = await uploadCache.get(channelId)!;
  return uploads
    .map((candidate) => ({ candidate, relevance: relevanceForQuery(candidate, query) }))
    .filter((item) => item.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 10)
    .map((item) => item.candidate);
}

export async function fetchTranscript(videoId: string): Promise<string> {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    if (!transcript.length) {
      throw new TranscriptUnavailableError(`No transcript entries for ${videoId}`);
    }
    return transcript.map((part: { text: string }) => part.text).join(" ");
  } catch (error) {
    if (error instanceof TranscriptUnavailableError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.toLowerCase().includes("transcript") &&
      (message.toLowerCase().includes("disabled") ||
        message.toLowerCase().includes("unavailable") ||
        message.toLowerCase().includes("not available"))
    ) {
      throw new TranscriptUnavailableError(message);
    }
    throw new TranscriptFetchError(message);
  }
}
