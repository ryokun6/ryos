import { apiRequest } from "@/api/core";

export interface CandyBarIconPack {
  id: string;
  name: string;
  author: string;
  description: string;
  previewIcons: Array<{ name: string; url: string }>;
  iconCount: number;
  downloadUrl?: string;
  createdAt: string;
  category: string;
}

export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  name: string;
}

export interface StockChartPoint {
  timestamp: number;
  close: number;
}

export interface LinkPreviewMetadata {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  url: string;
}

export interface ParsedTitleResult {
  title?: string;
  artist?: string;
  album?: string;
}

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  publishedAt: string;
}

export async function listCandyBarPacks(): Promise<{
  packs: CandyBarIconPack[];
}> {
  return apiRequest<{ packs: CandyBarIconPack[] }>({
    path: "/api/candybar/packs",
    method: "GET",
  });
}

export async function getStocks(params: {
  symbols: string[];
  chart?: string;
  range?: string;
}): Promise<{ quotes: StockQuote[]; chart?: StockChartPoint[] }> {
  return apiRequest<{ quotes: StockQuote[]; chart?: StockChartPoint[] }>({
    path: "/api/stocks",
    method: "GET",
    query: {
      symbols: params.symbols.join(","),
      chart: params.chart,
      range: params.range,
    },
  });
}

export async function getLinkPreview(
  url: string,
  options?: { signal?: AbortSignal }
): Promise<LinkPreviewMetadata> {
  return apiRequest<LinkPreviewMetadata>({
    path: "/api/link-preview",
    method: "GET",
    query: { url },
    signal: options?.signal,
    timeout: 15000,
    retry: { maxAttempts: 2, initialDelayMs: 500 },
  });
}

export async function parseTitleMetadata(params: {
  title: string;
  author_name?: string;
}): Promise<ParsedTitleResult> {
  return apiRequest<ParsedTitleResult, { title: string; author_name?: string }>({
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
