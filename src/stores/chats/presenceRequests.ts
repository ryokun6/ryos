import { abortableFetch } from "@/utils/abortableFetch";
import { withChatRequestDefaults } from "./requestConfig";

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
  abortableFetch(
    "/api/presence/switch",
    withChatRequestDefaults({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        previousRoomId,
        nextRoomId,
        username,
      }),
    })
  );
