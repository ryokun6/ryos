/**
 * Room access helpers.
 *
 * Ensures private-room visibility and write permissions are always
 * evaluated against authenticated session identity.
 */

import type { AuthenticatedRequestUser } from "../../_utils/request-auth.js";
import type { Room } from "./_types.js";

export interface RoomAccessError {
  status: 401 | 403;
  error: string;
}

export function isPrivateRoom(room: Room | null | undefined): boolean {
  return room?.type === "private";
}

export function isRoomMember(
  room: Room | null | undefined,
  username: string | null | undefined
): boolean {
  if (!room || !username || !Array.isArray(room.members)) return false;
  return room.members.includes(username.toLowerCase());
}

/**
 * Private-room read access:
 * - public room => allowed
 * - private room + no user => 401
 * - private room + non-member => 403
 */
export function getRoomReadAccessError(
  room: Room | null | undefined,
  user: AuthenticatedRequestUser | null
): RoomAccessError | null {
  if (!isPrivateRoom(room)) return null;

  if (!user) {
    return { status: 401, error: "Unauthorized - authentication required" };
  }

  if (!isRoomMember(room, user.username)) {
    return { status: 403, error: "Forbidden - not a room member" };
  }

  return null;
}

/**
 * Private-room write access:
 * - requires authenticated user
 * - requires member for private rooms
 */
export function getRoomWriteAccessError(
  room: Room | null | undefined,
  user: AuthenticatedRequestUser | null
): RoomAccessError | null {
  if (!user) {
    return { status: 401, error: "Unauthorized - authentication required" };
  }

  if (isPrivateRoom(room) && !isRoomMember(room, user.username)) {
    return { status: 403, error: "Forbidden - not a room member" };
  }

  return null;
}

export function filterVisibleRooms(
  rooms: Room[],
  user: AuthenticatedRequestUser | null
): Room[] {
  return rooms.filter((room) => {
    if (!isPrivateRoom(room)) return true;
    if (!user) return false;
    return isRoomMember(room, user.username);
  });
}

