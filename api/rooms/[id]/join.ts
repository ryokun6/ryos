/**
 * POST /api/rooms/[id]/join
 * 
 * Join a room
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  createRedis,
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
} from "../../_utils/middleware.js";
import { isProfaneUsername, assertValidRoomId, assertValidUsername } from "../../_utils/_validation.js";
import { getRoom, setRoom } from "../_helpers/_redis.js";
import { setRoomPresence, refreshRoomUserCount } from "../_helpers/_presence.js";
import type { Room } from "../_helpers/_types.js";

export const config = {
  runtime: "nodejs",
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const origin = getEffectiveOrigin(req);
  
  if (req.method === "OPTIONS") {
    const preflight = preflightIfNeeded(req, ["POST", "OPTIONS"], origin);
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

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const roomId = req.query.id as string;
  if (!roomId) {
    res.status(400).json({ error: "Room ID is required" });
    return;
  }

  const body = req.body;
  if (!body) {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  const username = body?.username?.toLowerCase();
  if (!username) {
    res.status(400).json({ error: "Username is required" });
    return;
  }

  try {
    assertValidUsername(username, "join-room");
    assertValidRoomId(roomId, "join-room");
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Validation error" });
    return;
  }

  if (isProfaneUsername(username)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const [roomData, userData] = await Promise.all([
      getRoom(roomId),
      createRedis().get(`chat:users:${username}`),
    ]);

    if (!roomData) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    if (!userData) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    await setRoomPresence(roomId, username);
    const userCount = await refreshRoomUserCount(roomId);
    const updatedRoom: Room = { ...roomData, userCount };
    await setRoom(roomId, updatedRoom);

    res.status(200).json({ success: true });
    return;
  } catch (error) {
    console.error(`Error joining room ${roomId}:`, error);
    res.status(500).json({ error: "Failed to join room" });
    return;
  }
}
