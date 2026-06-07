import {
  apiRequest,
  apiRequestRaw,
  ApiRequestError,
  type ApiErrorPayload,
} from "@/api/core";
import type { Video } from "@/stores/useVideoStore";

export interface ParsedTitleResponse {
  title?: string;
  artist?: string;
  album?: string;
}

export async function parseVideoTitle(params: {
  title: string;
  authorName?: string;
  timeout?: number;
}): Promise<ParsedTitleResponse> {
  return apiRequest<ParsedTitleResponse, {
    title: string;
    author_name?: string;
  }>({
    path: "/api/parse-title",
    method: "POST",
    body: {
      title: params.title,
      author_name: params.authorName,
    },
    timeout: params.timeout ?? 15000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}

export interface CreateTvChannelPlanRequest {
  description: string;
}

export interface CreateTvChannelPlanResponse {
  name: string;
  description: string;
  queries: string[];
  videos: Video[];
}

export class MediaApiRequestError extends ApiRequestError {
  constructor(status: number, message: string, payload?: ApiErrorPayload) {
    super(status, message, payload);
    this.name = "MediaApiRequestError";
  }
}

export async function createTvChannelPlan(
  body: CreateTvChannelPlanRequest,
  options: { timeout?: number } = {}
): Promise<CreateTvChannelPlanResponse> {
  const response = await apiRequestRaw<CreateTvChannelPlanRequest>({
    path: "/api/tv/create-channel",
    method: "POST",
    body,
    timeout: options.timeout ?? 45000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const payload = data as ApiErrorPayload;
    throw new MediaApiRequestError(
      response.status,
      payload.error || payload.message || `Request failed with status ${response.status}`,
      payload
    );
  }

  return data as CreateTvChannelPlanResponse;
}
