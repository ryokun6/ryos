/**
 * POST /api/rooms/[id]/join
 * Join a room
 * Node.js runtime with terminal logging
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Redis } from "@upstash/redis";
import { isProfaneUsername, assertValidRoomId, assertValidUsername } from "../../_utils/_validation.js";
import { initLogger } from "../../_utils/_logging.js";
import { getRoom, setRoom } from "../_helpers/_redis.js";
import { setRoomPresence, refreshRoomUserCount } from "../_helpers/_presence.js";
import type { Room } from "../_helpers/_types.js";

export const runtime = "nodejs";
export const maxDuration = 15;

function createRedis(): Redis {
  return new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });
}

function getEffectiveOrigin(req: VercelRequest): string | null {
  return (req.headers.origin as string) || null;
}

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  const allowedOrigins = ["https://os.ryo.lu", "https://ryos.vercel.app", "http://localhost:5173", "http://localhost:3000", "http://127.0.0.1:5173", "http://127.0.0.1:3000"];
  return allowedOrigins.some((a) => origin.startsWith(a)) || origin.includes("vercel.app");
}

function setCorsHeaders(res: VercelResponse, origin: string | null): void {
  res.setHeader("Content-Type", "application/json");
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const { logger } = initLogger();
  const startTime = Date.now();
  const origin = getEffectiveOrigin(req);
  const roomId = req.query.id as string | undefined;

  logger.request(req.method || "POST", req.url || "/api/rooms/[id]/join", `join:${roomId}`);

  if (req.method === "OPTIONS") {
    setCorsHeaders(res, origin);
    logger.response(204, Date.now() - startTime);
    res.status(204).end();
    return;
  }

  setCorsHeaders(res, origin);

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

  if (!roomId) {
    logger.response(400, Date.now() - startTime);
    res.status(400).json({ error: "Room ID is required" });
    return;
  }

  const body = req.body || {};
  const username = body?.username?.toLowerCase();

  if (!username) {
    logger.response(400, Date.now() - startTime);
    res.status(400).json({ error: "Username is required" });
    return;
  }

  try {
    assertValidUsername(username, "join-room");
    assertValidRoomId(roomId, "join-room");
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

  try {
    const [roomData, userData] = await Promise.all([
      getRoom(roomId),
      createRedis().get(`chat:users:${username}`),
    ]);

    if (!roomData) {
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "Room not found" });
      return;
    }

    if (!userData) {
      logger.response(404, Date.now() - startTime);
      res.status(404).json({ error: "User not found" });
      return;
    }

    await setRoomPresence(roomId, username);
    const userCount = await refreshRoomUserCount(roomId);
    const updatedRoom: Room = { ...roomData, userCount };
    await setRoom(roomId, updatedRoom);

    logger.info("User joined room", { roomId, username, userCount });
    logger.response(200, Date.now() - startTime);
    res.status(200).json({ success: true });
  } catch (error) {
    logger.error(`Error joining room ${roomId}`, error);
    logger.response(500, Date.now() - startTime);
    res.status(500).json({ error: "Failed to join room" });
  }
}
