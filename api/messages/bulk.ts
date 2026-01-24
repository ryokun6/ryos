/**
 * GET /api/messages/bulk
 * Get messages for multiple rooms at once
 * Node.js runtime with terminal logging
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ROOM_ID_REGEX } from "../_utils/_validation.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../_utils/_cors.js";
import { initLogger } from "../_utils/_logging.js";
import { roomExists, getMessages } from "../rooms/_helpers/_redis.js";
import type { Message } from "../rooms/_helpers/_types.js";

export const runtime = "nodejs";
export const maxDuration = 15;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);

  logger.request(req.method || "GET", req.url || "/api/messages/bulk", "bulk-messages");

  if (req.method === "OPTIONS") {
    res.setHeader("Content-Type", "application/json");
    setCorsHeaders(res, origin, { methods: ["GET", "OPTIONS"], headers: ["Content-Type"] });
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  res.setHeader("Content-Type", "application/json");
  setCorsHeaders(res, origin, { methods: ["GET", "OPTIONS"], headers: ["Content-Type"] });

  if (!isAllowedOrigin(origin)) {
    logger.response(403, Date.now() - startTime);
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  if (req.method !== "GET") {
    logger.response(405, Date.now() - startTime);
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const roomIdsParam = req.query.roomIds as string | undefined;
  
  if (!roomIdsParam) {
    logger.response(400, Date.now() - startTime);
    res.status(400).json({ error: "roomIds query parameter is required" });
    return;
  }

  const roomIds = roomIdsParam.split(",").map((id) => id.trim()).filter((id) => id.length > 0);

  if (roomIds.length === 0) {
    logger.response(400, Date.now() - startTime);
    res.status(400).json({ error: "At least one room ID is required" });
    return;
  }

  for (const id of roomIds) {
    if (!ROOM_ID_REGEX.test(id)) {
      logger.response(400, Date.now() - startTime);
      res.status(400).json({ error: "Invalid room ID format" });
      return;
    }
  }

  try {
    const roomExistenceChecks = await Promise.all(roomIds.map((roomId) => roomExists(roomId)));
    const validRoomIds = roomIds.filter((_, index) => roomExistenceChecks[index]);
    const invalidRoomIds = roomIds.filter((_, index) => !roomExistenceChecks[index]);

    const messagePromises = validRoomIds.map(async (roomId) => {
      const messages = await getMessages(roomId, 20);
      return { roomId, messages };
    });

    const results = await Promise.all(messagePromises);
    const messagesMap: Record<string, Message[]> = {};
    results.forEach(({ roomId, messages }) => {
      messagesMap[roomId] = messages;
    });

    logger.info("Bulk messages fetched", { validRooms: validRoomIds.length, invalidRooms: invalidRoomIds.length });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ messagesMap, validRoomIds, invalidRoomIds });
  } catch (error) {
    logger.error("Error fetching bulk messages", error);
    logger.response(500, Date.now() - startTime);
    res.status(500).json({ error: "Failed to fetch bulk messages" });
  }
}
