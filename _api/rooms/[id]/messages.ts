/**
 * /api/rooms/[id]/messages
 * 
 * GET  - Get messages for a room
 * POST - Send a message to a room
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initLogger } from "../../_utils/_logging.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../../_utils/_cors.js";
import { broadcastNewMessage } from "../_helpers/_pusher.js";
import { executeRoomsMessagesCore } from "../../cores/rooms-messages-core.js";

export const runtime = "nodejs";

// ============================================================================
// Route Handler
// ============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { requestId: _requestId, logger } = initLogger();
  const startTime = Date.now();
  
  const origin = getEffectiveOrigin(req);
  setCorsHeaders(res, origin);
  
  logger.request(req.method || "GET", req.url || "/api/rooms/[id]/messages");
  
  if (req.method === "OPTIONS") {
    logger.response(204, Date.now() - startTime);
    return res.status(204).end();
  }

  if (!isAllowedOrigin(origin)) {
    logger.warn("Unauthorized origin", { origin });
    logger.response(403, Date.now() - startTime);
    return res.status(403).json({ error: "Unauthorized" });
  }

  const roomId = req.query.id as string | undefined;
  const result = await executeRoomsMessagesCore({
    originAllowed: true,
    method: req.method,
    roomId,
    queryLimit: req.query.limit as string | undefined,
    body: req.body,
    authHeader: req.headers.authorization as string | undefined,
    usernameHeader: req.headers["x-username"] as string | undefined,
    onNewMessage: (id, message, roomData) => broadcastNewMessage(id, message, roomData),
  });

  if (result.status === 400 && !roomId) {
    logger.warn("Missing room ID");
  } else if (result.status === 400) {
    const error = (result.body as { error?: string })?.error;
    if (error?.includes("Invalid room ID")) {
      logger.warn("Invalid room ID", { roomId });
    } else if (error === "Content is required") {
      logger.warn("Missing content");
    } else if (error === "Username contains inappropriate language") {
      logger.warn("Inappropriate username");
    } else if (error?.includes("Message exceeds maximum length")) {
      logger.warn("Message too long", { roomId });
    } else if (error === "Duplicate message detected") {
      logger.warn("Duplicate message detected", { roomId });
    }
  } else if (result.status === 401) {
    const error = (result.body as { error?: string })?.error;
    if (error?.includes("missing credentials")) {
      logger.warn("Missing credentials");
    } else if (error?.includes("invalid token")) {
      logger.warn("Invalid token", { username: req.headers["x-username"] });
    } else {
      logger.warn("Profane username");
    }
  } else if (result.status === 404) {
    logger.warn("Room not found", { roomId });
  } else if (result.status === 405) {
    logger.warn("Method not allowed", { method: req.method });
  } else if (result.status === 200) {
    const meta = (result.body as { _meta?: { count?: number } })?._meta;
    logger.info("Messages retrieved", { roomId, count: meta?.count });
  } else if (result.status === 201) {
    const meta = (result.body as {
      _meta?: { roomId?: string; username?: string; messageId?: string };
    })?._meta;
    logger.info("Pusher room-message broadcast sent", {
      roomId: meta?.roomId,
      messageId: meta?.messageId,
    });
    logger.info("Message sent", {
      username: meta?.username,
      roomId: meta?.roomId,
      messageId: meta?.messageId,
    });
  } else if (result.status >= 500) {
    if (req.method === "GET") {
      logger.error(`Error fetching messages for room ${roomId}`);
    } else if (req.method === "POST") {
      logger.error(`Error sending message in room ${roomId}`);
    }
  }

  const body =
    typeof result.body === "object" && result.body && "_meta" in (result.body as Record<string, unknown>)
      ? (() => {
          const { _meta: _ignored, ...rest } = result.body as Record<string, unknown>;
          return rest;
        })()
      : result.body;

  logger.response(result.status, Date.now() - startTime);
  return res.status(result.status).json(body);
}
