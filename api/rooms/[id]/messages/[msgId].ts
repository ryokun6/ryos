/**
 * /api/rooms/[id]/messages/[msgId]
 * 
 * DELETE - Delete a specific message (admin only)
 */

import {
  createRedis,
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
} from "../../../_utils/middleware.js";
import { validateAuthToken } from "../../../_utils/auth/index.js";
import { assertValidRoomId } from "../../../_utils/_validation.js";
import { roomExists, deleteMessage as deleteMessageFromRedis } from "../../../chat-rooms/_redis.js";

export const config = {
  runtime: "edge",
};

function getIds(req: Request): { roomId: string | null; messageId: string | null } {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const roomsIndex = pathParts.indexOf("rooms");
  const messagesIndex = pathParts.indexOf("messages");
  
  return {
    roomId: roomsIndex !== -1 ? pathParts[roomsIndex + 1] || null : null,
    messageId: messagesIndex !== -1 ? pathParts[messagesIndex + 1] || null : null,
  };
}

export default async function handler(req: Request) {
  const origin = getEffectiveOrigin(req);
  
  if (req.method === "OPTIONS") {
    const preflight = preflightIfNeeded(req, ["DELETE", "OPTIONS"], origin);
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

  if (req.method !== "DELETE") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  // Require admin auth
  const authHeader = req.headers.get("authorization");
  const usernameHeader = req.headers.get("x-username");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token || !usernameHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized - missing credentials" }), { status: 401, headers });
  }

  const authResult = await validateAuthToken(createRedis(), usernameHeader, token, {});
  if (!authResult.valid) {
    return new Response(JSON.stringify({ error: "Unauthorized - invalid token" }), { status: 401, headers });
  }

  if (usernameHeader.toLowerCase() !== "ryo") {
    return new Response(JSON.stringify({ error: "Forbidden - admin required" }), { status: 403, headers });
  }

  const { roomId, messageId } = getIds(req);

  if (!roomId || !messageId) {
    return new Response(JSON.stringify({ error: "Room ID and message ID are required" }), { status: 400, headers });
  }

  try {
    assertValidRoomId(roomId, "delete-message");
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Invalid room ID" }), { status: 400, headers });
  }

  try {
    const exists = await roomExists(roomId);
    if (!exists) {
      return new Response(JSON.stringify({ error: "Room not found" }), { status: 404, headers });
    }

    const deleted = await deleteMessageFromRedis(roomId, messageId);
    if (!deleted) {
      return new Response(JSON.stringify({ error: "Message not found" }), { status: 404, headers });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers });
  } catch (error) {
    console.error(`Error deleting message ${messageId} from room ${roomId}:`, error);
    return new Response(JSON.stringify({ error: "Failed to delete message" }), { status: 500, headers });
  }
}
