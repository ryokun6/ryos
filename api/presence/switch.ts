/**
 * POST /api/presence/switch
 * Switch between rooms (leave previous, join next)
 * Node.js runtime with terminal logging
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isProfaneUsername, assertValidRoomId } from "../_utils/_validation.js";
import { isAllowedOrigin, getEffectiveOrigin, setCorsHeaders } from "../_utils/_cors.js";
import { initLogger } from "../_utils/_logging.js";
import { getRoom, setRoom } from "../rooms/_helpers/_redis.js";
import { setRoomPresence, removeRoomPresence, refreshRoomUserCount } from "../rooms/_helpers/_presence.js";
import { ensureUserExists } from "../rooms/_helpers/_users.js";

export const runtime = "nodejs";
export const maxDuration = 15;

interface SwitchRequest {
  previousRoomId?: string;
  nextRoomId?: string;
  username: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);

  logger.request(req.method || "POST", req.url || "/api/presence/switch", "switch");

  if (req.method === "OPTIONS") {
    res.setHeader("Content-Type", "application/json");
    setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] });
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  res.setHeader("Content-Type", "application/json");
  setCorsHeaders(res, origin, { methods: ["POST", "OPTIONS"], headers: ["Content-Type"] });

  if (!isAllowedOrigin(origin)) {
    logger.response(403, Date.now() - startTime);
    res.status(403).json({ error: "Unauthorized" });
    return;
  }

  if (req.method !== "POST") {
    logger.response(405, Date.now() - startTime);
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = req.body as SwitchRequest;
  const { previousRoomId, nextRoomId } = body;
  const username = body.username?.toLowerCase();

  if (!username) {
    logger.response(400, Date.now() - startTime);
    res.status(400).json({ error: "Username is required" });
    return;
  }

  try {
    if (previousRoomId) assertValidRoomId(previousRoomId, "switch-room");
    if (nextRoomId) assertValidRoomId(nextRoomId, "switch-room");
  } catch (e) {
    logger.response(400, Date.now() - startTime);
    res.status(400).json({ error: e instanceof Error ? e.message : "Validation error" });
    return;
  }

  if (isProfaneUsername(username)) {
    logger.response(401, Date.now() - startTime);
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (previousRoomId === nextRoomId) {
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ success: true, noop: true });
    return;
  }

  try {
    await ensureUserExists(username, "switch-room");

    if (previousRoomId) {
      const roomData = await getRoom(previousRoomId);
      if (roomData && roomData.type !== "private") {
        await removeRoomPresence(previousRoomId, username);
        await refreshRoomUserCount(previousRoomId);
      }
    }

    if (nextRoomId) {
      const roomData = await getRoom(nextRoomId);
      if (!roomData) {
        logger.response(404, Date.now() - startTime);
        res.status(404).json({ error: "Next room not found" });
        return;
      }

      await setRoomPresence(nextRoomId, username);
      const userCount = await refreshRoomUserCount(nextRoomId);
      await setRoom(nextRoomId, { ...roomData, userCount });
    }

    logger.info("Room switched", { username, previousRoomId, nextRoomId });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error("Error during switchRoom", error);
    logger.response(500, Date.now() - startTime);
    res.status(500).json({ error: "Failed to switch room" });
  }
}
