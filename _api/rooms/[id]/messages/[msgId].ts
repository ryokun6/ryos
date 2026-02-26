/**
 * /api/rooms/[id]/messages/[msgId]
 * 
 * DELETE - Delete a specific message (admin only)
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { initLogger } from "../../../_utils/_logging.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../../../_utils/_cors.js";
import { broadcastMessageDeleted } from "../../_helpers/_pusher.js";
import { executeRoomsMessageDeleteCore } from "../../../cores/rooms-message-delete-core.js";

export const runtime = "nodejs";

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

  const roomId = req.query.id as string | undefined;
  const messageId = req.query.msgId as string | undefined;
  const result = await executeRoomsMessageDeleteCore({
    originAllowed: true,
    method: req.method,
    authHeader: req.headers.authorization as string | undefined,
    usernameHeader: req.headers["x-username"] as string | undefined,
    roomId,
    messageId,
    onMessageDeleted: (id, msgId, roomData) =>
      broadcastMessageDeleted(id, msgId, roomData),
  });

  if (result.status === 405) {
    logger.warn("Method not allowed", { method: req.method });
  } else if (result.status === 401) {
    logger.warn("Missing or invalid credentials");
  } else if (result.status === 403) {
    logger.warn("Admin required");
  } else if (result.status === 400 && (!roomId || !messageId)) {
    logger.warn("Missing IDs", { roomId, messageId });
  } else if (result.status === 400) {
    logger.warn("Invalid room ID", { roomId });
  } else if (result.status === 404) {
    logger.warn("Room or message not found", { roomId, messageId });
  } else if (result.status === 200) {
    logger.info("Pusher message-deleted broadcast sent", { roomId, messageId });
    logger.info("Message deleted", { roomId, messageId });
  } else if (result.status >= 500) {
    logger.error(`Error deleting message ${messageId} from room ${roomId}`);
  }

  const body =
    result.status === 200 && typeof result.body === "object" && result.body && "_meta" in (result.body as Record<string, unknown>)
      ? (() => {
          const { _meta: _ignored, ...rest } = result.body as Record<string, unknown>;
          return rest;
        })()
      : result.body;

  logger.response(result.status, Date.now() - startTime);
  return res.status(result.status).json(body);
}
