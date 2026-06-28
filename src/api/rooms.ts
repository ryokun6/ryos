import { apiRequest } from "@/api/core";
import type {
  BulkMessagesResult,
  ChatMessage,
  ChatRoom,
  CreateRoomRequest,
  SendRoomMessageRequest,
} from "@/shared/contracts/chat";
import { ROOM_MESSAGE_HISTORY_LIMIT } from "@/shared/contracts/chat";

export type RoomSummary = ChatRoom;

export type RoomMessage = ChatMessage;

export type CreateRoomPayload = CreateRoomRequest;

export async function listRooms(): Promise<{ rooms: RoomSummary[] }> {
  return apiRequest<{ rooms: RoomSummary[] }>({
    path: "/api/rooms",
    method: "GET",
  });
}

export async function getRoomMessages(
  roomId: string,
): Promise<{ messages: RoomMessage[] }> {
  return apiRequest<{ messages: RoomMessage[] }>({
    path: `/api/rooms/${encodeURIComponent(roomId)}/messages`,
    method: "GET",
    query: { limit: ROOM_MESSAGE_HISTORY_LIMIT },
  });
}

export async function getBulkMessages(
  roomIds: string[],
): Promise<BulkMessagesResult> {
  return apiRequest<BulkMessagesResult>({
    path: "/api/messages/bulk",
    method: "GET",
    query: { roomIds: roomIds.join(",") },
  });
}

export async function switchPresence(
  payload: { previousRoomId?: string | null; nextRoomId?: string | null },
): Promise<{ success: boolean; noop?: boolean }> {
  return apiRequest<{ success: boolean; noop?: boolean }, typeof payload>({
    path: "/api/presence/switch",
    method: "POST",
    body: payload,
  });
}

export async function deleteRoom(
  roomId: string,
): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    path: `/api/rooms/${encodeURIComponent(roomId)}`,
    method: "DELETE",
  });
}

export async function createRoom(
  payload: CreateRoomPayload,
): Promise<{ room: RoomSummary }> {
  return apiRequest<{ room: RoomSummary }, CreateRoomPayload>({
    path: "/api/rooms",
    method: "POST",
    body: payload,
  });
}

export async function sendRoomMessage(
  roomId: string,
  payload: SendRoomMessageRequest,
): Promise<{ message: RoomMessage }> {
  return apiRequest<{ message: RoomMessage }, typeof payload>({
    path: `/api/rooms/${encodeURIComponent(roomId)}/messages`,
    method: "POST",
    body: payload,
  });
}

export async function deleteRoomMessage(
  roomId: string,
  messageId: string,
): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    path: `/api/rooms/${encodeURIComponent(roomId)}/messages/${encodeURIComponent(
      messageId
    )}`,
    method: "DELETE",
  });
}
