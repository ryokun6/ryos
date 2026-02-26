/**
 * POST /api/ai/ryo-reply
 * 
 * Generate an AI reply as Ryo in chat rooms
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../_utils/_cors.js";
import { broadcastNewMessage } from "../rooms/_helpers/_pusher.js";
import { initLogger } from "../_utils/_logging.js";
import { executeAiRyoReplyCore } from "../cores/ai-ryo-reply-core.js";

export const runtime = "nodejs";

// ============================================================================
// Route Handler
// ============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { requestId: _requestId, logger } = initLogger();
  const startTime = Date.now();
  
  const origin = getEffectiveOrigin(req);
  setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"] });
  
  logger.request(req.method || "POST", req.url || "/api/ai/ryo-reply");
  
  if (req.method === "OPTIONS") {
    logger.response(204, Date.now() - startTime);
    return res.status(204).end();
  }

  if (!isAllowedOrigin(origin)) {
    logger.warn("Unauthorized origin", { origin });
    logger.response(403, Date.now() - startTime);
    return res.status(403).json({ error: "Unauthorized" });
  }

  if (req.method !== "POST") {
    logger.warn("Method not allowed", { method: req.method });
    logger.response(405, Date.now() - startTime);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const result = await executeAiRyoReplyCore({
    originAllowed: true,
    method: req.method,
    authHeader: req.headers.authorization as string | undefined,
    usernameHeader: req.headers["x-username"] as string | undefined,
    body: req.body,
    onBroadcast: (roomId, message) => broadcastNewMessage(roomId, message),
  });

  if (result.status === 401) {
    const error = (result.body as { error?: string })?.error;
    if (error?.includes("missing credentials")) {
      logger.warn("Missing credentials");
    } else {
      logger.warn("Invalid token", { username: req.headers["x-username"] });
    }
  } else if (result.status === 429) {
    logger.warn("Rate limit exceeded", { username: req.headers["x-username"] });
  } else if (result.status === 400) {
    const error = (result.body as { error?: string })?.error;
    if (error === "Invalid JSON body") {
      logger.warn("Invalid JSON body");
    } else if (error === "Prompt is required") {
      logger.warn("Missing prompt");
    } else {
      logger.warn("Invalid room ID");
    }
  } else if (result.status === 404) {
    logger.warn("Room not found");
  } else if (result.status === 201) {
    const meta = (result.body as {
      _meta?: { roomId?: string; messageId?: string; promptLength?: number; replyLength?: number };
    })?._meta;
    logger.info("Generating AI reply", {
      roomId: meta?.roomId,
      promptLength: meta?.promptLength,
    });
    logger.info("AI reply generated", {
      replyLength: meta?.replyLength,
    });
    logger.info("Ryo reply broadcasted via Pusher", {
      roomId: meta?.roomId,
      messageId: meta?.messageId,
    });
    logger.info("Ryo reply posted", {
      roomId: meta?.roomId,
      messageId: meta?.messageId,
    });
  } else if (result.status >= 500) {
    logger.error("AI generation failed for Ryo reply");
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
