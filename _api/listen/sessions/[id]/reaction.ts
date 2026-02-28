/**
 * POST /api/listen/sessions/[id]/reaction
 * Send an emoji reaction in a session
 * 
 * Requires logged-in user (username). Anonymous listeners cannot send reactions.
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initLogger } from "../../../_utils/_logging.js";
import {
  isAllowedOrigin,
  getEffectiveOrigin,
  setCorsHeaders,
} from "../../../_utils/_cors.js";
import { runtime, maxDuration } from "../../_helpers/_constants.js";
import { broadcastReaction } from "../../_helpers/_pusher.js";
import { executeListenReactionCore } from "../../../cores/listen-reaction-core.js";

export { runtime, maxDuration };

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);
  const sessionId = req.query.id as string | undefined;

  logger.request(req.method || "POST", req.url || "/api/listen/sessions/[id]/reaction", `listen-reaction:${sessionId}`);

  if (req.method === "OPTIONS") {
    setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] });
    res.setHeader("Content-Type", "application/json");
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] });
  res.setHeader("Content-Type", "application/json");

  const result = await executeListenReactionCore({
    originAllowed: isAllowedOrigin(origin),
    method: req.method,
    sessionId,
    body: req.body,
    onReaction: (id, payload) => broadcastReaction(id, payload),
  });

  if (result.status === 200) {
    const body = req.body as { username?: string; emoji?: string };
    logger.info("Reaction sent", {
      sessionId,
      username: body?.username?.toLowerCase(),
      emoji: body?.emoji?.trim(),
    });
  } else if (result.status >= 500) {
    logger.error("Failed to send reaction");
  }
  logger.response(result.status, Date.now() - startTime);
  res.status(result.status).json(result.body);
}
