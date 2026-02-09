import { abortableFetch } from "@/utils/abortableFetch";
import type { ChatMessage } from "@/types/chat";
import { getApiUrl } from "@/utils/platform";
import { readErrorResponseBody } from "./httpErrors";
import {
  type RefreshTokenHandler,
  type RefreshTokenResult,
  makeAuthenticatedRequest,
} from "./authApi";
import { withChatRequestDefaults } from "./requestConfig";

export interface CreateRoomPayload {
  type: "public" | "private";
  name?: string;
  members?: string[];
}

interface CreateRoomRequestParams {
  name: string;
  type: "public" | "private";
  members: string[];
  authToken: string;
  username: string;
  refreshAuthToken: RefreshTokenHandler;
}

export const createRoomRequest = async ({
  name,
  type,
  members,
  authToken,
  username,
  refreshAuthToken,
}: CreateRoomRequestParams): Promise<Response> => {
  const payload: CreateRoomPayload = { type };
  if (type === "public") {
    payload.name = name.trim();
  } else {
    payload.members = members;
  }

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
    "X-Username": username,
  };

  return makeAuthenticatedRequest(
    "/api/rooms",
    {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    },
    refreshAuthToken
  );
};

interface DeleteRoomRequestParams {
  roomId: string;
  authToken: string;
  username: string;
  refreshAuthToken: RefreshTokenHandler;
}

export const deleteRoomRequest = async ({
  roomId,
  authToken,
  username,
  refreshAuthToken,
}: DeleteRoomRequestParams): Promise<Response> => {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
    "X-Username": username,
  };

  return makeAuthenticatedRequest(
    `/api/rooms/${encodeURIComponent(roomId)}`,
    {
      method: "DELETE",
      headers,
    },
    refreshAuthToken
  );
};

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

interface CreateRoomFlowParams {
  name: string;
  type: "public" | "private";
  members: string[];
  username: string | null;
  authToken: string | null;
  ensureAuthToken: () => Promise<{ ok: boolean; error?: string }>;
  getCurrentAuthToken: () => string | null;
  refreshAuthToken: () => Promise<RefreshTokenResult>;
}

export const runCreateRoomFlow = async ({
  name,
  type,
  members,
  username,
  authToken,
  ensureAuthToken,
  getCurrentAuthToken,
  refreshAuthToken,
}: CreateRoomFlowParams): Promise<{ ok: boolean; error?: string; roomId?: string }> => {
  if (!username) {
    return { ok: false, error: "Username required" };
  }

  let effectiveAuthToken = authToken;
  if (!effectiveAuthToken) {
    const tokenResult = await ensureAuthToken();
    if (!tokenResult.ok) {
      return { ok: false, error: "Authentication required" };
    }
    effectiveAuthToken = getCurrentAuthToken();
  }

  if (!effectiveAuthToken) {
    return { ok: false, error: "Authentication required" };
  }

  try {
    const response = await createRoomRequest({
      name,
      type,
      members,
      authToken: effectiveAuthToken,
      username,
      refreshAuthToken,
    });

    if (!response.ok) {
      const errorData = await readErrorResponseBody(response);
      return {
        ok: false,
        error: errorData.error || "Failed to create room",
      };
    }

    const data = (await response.json()) as { room?: { id: string } };
    if (data.room?.id) {
      return { ok: true, roomId: data.room.id };
    }

    return { ok: false, error: "Invalid response format" };
  } catch (error) {
    console.error("[ChatsStore] Error creating room:", error);
    return { ok: false, error: "Network error. Please try again." };
  }
};

interface DeleteRoomFlowParams {
  roomId: string;
  username: string | null;
  authToken: string | null;
  refreshAuthToken: () => Promise<RefreshTokenResult>;
  onDeletedCurrentRoom: () => void;
}

export const runDeleteRoomFlow = async ({
  roomId,
  username,
  authToken,
  refreshAuthToken,
  onDeletedCurrentRoom,
}: DeleteRoomFlowParams): Promise<{ ok: boolean; error?: string }> => {
  if (!username || !authToken) {
    return { ok: false, error: "Authentication required" };
  }

  try {
    const response = await deleteRoomRequest({
      roomId,
      authToken,
      username,
      refreshAuthToken,
    });

    if (!response.ok) {
      const errorData = await readErrorResponseBody(response);
      return {
        ok: false,
        error: errorData.error || "Failed to delete room",
      };
    }

    onDeletedCurrentRoom();
    return { ok: true };
  } catch (error) {
    console.error("[ChatsStore] Error deleting room:", error);
    return { ok: false, error: "Network error. Please try again." };
  }
};

interface SendMessageFlowParams {
  roomId: string;
  content: string;
  username: string | null;
  authToken: string | null;
  refreshAuthToken: () => Promise<RefreshTokenResult>;
  addMessageToRoom: (roomId: string, message: ChatMessage) => void;
  removeMessageFromRoom: (roomId: string, messageId: string) => void;
}

export const runSendMessageFlow = async ({
  roomId,
  content,
  username,
  authToken,
  refreshAuthToken,
  addMessageToRoom,
  removeMessageFromRoom,
}: SendMessageFlowParams): Promise<{ ok: boolean; error?: string }> => {
  const trimmedContent = content.trim();
  if (!username || !trimmedContent) {
    return { ok: false, error: "Username and content required" };
  }

  const optimisticMessage = createOptimisticChatMessage(
    roomId,
    username,
    trimmedContent
  );
  addMessageToRoom(roomId, optimisticMessage);

  try {
    const response = await sendRoomMessageRequest({
      roomId,
      content: trimmedContent,
      username,
      authToken,
      refreshAuthToken,
    });

    if (!response.ok) {
      removeMessageFromRoom(roomId, optimisticMessage.id);
      const errorData = await readErrorResponseBody(response);
      return {
        ok: false,
        error: errorData.error || "Failed to send message",
      };
    }

    return { ok: true };
  } catch (error) {
    removeMessageFromRoom(roomId, optimisticMessage.id);
    console.error("[ChatsStore] Error sending message:", error);
    return { ok: false, error: "Network error. Please try again." };
  }
};

interface SyncPresenceOnRoomSwitchParams {
  previousRoomId: string | null;
  nextRoomId: string | null;
  username: string;
  onRoomsRefresh: () => void;
}

export const syncPresenceOnRoomSwitch = async ({
  previousRoomId,
  nextRoomId,
  username,
  onRoomsRefresh,
}: SyncPresenceOnRoomSwitchParams): Promise<void> => {
  try {
    const response = await abortableFetch(
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

    if (!response.ok) {
      const errorData = await readErrorResponseBody(response);
      console.error("[ChatsStore] Error switching rooms:", errorData);
      return;
    }

    console.log("[ChatsStore] Room switch API call successful");
    setTimeout(() => {
      console.log("[ChatsStore] Refreshing rooms after switch");
      onRoomsRefresh();
    }, 50);
  } catch (error) {
    console.error("[ChatsStore] Network error switching rooms:", error);
  }
};
