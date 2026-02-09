import type { ChatMessage } from "@/types/chat";
import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";
import {
  type RefreshTokenHandler,
  makeAuthenticatedRequest,
} from "./authApi";
import { withChatRequestDefaults } from "./requestConfig";

export const createOptimisticChatMessage = (
  roomId: string,
  username: string,
  content: string
): ChatMessage => {
  const tempId = `temp_${Math.random().toString(36).substring(2, 9)}`;
  return {
    id: tempId,
    clientId: tempId,
    roomId,
    username,
    content,
    timestamp: Date.now(),
  };
};

interface SendRoomMessageRequestParams {
  roomId: string;
  content: string;
  username: string;
  authToken: string | null;
  refreshAuthToken: RefreshTokenHandler;
}

export const sendRoomMessageRequest = async ({
  roomId,
  content,
  username,
  authToken,
  refreshAuthToken,
}: SendRoomMessageRequestParams): Promise<Response> => {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
    headers["X-Username"] = username;
  }

  const messageUrl = `/api/rooms/${encodeURIComponent(roomId)}/messages`;
  const messageBody = JSON.stringify({ content });

  return authToken
    ? makeAuthenticatedRequest(
        messageUrl,
        {
          method: "POST",
          headers,
          body: messageBody,
        },
        refreshAuthToken
      )
    : abortableFetch(
        getApiUrl(messageUrl),
        withChatRequestDefaults({
          method: "POST",
          headers,
          body: messageBody,
        })
      );
};
