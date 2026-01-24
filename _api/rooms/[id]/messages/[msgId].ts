/**
 * /api/rooms/[id]/messages/[msgId]
 * 
 * DELETE - Delete a specific message (admin only)
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";
import { validateAuth } from "../../../_utils/auth/index.js";
import { assertValidRoomId } from "../../../_utils/_validation.js";
import { roomExists, deleteMessage as deleteMessageFromRedis } from "../../_helpers/_redis.js";
import { initLogger } from "../../../_utils/_logging.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../../../_utils/_cors.js";

export const runtime = "nodejs";

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL as string,
    token: process.env.REDIS_KV_REST_API_TOKEN as string,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { requestId: _requestId, logger } = initLogger();
  const startTime = Date.now();
  
  const origin = getEffectiveOrigin(req);
  setCorsHeaders(res, origin, { methods: ["DELETE", "OPTIONS"] });
  
  logger.request(req.method || "DELETE", req.url || "/api/rooms/[id]/messages/[msgId]");
  
  if (req.method === "OPTIONS") {
    logger.response(204, Date.now() - startTime);
    return res.status(204).end();
  }

  if (!isAllowedOrigin(origin)) {
    logger.warn("Unauthorized origin", { origin });
    logger.response(403, Date.now() - startTime);
    return res.status(403).json({ error: "Unauthorized" });
  }

  if (req.method !== "DELETE") {
    logger.warn("Method not allowed", { method: req.method });
    logger.response(405, Date.now() - startTime);
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Require admin auth
  const authHeader = req.headers.authorization as string | undefined;
  const usernameHeader = req.headers["x-username"] as string | undefined;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token || !usernameHeader) {
    logger.warn("Missing credentials");
    logger.response(401, Date.now() - startTime);
    return res.status(401).json({ error: "Unauthorized - missing credentials" });
  }

  const authResult = await validateAuth(createRedis(), usernameHeader, token, {});
  if (!authResult.valid) {
    logger.warn("Invalid token", { username: usernameHeader });
    logger.response(401, Date.now() - startTime);
    return res.status(401).json({ error: "Unauthorized - invalid token" });
  }

  if (usernameHeader.toLowerCase() !== "ryo") {
    logger.warn("Admin required", { username: usernameHeader });
    logger.response(403, Date.now() - startTime);
    return res.status(403).json({ error: "Forbidden - admin required" });
  }

  // Extract room ID and message ID from query params
  const roomId = req.query.id as string | undefined;
  const messageId = req.query.msgId as string | undefined;

  if (!roomId || !messageId) {
    logger.warn("Missing IDs", { roomId, messageId });
    logger.response(400, Date.now() - startTime);
    return res.status(400).json({ error: "Room ID and message ID are required" });
  }

  try {
    assertValidRoomId(roomId, "delete-message");
  } catch (e) {
    logger.warn("Invalid room ID", { roomId, error: e instanceof Error ? e.message : "Invalid" });
    logger.response(400, Date.now() - startTime);
    return res.status(400).json({ error: e instanceof Error ? e.message : "Invalid room ID" });
  }

  try {
    const exists = await roomExists(roomId);
    if (!exists) {
      logger.warn("Room not found", { roomId });
      logger.response(404, Date.now() - startTime);
      return res.status(404).json({ error: "Room not found" });
    }

    const deleted = await deleteMessageFromRedis(roomId, messageId);
    if (!deleted) {
      logger.warn("Message not found", { roomId, messageId });
      logger.response(404, Date.now() - startTime);
      return res.status(404).json({ error: "Message not found" });
    }

    logger.info("Message deleted", { roomId, messageId });
    logger.response(200, Date.now() - startTime);
    return res.status(200).json({ success: true });
  } catch (error) {
    logger.error(`Error deleting message ${messageId} from room ${roomId}`, error);
    logger.response(500, Date.now() - startTime);
    return res.status(500).json({ error: "Failed to delete message" });
  }
}
