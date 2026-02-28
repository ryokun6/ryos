import {
  isProfaneUsername,
  assertValidRoomId,
} from "../_utils/_validation.js";
import { getRoom, setRoom } from "../rooms/_helpers/_redis.js";
import {
  setRoomPresence,
  removeRoomPresence,
  refreshRoomUserCount,
} from "../rooms/_helpers/_presence.js";
import { broadcastRoomUpdated } from "../rooms/_helpers/_pusher.js";
import { ensureUserExists } from "../rooms/_helpers/_users.js";
import type { CoreResponse } from "../_runtime/core-types.js";

interface SwitchRequest {
  previousRoomId?: string;
  nextRoomId?: string;
  username: string;
}

interface PresenceSwitchCoreInput {
  originAllowed: boolean;
  body: unknown;
}

export async function executePresenceSwitchCore(
  input: PresenceSwitchCoreInput
): Promise<CoreResponse> {
  if (!input.originAllowed) {
    return { status: 403, body: { error: "Unauthorized" } };
  }

  const body = input.body as SwitchRequest;
  const { previousRoomId, nextRoomId } = body || {};
  const username = body?.username?.toLowerCase();

  if (!username) {
    return { status: 400, body: { error: "Username is required" } };
  }

  try {
    if (previousRoomId) assertValidRoomId(previousRoomId, "switch-room");
    if (nextRoomId) assertValidRoomId(nextRoomId, "switch-room");
  } catch (error) {
    return {
      status: 400,
      body: { error: error instanceof Error ? error.message : "Validation error" },
    };
  }

  if (isProfaneUsername(username)) {
    return { status: 401, body: { error: "Unauthorized" } };
  }

  if (previousRoomId === nextRoomId) {
    return { status: 200, body: { success: true, noop: true } };
  }

  try {
    await ensureUserExists(username, "switch-room");

    if (previousRoomId) {
      const roomData = await getRoom(previousRoomId);
      if (roomData && roomData.type !== "private") {
        await removeRoomPresence(previousRoomId, username);
        await refreshRoomUserCount(previousRoomId);
        await broadcastRoomUpdated(previousRoomId);
      }
    }

    if (nextRoomId) {
      const roomData = await getRoom(nextRoomId);
      if (!roomData) {
        return { status: 404, body: { error: "Next room not found" } };
      }

      await setRoomPresence(nextRoomId, username);
      const userCount = await refreshRoomUserCount(nextRoomId);
      await setRoom(nextRoomId, { ...roomData, userCount });
      await broadcastRoomUpdated(nextRoomId);
    }

    return { status: 200, body: { success: true } };
  } catch {
    return { status: 500, body: { error: "Failed to switch room" } };
  }
}
