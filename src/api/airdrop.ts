import { apiRequest } from "@/api/core";

export interface AirDropDiscoverResponse {
  users: string[];
}

export interface AirDropSendRequest {
  recipient: string;
  fileName: string;
  fileType?: string;
  content: string;
}

export interface AirDropSendResponse {
  success: boolean;
  transferId: string;
}

export interface AirDropRespondRequest {
  transferId: string;
  accept: boolean;
}

export interface AirDropRespondResponse {
  success: boolean;
  declined?: boolean;
  fileName?: string;
  fileType?: string;
  content?: string;
  sender?: string;
}

export async function sendAirDropHeartbeat(): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    path: "/api/airdrop/heartbeat",
    method: "POST",
  });
}

export async function discoverAirDropUsers(): Promise<AirDropDiscoverResponse> {
  return apiRequest<AirDropDiscoverResponse>({
    path: "/api/airdrop/discover",
    method: "GET",
  });
}

export async function sendAirDropFile(
  body: AirDropSendRequest
): Promise<AirDropSendResponse> {
  return apiRequest<AirDropSendResponse, AirDropSendRequest>({
    path: "/api/airdrop/send",
    method: "POST",
    body,
  });
}

export async function respondToAirDropTransfer(
  body: AirDropRespondRequest
): Promise<AirDropRespondResponse> {
  return apiRequest<AirDropRespondResponse, AirDropRespondRequest>({
    path: "/api/airdrop/respond",
    method: "POST",
    body,
  });
}
