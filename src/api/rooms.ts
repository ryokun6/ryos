import { apiRequest, type ApiAuthContext } from "@/api/core";

export interface RoomSummary {
  id: string;
  name: string;
  type?: "public" | "private";
  createdAt: number;
  members?: string[];
  userCount: number;
}

export interface RoomMessage {
  id: string;
  roomId: string;
  username: string;
  content: string;
  timestamp: number;
  clientId?: string;
}

export async function listRooms(
  auth?: ApiAuthContext
): Promise<{ rooms: RoomSummary[] }> {
  return apiRequest<{ rooms: RoomSummary[] }>({
    path: "/api/rooms",
    method: "GET",
    auth,
  });
}

export async function getRoomMessages(
  roomId: string,
  auth?: ApiAuthContext
): Promise<{ messages: RoomMessage[] }> {
  return apiRequest<{ messages: RoomMessage[] }>({
    path: `/api/rooms/${encodeURIComponent(roomId)}/messages`,
    method: "GET",
    auth,
  });
}

export async function getBulkMessages(
  roomIds: string[],
  auth?: ApiAuthContext
): Promise<{
  messagesMap: Record<string, RoomMessage[]>;
  validRoomIds: string[];
  invalidRoomIds: string[];
}> {
  return apiRequest<{
    messagesMap: Record<string, RoomMessage[]>;
    validRoomIds: string[];
    invalidRoomIds: string[];
  }>({
    path: "/api/messages/bulk",
    method: "GET",
    query: { roomIds: roomIds.join(",") },
    auth,
  });
}

export async function switchPresence(
  payload: { previousRoomId?: string | null; nextRoomId?: string | null },
  auth: ApiAuthContext
): Promise<{ success: boolean; noop?: boolean }> {
  return apiRequest<{ success: boolean; noop?: boolean }, typeof payload>({
    path: "/api/presence/switch",
    method: "POST",
    auth,
    body: payload,
  });
}

