/**
 * GET /api/rooms/[id]/users
 * 
 * Get active users in a room
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
} from "../../_utils/middleware.js";
import { assertValidRoomId } from "../../_utils/_validation.js";
import { getActiveUsersAndPrune } from "../_helpers/_presence.js";

export const config = {
  runtime: "nodejs",
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const origin = getEffectiveOrigin(req);
  
  if (req.method === "OPTIONS") {
    const preflight = preflightIfNeeded(req, ["GET", "OPTIONS"], origin);
    if (preflight) {
      res.status(204).end();
      return;
    }
    res.status(204).end();
    return;
  }

  if (!isAllowedOrigin(origin)) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const roomId = req.query.id as string;
  if (!roomId) {
    res.status(400).json({ error: "Room ID is required" });
    return;
  }

  try {
    assertValidRoomId(roomId, "get-room-users");
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Invalid room ID" });
    return;
  }

  try {
    const users = await getActiveUsersAndPrune(roomId);
    res.status(200).json({ users });
    return;
  } catch (error) {
    console.error(`Error getting users for room ${roomId}:`, error);
    res.status(500).json({ error: "Failed to get room users" });
    return;
  }
}
