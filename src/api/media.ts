import { apiRequest } from "@/api/core";

export interface ParsedMediaTitle {
  title?: string | null;
  artist?: string | null;
  album?: string | null;
}

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  publishedAt: string;
}

export async function parseMediaTitle(params: {
  title: string;
  author_name?: string;
}): Promise<ParsedMediaTitle> {
  return apiRequest<ParsedMediaTitle, typeof params>({
    path: "/api/parse-title",
    method: "POST",
    body: params,
    timeout: 15000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}

export async function searchYouTube(params: {
  query: string;
  maxResults?: number;
}): Promise<{ results: YouTubeSearchResult[] }> {
  return apiRequest<{ results: YouTubeSearchResult[] }, typeof params>({
    path: "/api/youtube-search",
    method: "POST",
    body: params,
    timeout: 15000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}

export async function transcribeAudio(
  formData: FormData
): Promise<{ text: string }> {
  return apiRequest<{ text: string }, FormData>({
    path: "/api/audio-transcribe",
    method: "POST",
    body: formData,
    timeout: 30000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}
