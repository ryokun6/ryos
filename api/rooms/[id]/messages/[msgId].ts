/**
 * /api/rooms/[id]/messages/[msgId]
 * 
 * DELETE - Delete a specific message (admin only)
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  createRedis,
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
} from "../../../_utils/middleware.js";
import { validateAuth } from "../../../_utils/auth/index.js";
import { assertValidRoomId } from "../../../_utils/_validation.js";
import { roomExists, deleteMessage as deleteMessageFromRedis } from "../../_helpers/_redis.js";

export const config = {
  runtime: "nodejs",
};

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const origin = getEffectiveOrigin(req);
  
  if (req.method === "OPTIONS") {
    const preflight = preflightIfNeeded(req, ["DELETE", "OPTIONS"], origin);
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

  if (req.method !== "DELETE") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Require admin auth
  const authHeader = req.headers["authorization"] as string;
  const usernameHeader = req.headers["x-username"] as string;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token || !usernameHeader) {
    res.status(401).json({ error: "Unauthorized - missing credentials" });
    return;
  }

  const authResult = await validateAuth(createRedis(), usernameHeader, token, {});
  if (!authResult.valid) {
    res.status(401).json({ error: "Unauthorized - invalid token" });
    return;
  }

  if (usernameHeader.toLowerCase() !== "ryo") {
    res.status(403).json({ error: "Forbidden - admin required" });
    return;
  }

  const roomId = req.query.id as string;
  const messageId = req.query.msgId as string;

  if (!roomId || !messageId) {
    res.status(400).json({ error: "Room ID and message ID are required" });
    return;
  }

  try {
    assertValidRoomId(roomId, "delete-message");
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Invalid room ID" });
    return;
  }

  try {
    const exists = await roomExists(roomId);
    if (!exists) {
      res.status(404).json({ error: "Room not found" });
      return;
    }

    const deleted = await deleteMessageFromRedis(roomId, messageId);
    if (!deleted) {
      res.status(404).json({ error: "Message not found" });
      return;
    }

    res.status(200).json({ success: true });
    return;
  } catch (error) {
    console.error(`Error deleting message ${messageId} from room ${roomId}:`, error);
    res.status(500).json({ error: "Failed to delete message" });
    return;
  }
}
