/**
 * GET  /api/listen/sessions - List all active listen-together sessions
 * POST /api/listen/sessions - Create a new listen-together session
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initLogger } from "../../_utils/_logging.js";
import {
  isAllowedOrigin,
  getEffectiveOrigin,
  setCorsHeaders,
} from "../../_utils/_cors.js";
import { runtime, maxDuration } from "../_helpers/_constants.js";
import { broadcastUserJoined } from "../_helpers/_pusher.js";
import { executeListenSessionsCore } from "../../cores/listen-sessions-core.js";

export { runtime, maxDuration };

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);

  logger.request(req.method || "GET", req.url || "/api/listen/sessions", "listen-sessions");

  if (req.method === "OPTIONS") {
    setCorsHeaders(res, origin, { methods: ["GET", "POST", "OPTIONS"], headers: ["Content-Type"] });
    res.setHeader("Content-Type", "application/json");
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  setCorsHeaders(res, origin, { methods: ["GET", "POST", "OPTIONS"], headers: ["Content-Type"] });
  res.setHeader("Content-Type", "application/json");

  const result = await executeListenSessionsCore({
    originAllowed: isAllowedOrigin(origin),
    method: req.method,
    body: req.body,
    onUserJoined: (sessionId, username) =>
      broadcastUserJoined(sessionId, { username }),
  });

  if (result.status === 200) {
    const sessions = (result.body as { sessions?: unknown[] })?.sessions || [];
    logger.info("Listed sessions", { count: sessions.length });
  } else if (result.status === 201) {
    const session = (result.body as { session?: { id?: string; hostUsername?: string } })?.session;
    logger.info("Listen session created", {
      sessionId: session?.id,
      username: session?.hostUsername,
    });
  } else if (result.status >= 500) {
    logger.error("Listen sessions handler failed");
  }

  logger.response(result.status, Date.now() - startTime);
  res.status(result.status).json(result.body);
}
