import { apiRequest } from "@/api/core";

export async function sendAirDropHeartbeat(): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    path: "/api/airdrop/heartbeat",
    method: "POST",
  });
}

export async function discoverAirDropUsers(): Promise<{ users: string[] }> {
  return apiRequest<{ users: string[] }>({
    path: "/api/airdrop/discover",
    method: "GET",
  });
}

export async function sendAirDropFile(payload: {
  recipient: string;
  fileName: string;
  fileType?: string;
  content: string;
}): Promise<{ success: boolean; transferId: string }> {
  return apiRequest<{ success: boolean; transferId: string }, typeof payload>({
    path: "/api/airdrop/send",
    method: "POST",
    body: payload,
  });
}

export async function respondToAirDropTransfer(payload: {
  transferId: string;
  accept: boolean;
}): Promise<{
  success: boolean;
  declined?: boolean;
  fileName?: string;
  fileType?: string;
  content?: string;
  sender?: string;
}> {
  return apiRequest<
    {
      success: boolean;
      declined?: boolean;
      fileName?: string;
      fileType?: string;
      content?: string;
      sender?: string;
    },
    typeof payload
  >({
    path: "/api/airdrop/respond",
    method: "POST",
    body: payload,
  });
}
