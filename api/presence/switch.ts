/**
 * POST /api/presence/switch
 * 
 * Switch between rooms (leave previous, join next)
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  getOriginFromVercel,
  isOriginAllowed,
  handlePreflight,
  setCorsHeaders,
} from "../_utils/middleware.js";
import { isProfaneUsername, assertValidRoomId } from "../_utils/_validation.js";

import { getRoom, setRoom } from "../rooms/_helpers/_redis.js";
import { setRoomPresence, removeRoomPresence, refreshRoomUserCount } from "../rooms/_helpers/_presence.js";
import { ensureUserExists } from "../rooms/_helpers/_users.js";


export const config = {
  runtime: "nodejs",
};

interface SwitchRequest {
  previousRoomId?: string;
  nextRoomId?: string;
  username: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const origin = getOriginFromVercel(req);
  
  if (handlePreflight(req, res, ["POST", "OPTIONS"])) {
    return;
  }

  if (!isOriginAllowed(origin)) {
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  setCorsHeaders(res, origin, ["POST", "OPTIONS"]);

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = req.body as SwitchRequest;
  if (!body) {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  const { previousRoomId, nextRoomId } = body;
  const username = body.username?.toLowerCase();

  if (!username) {
    res.status(400).json({ error: "Username is required" });
    return;
  }

  try {
    if (previousRoomId) assertValidRoomId(previousRoomId, "switch-room");
    if (nextRoomId) assertValidRoomId(nextRoomId, "switch-room");
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Validation error" });
    return;
  }

  if (isProfaneUsername(username)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // No-op if same room
  if (previousRoomId === nextRoomId) {
    res.status(200).json({ success: true, noop: true });
    return;
  }

  try {
    await ensureUserExists(username, "switch-room");

    // Leave previous room
    if (previousRoomId) {
      const roomData = await getRoom(previousRoomId);
      if (roomData && roomData.type !== "private") {
        await removeRoomPresence(previousRoomId, username);
        await refreshRoomUserCount(previousRoomId);
      }
    }

    // Join next room
    if (nextRoomId) {
      const roomData = await getRoom(nextRoomId);
      if (!roomData) {
        res.status(404).json({ error: "Next room not found" });
        return;
      }

      await setRoomPresence(nextRoomId, username);
      const userCount = await refreshRoomUserCount(nextRoomId);
      await setRoom(nextRoomId, { ...roomData, userCount });
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error during switchRoom:", error);
    res.status(500).json({ error: "Failed to switch room" });
  }
}
