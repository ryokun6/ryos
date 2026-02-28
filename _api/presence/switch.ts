/**
 * POST /api/presence/switch
 *
 * Switch between rooms (leave previous, join next)
 */

import {
  refreshRoomUserCount,
  removeRoomPresence,
  setRoomPresence,
} from "../rooms/_helpers/_presence.js";
import { broadcastRoomUpdated } from "../rooms/_helpers/_pusher.js";
import { getRoom, setRoom } from "../rooms/_helpers/_redis.js";
import { ensureUserExists } from "../rooms/_helpers/_users.js";
import { createApiHandler } from "../_utils/handler.js";
import { assertValidRoomId, isProfaneUsername } from "../_utils/_validation.js";

export const runtime = "nodejs";
export const maxDuration = 15;

interface SwitchRequest {
  previousRoomId?: string;
  nextRoomId?: string;
  username: string;
}

export default createApiHandler(
  {
    operation: "switch",
    methods: ["POST"],
    cors: {
      headers: ["Content-Type"],
    },
  },
  async (_req, _res, ctx): Promise<void> => {
    const { data: body, error } = ctx.parseJsonBody<SwitchRequest>();
    if (error || !body) {
      ctx.response.badRequest(error ?? "Invalid JSON body");
      return;
    }

    const { previousRoomId, nextRoomId } = body;
    const username = body.username?.toLowerCase();

    if (!username) {
      ctx.response.badRequest("Username is required");
      return;
    }

    try {
      if (previousRoomId) {
        assertValidRoomId(previousRoomId, "switch-room");
      }
      if (nextRoomId) {
        assertValidRoomId(nextRoomId, "switch-room");
      }
    } catch (validationError) {
      ctx.response.badRequest(
        validationError instanceof Error
          ? validationError.message
          : "Validation error"
      );
      return;
    }

    if (isProfaneUsername(username)) {
      ctx.response.unauthorized("Unauthorized");
      return;
    }

    if (previousRoomId === nextRoomId) {
      ctx.response.ok({ success: true, noop: true });
      return;
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
          ctx.response.notFound("Next room not found");
          return;
        }

        await setRoomPresence(nextRoomId, username);
        const userCount = await refreshRoomUserCount(nextRoomId);
        await setRoom(nextRoomId, { ...roomData, userCount });
        await broadcastRoomUpdated(nextRoomId);
      }

      ctx.logger.info("Room switched", {
        username,
        previousRoomId,
        nextRoomId,
      });
      ctx.response.ok({ success: true });
    } catch (routeError) {
      ctx.logger.error("Error during switchRoom", routeError);
      ctx.response.serverError("Failed to switch room");
    }
  }
);
