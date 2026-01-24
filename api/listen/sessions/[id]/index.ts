/**
 * GET /api/listen/sessions/[id]
 * Fetch session state
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertValidRoomId } from "../../../_utils/_validation.js";
import { initLogger } from "../../../_utils/_logging.js";
import {
  isAllowedOrigin,
  getEffectiveOrigin,
  setCorsHeaders,
} from "../../../_utils/_cors.js";
import {
  getSession,
  touchSession,
} from "../../_helpers/_redis.js";
import { runtime, maxDuration } from "../../_helpers/_constants.js";

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

  if (!isAllowedOrigin(origin)) {
    logger.response(403, Date.now() - startTime);
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  if (!sessionId) {
    logger.response(400, Date.now() - startTime);
    res.status(400).json({ error: "Session ID is required" });
    return;
  }

  try {
    assertValidRoomId(sessionId, "listen-session-get");
  } catch (error) {
    logger.response(400, Date.now() - startTime);
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid session ID" });
    return;
  }

  if (req.method !== "GET") {
    logger.response(405, Date.now() - startTime);
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const session = await getSession(sessionId);
    if (!session) {
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "Session not found" });
      return;
    }

    await touchSession(sessionId);

    logger.info("Listen session fetched", { sessionId });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ session });
  } catch (error) {
    logger.error("Failed to fetch listen session", error);
    logger.response(500, Date.now() - startTime);
    res.status(500).json({ error: "Failed to fetch session" });
  }
}
