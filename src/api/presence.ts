import { apiRequest } from "@/api/core";

export async function sendPresenceHeartbeat(): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    path: "/api/presence/heartbeat",
    method: "POST",
    timeout: 10000,
    retry: { maxAttempts: 1, initialDelayMs: 500 },
  });
}

export async function listOnlineUsers(): Promise<{ users: string[] }> {
  return apiRequest<{ users: string[] }>({
    path: "/api/presence/heartbeat",
    method: "GET",
    timeout: 10000,
    retry: { maxAttempts: 1, initialDelayMs: 500 },
  });
}
