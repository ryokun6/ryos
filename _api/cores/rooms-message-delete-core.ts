import { Redis } from "@upstash/redis";
import { validateAuth } from "../_utils/auth/index.js";
import { assertValidRoomId } from "../_utils/_validation.js";
import {
  getRoom,
  roomExists,
  deleteMessage as deleteMessageFromRedis,
} from "../rooms/_helpers/_redis.js";
import type { Room } from "../rooms/_helpers/_types.js";
import type { CoreResponse } from "../_runtime/core-types.js";

interface RoomsMessageDeleteCoreInput {
  originAllowed: boolean;
  method: string | undefined;
  authHeader: string | undefined;
  usernameHeader: string | undefined;
  roomId: string | undefined;
  messageId: string | undefined;
  onMessageDeleted?: (roomId: string, messageId: string, roomData: Room) => Promise<void>;
}

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });
}

export async function executeRoomsMessageDeleteCore(
  input: RoomsMessageDeleteCoreInput
): Promise<CoreResponse> {
  if (!input.originAllowed) {
    return { status: 403, body: { error: "Unauthorized" } };
  }

  if (input.method !== "DELETE") {
    return { status: 405, body: { error: "Method not allowed" } };
  }

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

  if (input.usernameHeader.toLowerCase() !== "ryo") {
    return { status: 403, body: { error: "Forbidden - admin required" } };
  }

  if (!input.roomId || !input.messageId) {
    return {
      status: 400,
      body: { error: "Room ID and message ID are required" },
    };
  }

  try {
    assertValidRoomId(input.roomId, "delete-message");
  } catch (e) {
    return {
      status: 400,
      body: { error: e instanceof Error ? e.message : "Invalid room ID" },
    };
  }

  try {
    const exists = await roomExists(input.roomId);
    if (!exists) {
      return { status: 404, body: { error: "Room not found" } };
    }

    const roomData = await getRoom(input.roomId);
    if (!roomData) {
      return { status: 404, body: { error: "Room not found" } };
    }

    const deleted = await deleteMessageFromRedis(input.roomId, input.messageId);
    if (!deleted) {
      return { status: 404, body: { error: "Message not found" } };
    }

    if (input.onMessageDeleted) {
      await input.onMessageDeleted(input.roomId, input.messageId, roomData);
    }
    return {
      status: 200,
      body: { success: true, _meta: { roomId: input.roomId, messageId: input.messageId } },
    };
  } catch {
    return { status: 500, body: { error: "Failed to delete message" } };
  }
}
