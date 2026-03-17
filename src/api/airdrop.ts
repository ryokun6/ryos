import { apiRequest } from "@/api/core";

export interface AirDropTransferResponse {
  success: boolean;
  transferId?: string;
  fileName?: string;
  fileType?: string;
  content?: string;
  sender?: string;
  declined?: boolean;
}

export async function sendAirDropHeartbeat(): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    path: "/api/airdrop/heartbeat",
    method: "POST",
    timeout: 15000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}

export async function discoverAirDropUsers(): Promise<{ users: string[] }> {
  return apiRequest<{ users: string[] }>({
    path: "/api/airdrop/discover",
    method: "GET",
    timeout: 15000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}

export async function sendAirDropFile(payload: {
  recipient: string;
  fileName: string;
  fileType?: string;
  content: string;
}): Promise<AirDropTransferResponse> {
  return apiRequest<AirDropTransferResponse, typeof payload>({
    path: "/api/airdrop/send",
    method: "POST",
    body: payload,
    timeout: 15000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}

export async function respondToAirDropTransfer(payload: {
  transferId: string;
  accept: boolean;
}): Promise<AirDropTransferResponse> {
  return apiRequest<AirDropTransferResponse, typeof payload>({
    path: "/api/airdrop/respond",
    method: "POST",
    body: payload,
    timeout: 15000,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
}
