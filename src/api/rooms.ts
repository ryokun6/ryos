import { apiRequest } from "@/api/core";
import type {
  BulkMessagesResult,
  CreateRoomData,
  Message,
  Room,
} from "@ryos/shared/contracts/chat-rooms";

export type RoomSummary = Room;

export type RoomMessage = Message & {
  clientId?: string;
};

export type CreateRoomPayload = CreateRoomData & {
  type: NonNullable<CreateRoomData["type"]>;
};

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
  });
}

export async function getBulkMessages(
  roomIds: string[],
): Promise<BulkMessagesResult & { messagesMap: Record<string, RoomMessage[]> }> {
  return apiRequest<
    BulkMessagesResult & { messagesMap: Record<string, RoomMessage[]> }
  >({
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
  payload: { content: string },
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
