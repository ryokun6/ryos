/**
 * POST /api/listen/sessions/[id]/leave
 * Leave a listen-together session
 * 
 * Supports both logged-in users (username) and anonymous listeners (anonymousId).
 * Anonymous listeners don't trigger user-left broadcasts to save Pusher events.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initLogger } from "../../../_utils/_logging.js";
import {
  isAllowedOrigin,
  getEffectiveOrigin,
  setCorsHeaders,
} from "../../../_utils/_cors.js";
import { runtime, maxDuration } from "../../_helpers/_constants.js";
import {
  broadcastDjChanged,
  broadcastSessionEnded,
  broadcastUserLeft,
} from "../../_helpers/_pusher.js";
import { executeListenLeaveCore } from "../../../cores/listen-leave-core.js";

export { runtime, maxDuration };

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);
  const sessionId = req.query.id as string | undefined;

  logger.request(req.method || "POST", req.url || "/api/listen/sessions/[id]/leave", `listen-leave:${sessionId}`);

  if (req.method === "OPTIONS") {
    setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] });
    res.setHeader("Content-Type", "application/json");
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] });
  res.setHeader("Content-Type", "application/json");

  const result = await executeListenLeaveCore({
    originAllowed: isAllowedOrigin(origin),
    method: req.method,
    sessionId,
    body: req.body,
    onDjChanged: (id, payload) => broadcastDjChanged(id, payload),
    onSessionEnded: (id) => broadcastSessionEnded(id),
    onUserLeft: (id, payload) => broadcastUserLeft(id, payload),
  });

  if (result.status === 200) {
    const body = req.body as { username?: string; anonymousId?: string };
    if (body?.username) {
      const payload = result.body as { session?: { id?: string } };
      if (!payload.session) {
        logger.info("Listen session ended by host", {
          sessionId,
          username: body.username.toLowerCase(),
        });
      } else {
        logger.info("User left listen session", {
          sessionId,
          username: body.username.toLowerCase(),
        });
      }
    } else {
      logger.info("Anonymous listener left", {
        sessionId,
        anonymousId: body?.anonymousId,
      });
    }
  } else if (result.status >= 500) {
    logger.error("Failed to leave listen session");
  }

  logger.response(result.status, Date.now() - startTime);
  res.status(result.status).json(result.body);
}
