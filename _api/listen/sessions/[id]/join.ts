/**
 * POST /api/listen/sessions/[id]/join
 * Join a listen-together session
 * 
 * Supports both logged-in users (username) and anonymous listeners (anonymousId).
 * Anonymous listeners don't trigger user-joined broadcasts to save Pusher events.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initLogger } from "../../../_utils/_logging.js";
import {
  isAllowedOrigin,
  getEffectiveOrigin,
  setCorsHeaders,
} from "../../../_utils/_cors.js";
import { runtime, maxDuration } from "../../_helpers/_constants.js";
import { broadcastUserJoined } from "../../_helpers/_pusher.js";
import { executeListenJoinCore } from "../../../cores/listen-join-core.js";

export { runtime, maxDuration };

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);
  const sessionId = req.query.id as string | undefined;

  logger.request(req.method || "POST", req.url || "/api/listen/sessions/[id]/join", `listen-join:${sessionId}`);

  if (req.method === "OPTIONS") {
    setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] });
    res.setHeader("Content-Type", "application/json");
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] });
  res.setHeader("Content-Type", "application/json");

  const result = await executeListenJoinCore({
    originAllowed: isAllowedOrigin(origin),
    method: req.method,
    sessionId,
    body: req.body,
    onUserJoined: (id, username) => broadcastUserJoined(id, { username }),
  });

  if (result.status === 200) {
    const body = req.body as { username?: string; anonymousId?: string };
    if (body?.username) {
      logger.info("User joined listen session", {
        sessionId,
        username: body.username.toLowerCase(),
      });
    } else {
      logger.info("Anonymous listener joined", {
        sessionId,
        anonymousId: body?.anonymousId,
      });
    }
  } else if (result.status >= 500) {
    logger.error("Failed to join listen session");
  }
  logger.response(result.status, Date.now() - startTime);
  res.status(result.status).json(result.body);
}
