import type { ChatMessage } from "@/types/chat";
import { readErrorResponseBody } from "./httpErrors";
import { createRoomRequest, deleteRoomRequest } from "./roomRequests";
import {
  createOptimisticChatMessage,
  sendRoomMessageRequest,
} from "./sendMessage";
import type { RefreshTokenResult } from "./authRequests";

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
