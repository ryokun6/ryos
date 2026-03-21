/**
 * POST /api/listen/sessions/[id]/transfer-host
 * Session host assigns another member as the new host (session ownership).
 */

import { apiHandler } from "../../../_utils/api-handler.js";
import {
  assertValidRoomId,
  assertValidUsername,
  isProfaneUsername,
} from "../../../_utils/_validation.js";
import { getCurrentTimestamp, getSession, setSession } from "../../_helpers/_redis.js";
import { runtime, maxDuration } from "../../_helpers/_constants.js";
import type { TransferHostRequest } from "../../_helpers/_types.js";
import {
  migrateSessionClientIds,
  normalizeClientInstanceId,
} from "../../_helpers/_client-instance.js";
import { broadcastHostChanged } from "../../_helpers/_pusher.js";

export { runtime, maxDuration };

export default apiHandler(
  { methods: ["POST"], auth: "required" },
  async ({ req, res, logger, startTime, user }) => {
    const sessionId = req.query.id as string | undefined;

    if (!sessionId) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Session ID is required" });
      return;
    }

    const body = (req.body || {}) as TransferHostRequest;
    const claimedUsername = body?.username?.toLowerCase();
    const username = user!.username;
    const callerClientId = normalizeClientInstanceId(username, body.clientInstanceId);
    const nextHostUsername = body?.nextHostUsername?.toLowerCase();

    if (claimedUsername && claimedUsername !== username) {
      logger.warn("Username mismatch in listen transfer-host body", {
        claimedUsername,
        authenticatedUsername: username,
      });
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "Forbidden - username mismatch" });
      return;
    }

    if (!nextHostUsername) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "nextHostUsername is required" });
      return;
    }

    try {
      assertValidUsername(username, "listen-transfer-host");
      assertValidUsername(nextHostUsername, "listen-transfer-host-target");
      assertValidRoomId(sessionId, "listen-transfer-host");
    } catch (error) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: error instanceof Error ? error.message : "Validation error" });
      return;
    }

    if (isProfaneUsername(username) || isProfaneUsername(nextHostUsername)) {
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

      if (
        session.hostUsername !== username ||
        session.hostClientInstanceId !== callerClientId
      ) {
        logger.response(403, Date.now() - startTime);
        res.status(403).json({ error: "Only the host can transfer host" });
        return;
      }

      const nextHostClientRaw = body.nextHostClientInstanceId;
      const nextHostClientId =
        typeof nextHostClientRaw === "string" && nextHostClientRaw.trim().length > 0
          ? normalizeClientInstanceId(nextHostUsername, nextHostClientRaw)
          : undefined;

      const candidates = session.users.filter((u) => u.username === nextHostUsername);
      if (candidates.length === 0) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "New host must be an active session member" });
        return;
      }

      const targetHost =
        nextHostClientId != null
          ? candidates.find((u) => u.clientInstanceId === nextHostClientId)
          : [...candidates].sort((a, b) => a.joinedAt - b.joinedAt)[0];

      if (!targetHost) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "New host must be an active session member" });
        return;
      }

      const previousHost = session.hostUsername;
      const newHostClientId =
        targetHost.clientInstanceId ??
        normalizeClientInstanceId(targetHost.username, undefined);

      if (
        session.hostUsername === targetHost.username &&
        session.hostClientInstanceId === newHostClientId
      ) {
        logger.response(400, Date.now() - startTime);
        res.status(400).json({ error: "That connection is already the host" });
        return;
      }

      session.hostUsername = targetHost.username;
      session.hostClientInstanceId = newHostClientId;
      session.lastSyncAt = getCurrentTimestamp();

      await setSession(sessionId, session);
      await broadcastHostChanged(sessionId, {
        previousHost,
        newHost: targetHost.username,
        newHostClientInstanceId: session.hostClientInstanceId,
      });

      logger.info("Listen session host transferred", {
        sessionId,
        previousHost,
        newHost: nextHostUsername,
      });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ success: true, session });
    } catch (error) {
      logger.error("Failed to transfer listen session host", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to transfer host" });
    }
  }
);
