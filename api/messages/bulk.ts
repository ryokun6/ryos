/**
 * GET /api/messages/bulk
 * 
 * Get messages for multiple rooms at once
 */

import {
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
  errorResponse,
  jsonResponse,
} from "../_utils/middleware.js";
import { ROOM_ID_REGEX } from "../_utils/_validation.js";
import { roomExists, getMessages } from "../rooms/_helpers/_redis.js";
import type { Message } from "../rooms/_helpers/_types.js";


export const config = {
  runtime: "edge",
};

export default async function handler(req: Request) {
  const origin = getEffectiveOrigin(req);
  
  if (req.method === "OPTIONS") {
    const preflight = preflightIfNeeded(req, ["GET", "OPTIONS"], origin);
    if (preflight) return preflight;
    return new Response(null, { status: 204 });
  }

  if (!isAllowedOrigin(origin)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { 
      status: 403, headers: { "Content-Type": "application/json" },
    });
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  const url = new URL(req.url);
  const roomIdsParam = url.searchParams.get("roomIds");
  
  if (!roomIdsParam) {
    return new Response(JSON.stringify({ error: "roomIds query parameter is required" }), { status: 400, headers });
  }

  const roomIds = roomIdsParam.split(",").map((id) => id.trim()).filter((id) => id.length > 0);

  if (roomIds.length === 0) {
    return new Response(JSON.stringify({ error: "At least one room ID is required" }), { status: 400, headers });
  }

  // Validate all room IDs
  for (const id of roomIds) {
    if (!ROOM_ID_REGEX.test(id)) {
      return new Response(JSON.stringify({ error: "Invalid room ID format" }), { status: 400, headers });
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

    return new Response(JSON.stringify({ messagesMap, validRoomIds, invalidRoomIds }), { status: 200, headers });
  } catch (error) {
    console.error("Error fetching bulk messages:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch bulk messages" }), { status: 500, headers });
  }
}
