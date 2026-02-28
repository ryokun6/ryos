import { Redis } from "@upstash/redis";
import {
  isProfaneUsername,
  assertValidRoomId,
  assertValidUsername,
} from "../_utils/_validation.js";
import { getRoom, setRoom } from "../rooms/_helpers/_redis.js";
import {
  setRoomPresence,
  refreshRoomUserCount,
} from "../rooms/_helpers/_presence.js";
import type { Room } from "../rooms/_helpers/_types.js";
import type { CoreResponse } from "../_runtime/core-types.js";

interface RoomsJoinCoreInput {
  originAllowed: boolean;
  method: string | undefined;
  roomId: string | undefined;
  body: unknown;
  onRoomUpdated?: (roomId: string) => Promise<void>;
}

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });
}

export async function executeRoomsJoinCore(
  input: RoomsJoinCoreInput
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
    assertValidUsername(username, "join-room");
    assertValidRoomId(input.roomId, "join-room");
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
    const [roomData, userData] = await Promise.all([
      getRoom(input.roomId),
      createRedis().get(`chat:users:${username}`),
    ]);

    if (!roomData) {
      return { status: 404, body: { error: "Room not found" } };
    }
    if (!userData) {
      return { status: 404, body: { error: "User not found" } };
    }

    await setRoomPresence(input.roomId, username);
    const userCount = await refreshRoomUserCount(input.roomId);
    const updatedRoom: Room = { ...roomData, userCount };
    await setRoom(input.roomId, updatedRoom);
    if (input.onRoomUpdated) {
      await input.onRoomUpdated(input.roomId);
    }

    return {
      status: 200,
      body: { success: true, _meta: { roomId: input.roomId, username, userCount } },
    };
  } catch {
    return { status: 500, body: { error: "Failed to join room" } };
  }
}
