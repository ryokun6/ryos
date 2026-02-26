import { Redis } from "@upstash/redis";
import {
  isProfaneUsername,
  assertValidRoomId,
  assertValidUsername,
} from "../_utils/_validation.js";
import { getRoom, setRoom } from "../rooms/_helpers/_redis.js";
import {
  CHAT_ROOM_PREFIX,
  CHAT_ROOM_USERS_PREFIX,
  CHAT_ROOMS_SET,
} from "../rooms/_helpers/_constants.js";
import {
  deleteRoomPresence,
  removeRoomPresence,
  refreshRoomUserCount,
} from "../rooms/_helpers/_presence.js";
import type { Room } from "../rooms/_helpers/_types.js";
import type { CoreResponse } from "../_runtime/core-types.js";

interface RoomsLeaveCoreInput {
  originAllowed: boolean;
  method: string | undefined;
  roomId: string | undefined;
  body: unknown;
  onRoomDeleted?: (
    roomId: string,
    type: string | undefined,
    members: string[]
  ) => Promise<void>;
  onRoomUpdated?: (roomId: string) => Promise<void>;
}

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });
}

export async function executeRoomsLeaveCore(
  input: RoomsLeaveCoreInput
): Promise<CoreResponse> {
  if (!input.originAllowed) {
    return { status: 403, body: { error: "Unauthorized" } };
  }
  if (input.method !== "POST") {
    return { status: 405, body: { error: "Method not allowed" } };
  }
  if (!input.roomId) {
    return { status: 400, body: { error: "Room ID is required" } };
  }

  const body = (input.body || {}) as { username?: string };
  const username = body?.username?.toLowerCase();
  if (!username) {
    return { status: 400, body: { error: "Username is required" } };
  }

  try {
    assertValidUsername(username, "leave-room");
    assertValidRoomId(input.roomId, "leave-room");
  } catch (e) {
    return {
      status: 400,
      body: { error: e instanceof Error ? e.message : "Validation error" },
    };
  }

  if (isProfaneUsername(username)) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  try {
    const roomData = await getRoom(input.roomId);
    if (!roomData) {
      return { status: 404, body: { error: "Room not found" } };
    }

    const removed = await removeRoomPresence(input.roomId, username);
    if (!removed) {
      return {
        status: 200,
        body: { success: true, _meta: { roomId: input.roomId, username } },
      };
    }

    const userCount = await refreshRoomUserCount(input.roomId);

    if (roomData.type === "private") {
      const updatedMembers = roomData.members
        ? roomData.members.filter((m) => m !== username)
        : [];

      if (updatedMembers.length <= 1) {
        const pipeline = createRedis().pipeline();
        pipeline.del(`${CHAT_ROOM_PREFIX}${input.roomId}`);
        pipeline.del(`chat:messages:${input.roomId}`);
        pipeline.del(`${CHAT_ROOM_USERS_PREFIX}${input.roomId}`);
        pipeline.srem(CHAT_ROOMS_SET, input.roomId);
        await pipeline.exec();
        await deleteRoomPresence(input.roomId);

        if (input.onRoomDeleted) {
          await input.onRoomDeleted(input.roomId, roomData.type, roomData.members || []);
        }
        return {
          status: 200,
          body: {
            success: true,
            _meta: { roomId: input.roomId, username, scope: "private-last-member" },
          },
        };
      }

      const updatedRoom: Room = { ...roomData, members: updatedMembers, userCount };
      await setRoom(input.roomId, updatedRoom);
      if (input.onRoomUpdated) {
        await input.onRoomUpdated(input.roomId);
      }
      if (input.onRoomDeleted) {
        await input.onRoomDeleted(input.roomId, roomData.type, [username]);
      }
      return {
        status: 200,
        body: {
          success: true,
          _meta: {
            roomId: input.roomId,
            username,
            scope: "private-member-left",
            remainingMembers: updatedMembers.length,
          },
        },
      };
    }

    if (input.onRoomUpdated) {
      await input.onRoomUpdated(input.roomId);
    }
    return {
      status: 200,
      body: {
        success: true,
        _meta: { roomId: input.roomId, username, scope: "public" },
      },
    };
  } catch {
    return { status: 500, body: { error: "Failed to leave room" } };
  }
}
