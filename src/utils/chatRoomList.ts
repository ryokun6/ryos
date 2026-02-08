import type { ChatRoom } from "@/types/chat";

export const upsertChatRoom = (
  rooms: ChatRoom[],
  incomingRoom: ChatRoom
): ChatRoom[] => {
  const existingIndex = rooms.findIndex((room) => room.id === incomingRoom.id);

  if (existingIndex === -1) {
    return [...rooms, incomingRoom];
  }

  const existingRoom = rooms[existingIndex];
  const mergedRoom = { ...existingRoom, ...incomingRoom };

  if (JSON.stringify(existingRoom) === JSON.stringify(mergedRoom)) {
    return rooms;
  }

  const nextRooms = [...rooms];
  nextRooms[existingIndex] = mergedRoom;
  return nextRooms;
};

export const removeChatRoomById = (
  rooms: ChatRoom[],
  roomId: string
): ChatRoom[] => rooms.filter((room) => room.id !== roomId);
