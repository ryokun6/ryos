/**
 * POST /api/presence/switch
 * Switch between rooms (leave previous, join next)
 */

import { apiHandler } from "../_utils/api-handler.js";
import { isProfaneUsername, assertValidRoomId } from "../_utils/_validation.js";
import { getRoom, setRoom } from "../rooms/_helpers/_redis.js";
import { getRoomWriteAccessError } from "../rooms/_helpers/_access.js";
import { setRoomPresence, removeRoomPresence, refreshRoomUserCount } from "../rooms/_helpers/_presence.js";
import { broadcastRoomUpdated } from "../rooms/_helpers/_pusher.js";
import { ensureUserExists } from "../rooms/_helpers/_users.js";

export const runtime = "nodejs";
export const maxDuration = 15;

interface SwitchRequest {
  previousRoomId?: string;
  nextRoomId?: string;
  username?: string;
}

export default apiHandler(
  { methods: ["POST"], auth: "required" },
  async ({ req, res, logger, startTime, user }) => {
    const body = (req.body || {}) as SwitchRequest;
    const { previousRoomId, nextRoomId } = body;
    const claimedUsername = body.username?.toLowerCase();
    const username = user!.username;

    if (claimedUsername && claimedUsername !== username) {
      logger.warn("Username mismatch in presence switch body", {
        claimedUsername,
        authenticatedUsername: username,
      });
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "Forbidden - username mismatch" });
      return;
    }

    try {
      if (previousRoomId) assertValidRoomId(previousRoomId, "switch-room");
      if (nextRoomId) assertValidRoomId(nextRoomId, "switch-room");
    } catch (e) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: e instanceof Error ? e.message : "Validation error" });
      return;
    }

    if (isProfaneUsername(username)) {
      logger.response(401, Date.now() - startTime);
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    if (previousRoomId === nextRoomId) {
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ success: true, noop: true });
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
          logger.response(404, Date.now() - startTime);
          res.status(404).json({ error: "Next room not found" });
          return;
        }

        const accessError = getRoomWriteAccessError(roomData, user!);
        if (accessError) {
          logger.response(accessError.status, Date.now() - startTime);
          res.status(accessError.status).json({ error: accessError.error });
          return;
        }

        await setRoomPresence(nextRoomId, username);
        const userCount = await refreshRoomUserCount(nextRoomId);
        await setRoom(nextRoomId, { ...roomData, userCount });
        await broadcastRoomUpdated(nextRoomId);
      }

      logger.info("Room switched", { username, previousRoomId, nextRoomId });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ success: true });
    } catch (error) {
      logger.error("Error during switchRoom", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to switch room" });
    }
  }
);
