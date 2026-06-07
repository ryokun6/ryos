import { apiRequest } from "@/api/core";

export interface PresenceHeartbeatResponse {
  success: boolean;
}

export interface PresenceUsersResponse {
  users: string[];
}

export async function sendPresenceHeartbeat(): Promise<PresenceHeartbeatResponse> {
  return apiRequest<PresenceHeartbeatResponse>({
    path: "/api/presence/heartbeat",
    method: "POST",
    timeout: 10000,
    retry: { maxAttempts: 1, initialDelayMs: 500 },
  });
}

export async function fetchPresenceUsers(): Promise<PresenceUsersResponse> {
  return apiRequest<PresenceUsersResponse>({
    path: "/api/presence/heartbeat",
    method: "GET",
    timeout: 10000,
    retry: { maxAttempts: 1, initialDelayMs: 500 },
  });
}
