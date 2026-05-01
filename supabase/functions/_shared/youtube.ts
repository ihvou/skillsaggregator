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

export async function searchYouTube(query: string, channelId: string): Promise<YouTubeCandidate[]> {
  const apiKey = Deno.env.get("YOUTUBE_API_KEY");
  if (!apiKey) throw new Error("YOUTUBE_API_KEY is not configured");

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", "10");
  url.searchParams.set("q", query);
  url.searchParams.set("channelId", channelId);
  url.searchParams.set("key", apiKey);

  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "YouTube search failed");

  return (payload.items ?? [])
    .filter((item: { id?: { videoId?: string } }) => item.id?.videoId)
    .map((item: {
      id: { videoId: string };
      snippet: {
        title: string;
        description?: string;
        channelId: string;
        channelTitle: string;
        thumbnails?: { medium?: { url?: string }; high?: { url?: string } };
      };
    }) => {
      const videoUrl = `https://www.youtube.com/watch?v=${item.id.videoId}`;
      return {
        video_id: item.id.videoId,
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

export async function fetchTranscript(videoId: string): Promise<string> {
  const transcript = await YoutubeTranscript.fetchTranscript(videoId);
  return transcript.map((part: { text: string }) => part.text).join(" ");
}
