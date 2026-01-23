/**
 * GET /api/rooms/[id]/users
 * 
 * Get active users in a room
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { assertValidRoomId } from "../../_utils/_validation.js";
import { getActiveUsersAndPrune } from "../_helpers/_presence.js";
import { initLogger } from "../../_utils/_logging.js";

export const runtime = "nodejs";

// ============================================================================
// Local Helper Functions
// ============================================================================

function getEffectiveOrigin(req: VercelRequest): string | null {
  const origin = req.headers.origin as string | undefined;
  const referer = req.headers.referer as string | undefined;
  if (origin) return origin;
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }
  return null;
}

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  const ALLOWED_ORIGINS = [
    "https://os.ryo.lu",
    "https://ryo.lu",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
  ];
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:")) return true;
  return false;
}

function setCorsHeaders(res: VercelResponse, origin: string | null): void {
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Username");
  res.setHeader("Access-Control-Max-Age", "86400");
}

// ============================================================================
// Route Handler
// ============================================================================

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { requestId, logger } = initLogger();
  const startTime = Date.now();
  
  const origin = getEffectiveOrigin(req);
  setCorsHeaders(res, origin);
  
  logger.request(req.method || "GET", req.url || "/api/rooms/[id]/users");
  
  if (req.method === "OPTIONS") {
    logger.response(204, Date.now() - startTime);
    return res.status(204).end();
  }

  if (!isAllowedOrigin(origin)) {
    logger.warn("Unauthorized origin", { origin });
    logger.response(403, Date.now() - startTime);
    return res.status(403).json({ error: "Unauthorized" });
  }

  if (req.method !== "GET") {
    logger.warn("Method not allowed", { method: req.method });
    logger.response(405, Date.now() - startTime);
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Extract room ID from query params
  const roomId = req.query.id as string | undefined;
  if (!roomId) {
    logger.warn("Missing room ID");
    logger.response(400, Date.now() - startTime);
    return res.status(400).json({ error: "Room ID is required" });
  }

  try {
    assertValidRoomId(roomId, "get-room-users");
  } catch (e) {
    logger.warn("Invalid room ID", { roomId, error: e instanceof Error ? e.message : "Invalid" });
    logger.response(400, Date.now() - startTime);
    return res.status(400).json({ error: e instanceof Error ? e.message : "Invalid room ID" });
  }

  try {
    const users = await getActiveUsersAndPrune(roomId);
    
    logger.info("Users retrieved", { roomId, count: users.length });
    logger.response(200, Date.now() - startTime);
    return res.status(200).json({ users });
  } catch (error) {
    logger.error(`Error getting users for room ${roomId}`, error);
    logger.response(500, Date.now() - startTime);
    return res.status(500).json({ error: "Failed to get room users" });
  }
}
