import { apiRequest } from "@/api/core";

export async function extractConversationMemories(payload: {
  timeZone: string;
  messages: Array<{
    role: string;
    parts?: unknown;
    metadata?: { createdAt?: string | number };
  }>;
  userTimeZone?: string;
}): Promise<{
  extracted: number;
  dailyNotes?: number;
  analyzed?: number;
  message?: string;
}> {
  return apiRequest<
    {
      extracted: number;
      dailyNotes?: number;
      analyzed?: number;
      message?: string;
    },
    typeof payload
  >({
    path: "/api/ai/extract-memories",
    method: "POST",
    body: payload,
    headers: payload.userTimeZone
      ? { "X-User-Timezone": payload.userTimeZone }
      : undefined,
    timeout: 15000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}

export async function requestRyoReply(payload: {
  roomId: string;
  prompt: string;
  systemState?: {
    chatRoomContext?: {
      recentMessages?: string;
      mentionedMessage?: string;
      roomId?: string | null;
    };
  };
}): Promise<{ message: unknown }> {
  return apiRequest<{ message: unknown }, typeof payload>({
    path: "/api/ai/ryo-reply",
    method: "POST",
    body: payload,
    timeout: 20000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}
