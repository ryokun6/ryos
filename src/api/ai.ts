import { apiRequest } from "@/api/core";

export interface ProactiveGreetingResponse {
  greeting?: string;
}

export interface ExtractMemoriesMessage {
  role: string;
  parts?: Array<{ type: string; text?: string }>;
  metadata?: {
    createdAt?: string | number;
  };
}

export interface ExtractMemoriesResponse {
  extracted: number;
  dailyNotes?: number;
  analyzed?: number;
  message?: string;
}

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

export async function fetchProactiveGreeting(options: {
  signal?: AbortSignal;
} = {}): Promise<ProactiveGreetingResponse> {
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
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}

export async function extractMemoriesFromChat(params: {
  timeZone: string;
  messages: ExtractMemoriesMessage[];
}): Promise<ExtractMemoriesResponse> {
  return apiRequest<ExtractMemoriesResponse, {
    timeZone: string;
    messages: ExtractMemoriesMessage[];
  }>({
    path: "/api/ai/extract-memories",
    method: "POST",
    headers: {
      "X-User-Timezone": params.timeZone,
    },
    body: {
      timeZone: params.timeZone,
      messages: params.messages,
    },
    timeout: 15000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}

export async function requestRyoReply(
  payload: RyoReplyRequest
): Promise<{ success?: boolean }> {
  return apiRequest<{ success?: boolean }, RyoReplyRequest>({
    path: "/api/ai/ryo-reply",
    method: "POST",
    body: payload,
    timeout: 20000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}
