import { abortableFetch } from "@/utils/abortableFetch";

interface SwitchPresenceRoomRequestParams {
  previousRoomId: string | null;
  nextRoomId: string | null;
  username: string;
}

export const switchPresenceRoomRequest = async ({
  previousRoomId,
  nextRoomId,
  username,
}: SwitchPresenceRoomRequestParams): Promise<Response> =>
  abortableFetch("/api/presence/switch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      previousRoomId,
      nextRoomId,
      username,
    }),
    timeout: 15000,
    throwOnHttpError: false,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
