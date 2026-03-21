/**
 * POST /api/listen/sessions/[id]/remote-command
 * Non-DJ members send playback intents; the DJ client applies them and re-syncs state.
 */

import { apiHandler } from "../../../_utils/api-handler.js";
import {
  assertValidRoomId,
  assertValidUsername,
  isProfaneUsername,
} from "../../../_utils/_validation.js";
import { getCurrentTimestamp, getSession } from "../../_helpers/_redis.js";
import { runtime, maxDuration } from "../../_helpers/_constants.js";
import type {
  ListenRemoteCommandAction,
  RemoteCommandRequest,
} from "../../_helpers/_types.js";
import {
  migrateSessionClientIds,
  normalizeClientInstanceId,
} from "../../_helpers/_client-instance.js";
import { broadcastRemoteCommand } from "../../_helpers/_pusher.js";

export { runtime, maxDuration };

const VALID_ACTIONS: ListenRemoteCommandAction[] = [
  "play",
  "pause",
  "next",
  "previous",
  "playTrack",
];

export default apiHandler(
  { methods: ["POST"], auth: "required" },
  async ({ req, res, logger, startTime, user }) => {
    const sessionId = req.query.id as string | undefined;

    if (!sessionId) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Session ID is required" });
      return;
    }

    const body = (req.body || {}) as RemoteCommandRequest;
    const claimedUsername = body?.username?.toLowerCase();
    const username = user!.username;
    const action = body?.action;

    if (claimedUsername && claimedUsername !== username) {
      logger.warn("Username mismatch in listen remote-command body", {
        claimedUsername,
        authenticatedUsername: username,
      });
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "Forbidden - username mismatch" });
      return;
    }

    if (!action || !VALID_ACTIONS.includes(action)) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Invalid or missing action" });
      return;
    }

    if (action === "playTrack") {
      const trackId = typeof body.trackId === "string" ? body.trackId.trim() : "";
      if (!trackId) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "trackId is required for playTrack" });
        return;
      }
    }

    try {
      assertValidUsername(username, "listen-remote-command");
      assertValidRoomId(sessionId, "listen-remote-command");
    } catch (error) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: error instanceof Error ? error.message : "Validation error" });
      return;
    }

    if (isProfaneUsername(username)) {
      logger.response(401, Date.now() - startTime);
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const session = await getSession(sessionId);

      if (!session) {
        logger.response(404, Date.now() - startTime);
        res.status(404).json({ error: "Session not found" });
        return;
      }

      migrateSessionClientIds(session);

      const fromClientId = normalizeClientInstanceId(username, body.fromClientInstanceId);

      if (
        !session.users.some(
          (u) => u.username === username && u.clientInstanceId === fromClientId
        )
      ) {
        logger.response(403, Date.now() - startTime);
        res.status(403).json({ error: "User not in session" });
        return;
      }

      if (
        session.djUsername === username &&
        session.djClientInstanceId === fromClientId
      ) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "Playback device should use local controls, not remote commands" });
        return;
      }

      const now = getCurrentTimestamp();
      const positionMs =
        typeof body.positionMs === "number" && Number.isFinite(body.positionMs)
          ? Math.max(0, Math.floor(body.positionMs))
          : undefined;

      await broadcastRemoteCommand(sessionId, {
        fromUsername: username,
        fromClientInstanceId: fromClientId,
        action,
        positionMs,
        trackId: typeof body.trackId === "string" ? body.trackId.trim() : undefined,
        trackMeta: body.trackMeta,
        timestamp: now,
      });

      logger.info("Listen remote command", { sessionId, username, action });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ success: true });
    } catch (error) {
      logger.error("Failed to broadcast listen remote command", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to send remote command" });
    }
  }
);
