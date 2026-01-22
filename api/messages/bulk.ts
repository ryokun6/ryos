/**
 * GET /api/messages/bulk
 * 
 * Get messages for multiple rooms at once
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  getOriginFromVercel,
  isOriginAllowed,
  handlePreflight,
  setCorsHeaders,
} from "../_utils/middleware.js";
import { ROOM_ID_REGEX } from "../_utils/_validation.js";
import { roomExists, getMessages } from "../rooms/_helpers/_redis.js";
import type { Message } from "../rooms/_helpers/_types.js";


export const config = {
  runtime: "nodejs",
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const origin = getOriginFromVercel(req);
  
  if (handlePreflight(req, res, ["GET", "OPTIONS"])) {
    return;
  }

  if (!isOriginAllowed(origin)) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  setCorsHeaders(res, origin, ["GET", "OPTIONS"]);

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const roomIdsParam = req.query.roomIds as string;
  
  if (!roomIdsParam) {
    res.status(400).json({ error: "roomIds query parameter is required" });
    return;
  }

  const roomIds = roomIdsParam.split(",").map((id) => id.trim()).filter((id) => id.length > 0);

  if (roomIds.length === 0) {
    res.status(400).json({ error: "At least one room ID is required" });
    return;
  }

  // Validate all room IDs
  for (const id of roomIds) {
    if (!ROOM_ID_REGEX.test(id)) {
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

    res.status(200).json({ messagesMap, validRoomIds, invalidRoomIds });
  } catch (error) {
    console.error("Error fetching bulk messages:", error);
    res.status(500).json({ error: "Failed to fetch bulk messages" });
  }
}
