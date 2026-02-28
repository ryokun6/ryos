/**
 * GET /api/listen/sessions/[id]
 * Fetch session state
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initLogger } from "../../../_utils/_logging.js";
import {
  isAllowedOrigin,
  getEffectiveOrigin,
  setCorsHeaders,
} from "../../../_utils/_cors.js";
import { runtime, maxDuration } from "../../_helpers/_constants.js";
import { executeListenSessionGetCore } from "../../../cores/listen-session-get-core.js";

export { runtime, maxDuration };

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);
  const sessionId = req.query.id as string | undefined;

  logger.request(req.method || "GET", req.url || "/api/listen/sessions/[id]", `listen-session:${sessionId}`);

  if (req.method === "OPTIONS") {
    setCorsHeaders(res, origin, { methods: ["GET", "OPTIONS"] });
    res.setHeader("Content-Type", "application/json");
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  setCorsHeaders(res, origin, { methods: ["GET", "OPTIONS"] });
  res.setHeader("Content-Type", "application/json");

  const result = await executeListenSessionGetCore({
    originAllowed: isAllowedOrigin(origin),
    method: req.method,
    sessionId,
  });

  if (result.status === 200) {
    logger.info("Listen session fetched", { sessionId });
  } else if (result.status >= 500) {
    logger.error("Failed to fetch listen session");
  }
  logger.response(result.status, Date.now() - startTime);
  res.status(result.status).json(result.body);
}
