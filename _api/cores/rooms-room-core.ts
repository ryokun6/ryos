import { Redis } from "@upstash/redis";
import { validateAuth } from "../_utils/auth/index.js";
import { assertValidRoomId } from "../_utils/_validation.js";
import { getRoom, setRoom } from "../rooms/_helpers/_redis.js";
import {
  CHAT_ROOM_PREFIX,
  CHAT_ROOM_USERS_PREFIX,
  CHAT_ROOMS_SET,
} from "../rooms/_helpers/_constants.js";
import {
  refreshRoomUserCount,
  deleteRoomPresence,
} from "../rooms/_helpers/_presence.js";
import type { Room } from "../rooms/_helpers/_types.js";
import type { CoreResponse } from "../_runtime/core-types.js";

interface RoomsRoomCoreInput {
  originAllowed: boolean;
  method: string | undefined;
  roomId: string | undefined;
  authHeader: string | undefined;
  usernameHeader: string | undefined;
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

export async function executeRoomsRoomCore(
  input: RoomsRoomCoreInput
): Promise<CoreResponse> {
  if (!input.originAllowed) {
    return { status: 403, body: { error: "Unauthorized" } };
  }

  if (!input.roomId) {
    return { status: 400, body: { error: "Room ID is required" } };
  }

  try {
    assertValidRoomId(input.roomId, "room-operation");
  } catch (e) {
    return {
      status: 400,
      body: { error: e instanceof Error ? e.message : "Invalid room ID" },
    };
  }

  if (input.method === "GET") {
    try {
      const roomObj = await getRoom(input.roomId);
      if (!roomObj) {
        return { status: 404, body: { error: "Room not found" } };
      }
      const userCount = await refreshRoomUserCount(input.roomId);
      const room: Room = { ...roomObj, userCount };
      return { status: 200, body: { room, _meta: { userCount } } };
    } catch {
      return { status: 500, body: { error: "Failed to fetch room" } };
    }
  }

  if (input.method === "DELETE") {
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

    try {
      const roomData = await getRoom(input.roomId);
      if (!roomData) {
        return { status: 404, body: { error: "Room not found" } };
      }

      if (roomData.type === "private") {
        if (!roomData.members || !roomData.members.includes(username)) {
          return { status: 403, body: { error: "Unauthorized - not a member" } };
        }
      } else if (username !== "ryo") {
        return { status: 403, body: { error: "Unauthorized - admin required" } };
      }

      if (roomData.type === "private") {
        const updatedMembers = roomData.members!.filter((m) => m !== username);
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

        const updatedRoom: Room = {
          ...roomData,
          members: updatedMembers,
          userCount: updatedMembers.length,
        };
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
          _meta: { roomId: input.roomId, username, scope: "public" },
        },
      };
    } catch {
      return { status: 500, body: { error: "Failed to delete room" } };
    }
  }

  return { status: 405, body: { error: "Method not allowed" } };
}
