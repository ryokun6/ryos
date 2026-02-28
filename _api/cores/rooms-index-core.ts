import { Redis } from "@upstash/redis";
import { validateAuth } from "../_utils/auth/index.js";
import { isProfaneUsername } from "../_utils/_validation.js";
import { getRoomsWithCountsFast, setRoomPresence } from "../rooms/_helpers/_presence.js";
import {
  generateId,
  getCurrentTimestamp,
  setRoom,
  registerRoom,
} from "../rooms/_helpers/_redis.js";
import type { Room } from "../rooms/_helpers/_types.js";
import type { CoreResponse } from "../_runtime/core-types.js";

interface RoomsIndexCoreInput {
  originAllowed: boolean;
  method: string | undefined;
  queryUsername: string | undefined;
  body: unknown;
  authHeader: string | undefined;
  usernameHeader: string | undefined;
  onRoomCreated?: (room: Room) => Promise<void>;
}

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });
}

export async function executeRoomsIndexCore(
  input: RoomsIndexCoreInput
): Promise<CoreResponse> {
  if (!input.originAllowed) {
    return { status: 403, body: { error: "Unauthorized" } };
  }

  if (input.method === "GET") {
    try {
      const username = input.queryUsername?.toLowerCase() || null;
      const allRooms = await getRoomsWithCountsFast();
      const visibleRooms = allRooms.filter((room) => {
        if (!room.type || room.type === "public") return true;
        if (room.type === "private" && room.members && username) {
          return room.members.includes(username);
        }
        return false;
      });

      return {
        status: 200,
        body: { rooms: visibleRooms, _meta: { total: allRooms.length, visible: visibleRooms.length, username } },
      };
    } catch {
      return { status: 500, body: { error: "Failed to fetch rooms" } };
    }
  }

  if (input.method === "POST") {
    const token = input.authHeader?.startsWith("Bearer ")
      ? input.authHeader.slice(7)
      : null;

    if (!token || !input.usernameHeader) {
      return { status: 401, body: { error: "Unauthorized - missing credentials" } };
    }

    const authResult = await validateAuth(createRedis(), input.usernameHeader, token, {});
    if (!authResult.valid) {
      return { status: 401, body: { error: "Unauthorized - invalid token" } };
    }

    const username = input.usernameHeader.toLowerCase();
    const body = (input.body || {}) as {
      name?: string;
      type?: "public" | "private";
      members?: string[];
    };
    const originalName = body.name;
    const type = body.type || "public";
    const members = body.members || [];

    if (!["public", "private"].includes(type)) {
      return { status: 400, body: { error: "Invalid room type" } };
    }

    if (type === "public") {
      if (!originalName) {
        return {
          status: 400,
          body: { error: "Room name is required for public rooms" },
        };
      }
      if (username !== "ryo") {
        return {
          status: 403,
          body: { error: "Forbidden - Only admin can create public rooms" },
        };
      }
      if (isProfaneUsername(originalName)) {
        return {
          status: 400,
          body: { error: "Room name contains inappropriate language" },
        };
      }
    }

    let normalizedMembers = [...members];
    if (type === "private") {
      if (!members || members.length === 0) {
        return {
          status: 400,
          body: { error: "At least one member is required for private rooms" },
        };
      }
      normalizedMembers = members.map((m: string) => m.toLowerCase());
      if (!normalizedMembers.includes(username)) {
        normalizedMembers.push(username);
      }
    }

    const roomName =
      type === "public"
        ? originalName!.toLowerCase().replace(/ /g, "-")
        : [...normalizedMembers].sort().map((m: string) => `@${m}`).join(", ");

    try {
      const roomId = generateId();
      const room: Room = {
        id: roomId,
        name: roomName,
        type,
        createdAt: getCurrentTimestamp(),
        userCount: type === "private" ? normalizedMembers.length : 0,
        ...(type === "private" && { members: normalizedMembers }),
      };

      await setRoom(roomId, room);
      await registerRoom(roomId);

      if (type === "private") {
        await Promise.all(
          normalizedMembers.map((member: string) => setRoomPresence(roomId, member))
        );
      }

      if (input.onRoomCreated) {
        await input.onRoomCreated(room);
      }

      return { status: 201, body: { room } };
    } catch {
      return { status: 500, body: { error: "Failed to create room" } };
    }
  }

  return { status: 405, body: { error: "Method not allowed" } };
}
