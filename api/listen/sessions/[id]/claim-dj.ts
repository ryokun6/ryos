/**
 * POST /api/listen/sessions/[id]/claim-dj
 * A member takes over playback only when the current DJ has stopped syncing.
 */

import { apiHandler } from "../../../_utils/api-handler.js";
import {
  assertValidRoomId,
  assertValidUsername,
  isProfaneUsername,
} from "../../../_utils/_validation.js";
import { getCurrentTimestamp, getSession, setSession } from "../../_helpers/_redis.js";
import {
  migrateSessionClientIds,
  normalizeClientInstanceId,
} from "../../_helpers/_client-instance.js";
import { broadcastDjChanged } from "../../_helpers/_pusher.js";
import { DJ_STALE_FOR_LIBRARY_FALLBACK_MS } from "../../../../src/shared/listen/trackAdvance.js";

const STALE_MS = Math.max(DJ_STALE_FOR_LIBRARY_FALLBACK_MS, 30_000);

export default apiHandler(
  { methods: ["POST"], auth: "required" },
  async ({ req, res, redis, logger, startTime, user }) => {
    const sessionId = req.query.id as string | undefined;
    if (!sessionId) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Session ID is required" });
      return;
    }

    const body = (req.body || {}) as {
      username?: string;
      clientInstanceId?: string;
    };
    const username = user!.username;
    if (body.username && body.username.toLowerCase() !== username) {
      logger.response(403, Date.now() - startTime);
      res.status(403).json({ error: "Forbidden - username mismatch" });
      return;
    }

    try {
      assertValidUsername(username, "listen-claim-dj");
      assertValidRoomId(sessionId, "listen-claim-dj");
    } catch (error) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({
        error: error instanceof Error ? error.message : "Validation error",
      });
      return;
    }

    if (isProfaneUsername(username)) {
      logger.response(401, Date.now() - startTime);
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    try {
      const session = await getSession(sessionId, redis);
      if (!session) {
        logger.response(404, Date.now() - startTime);
        res.status(404).json({ error: "Session not found" });
        return;
      }

      migrateSessionClientIds(session);
      const clientInstanceId = normalizeClientInstanceId(
        username,
        body.clientInstanceId
      );
      const member = session.users.find(
        (entry) =>
          entry.username === username && entry.clientInstanceId === clientInstanceId
      );
      if (!member) {
        logger.response(403, Date.now() - startTime);
        res.status(403).json({ error: "not_in_session" });
        return;
      }

      const now = getCurrentTimestamp();
      const stale = now - session.lastSyncAt >= STALE_MS;
      const already =
        session.djUsername === username &&
        session.djClientInstanceId === clientInstanceId;
      if (already) {
        logger.response(200, Date.now() - startTime);
        res.status(200).json({ success: true, session, claimed: false });
        return;
      }
      if (!stale) {
        logger.response(409, Date.now() - startTime);
        res.status(409).json({ error: "dj_still_active" });
        return;
      }

      const previousDj = session.djUsername;
      session.djUsername = username;
      session.djClientInstanceId = clientInstanceId;
      session.lastSyncAt = now;
      await setSession(sessionId, session, redis);
      await broadcastDjChanged(sessionId, {
        previousDj,
        newDj: username,
        newDjClientInstanceId: clientInstanceId,
      });

      logger.info("Stale DJ claimed", { sessionId, previousDj, newDj: username });
      logger.response(200, Date.now() - startTime);
      res.status(200).json({ success: true, session, claimed: true });
    } catch (error) {
      logger.error("Failed to claim DJ", error);
      logger.response(500, Date.now() - startTime);
      res.status(500).json({ error: "Failed to claim playback" });
    }
  }
);
