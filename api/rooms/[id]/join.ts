/**
 * POST /api/rooms/[id]/join
 * 
 * Join a room
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  createRedis,
  getEffectiveOriginNode,
  isAllowedOrigin,
  setCorsHeadersNode,
  handlePreflightNode,
} from "../../_utils/middleware.js";
import { isProfaneUsername, assertValidRoomId, assertValidUsername } from "../../_utils/_validation.js";
import { getRoom, setRoom } from "../_helpers/_redis.js";
import { setRoomPresence, refreshRoomUserCount } from "../_helpers/_presence.js";
import type { Room } from "../_helpers/_types.js";

export const runtime = "nodejs";
export const maxDuration = 15;

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const origin = getEffectiveOriginNode(req);
  
  // Handle CORS preflight
  if (handlePreflightNode(req, res, ["POST", "OPTIONS"])) {
    return;
  }

  setCorsHeadersNode(res, origin, ["POST", "OPTIONS"]);

  if (!isAllowedOrigin(origin)) {
    res.status(403).json({ error: "Unauthorized" });
    return;
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

  const body = req.body || {};
  const username = body.username?.toLowerCase();
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
  } catch (error) {
    console.error(`Error joining room ${roomId}:`, error);
    res.status(500).json({ error: "Failed to join room" });
  }
}
