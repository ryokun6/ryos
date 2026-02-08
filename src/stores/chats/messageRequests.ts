import { abortableFetch } from "@/utils/abortableFetch";
import { withChatRequestDefaults } from "./requestConfig";

export const fetchRoomsRequest = async (
  username: string | null
): Promise<Response> => {
  const queryParams = new URLSearchParams();
  if (username) {
    queryParams.append("username", username);
  }

  const url = queryParams.toString()
    ? `/api/rooms?${queryParams.toString()}`
    : "/api/rooms";

  return abortableFetch(
    url,
    withChatRequestDefaults({
      method: "GET",
    })
  );
};

export const fetchRoomMessagesRequest = async (
  roomId: string
): Promise<Response> =>
  abortableFetch(
    `/api/rooms/${encodeURIComponent(roomId)}/messages`,
    withChatRequestDefaults({
      method: "GET",
    })
  );

export const fetchBulkMessagesRequest = async (
  roomIds: string[]
): Promise<Response> => {
  const queryParams = new URLSearchParams({
    roomIds: roomIds.join(","),
  });

  return abortableFetch(
    `/api/messages/bulk?${queryParams.toString()}`,
    withChatRequestDefaults({
      method: "GET",
    })
  );
};
