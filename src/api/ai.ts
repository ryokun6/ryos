import { apiRequest } from "@/api/core";
import type { AIChatMessage } from "@/types/chat";

export interface RyoReplyRequest {
  roomId: string;
  prompt: string;
  systemState?: {
    chatRoomContext?: {
      recentMessages?: string;
      mentionedMessage?: string;
    };
  };
}

export interface RyoReplyResponse {
  message: {
    id: string;
    roomId: string;
    username: string;
    content: string;
    timestamp: string | number;
  };
}

export async function requestRyoReply(
  body: RyoReplyRequest,
  options: { signal?: AbortSignal } = {}
): Promise<RyoReplyResponse> {
  return apiRequest<RyoReplyResponse, RyoReplyRequest>({
    path: "/api/ai/ryo-reply",
    method: "POST",
    body,
    signal: options.signal,
    timeout: 20000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}

export interface ExtractMemoriesRequest {
  timeZone: string;
  messages: Array<{
    role: AIChatMessage["role"];
    parts: AIChatMessage["parts"];
    metadata?: {
      createdAt?: string | number | Date;
    };
  }>;
}

export interface ExtractMemoriesResponse {
  extracted: number;
  dailyNotes?: number;
  analyzed?: number;
  message?: string;
}

export async function extractMemoriesFromChat(
  body: ExtractMemoriesRequest,
  options: { timeZoneHeader?: string } = {}
): Promise<ExtractMemoriesResponse> {
  return apiRequest<ExtractMemoriesResponse, ExtractMemoriesRequest>({
    path: "/api/ai/extract-memories",
    method: "POST",
    headers: options.timeZoneHeader
      ? { "X-User-Timezone": options.timeZoneHeader }
      : undefined,
    body,
    timeout: 15000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}

export interface ProactiveGreetingResponse {
  greeting?: string;
}

export async function requestProactiveGreeting(
  options: { signal?: AbortSignal } = {}
): Promise<ProactiveGreetingResponse> {
  return apiRequest<ProactiveGreetingResponse, {
    messages: [];
    proactiveGreeting: true;
  }>({
    path: "/api/chat",
    method: "POST",
    body: {
      messages: [],
      proactiveGreeting: true,
    },
    signal: options.signal,
    timeout: 20000,
  });
}
