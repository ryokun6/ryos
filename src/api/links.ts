import { apiRequest } from "@/api/core";

export interface LinkPreviewResponse {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  url: string;
}

export interface DecodedSharedUrl {
  url: string;
  year: string;
}

export async function fetchLinkPreview(
  url: string,
  options: { signal?: AbortSignal } = {}
): Promise<LinkPreviewResponse> {
  return apiRequest<LinkPreviewResponse>({
    path: "/api/link-preview",
    method: "GET",
    query: { url },
    signal: options.signal,
    timeout: 15000,
    retry: { maxAttempts: 2, initialDelayMs: 500 },
  });
}

export async function decodeSharedLink(
  code: string
): Promise<DecodedSharedUrl> {
  return apiRequest<DecodedSharedUrl>({
    path: "/api/share-link",
    method: "GET",
    query: {
      action: "decode",
      code,
    },
    timeout: 15000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}
