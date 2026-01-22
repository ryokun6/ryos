/**
 * POST /api/presence/switch
 * 
 * Switch between rooms (leave previous, join next)
 */

import {
  getEffectiveOrigin,
  isAllowedOrigin,
  preflightIfNeeded,
  errorResponse,
  jsonResponse,
  wrapHandler,
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

async function webHandler(req: Request) {
  const origin = getEffectiveOrigin(req);
  
  if (req.method === "OPTIONS") {
    const preflight = preflightIfNeeded(req, ["POST", "OPTIONS"], origin);
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

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  }

  let body: SwitchRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers });
  }

  const { previousRoomId, nextRoomId } = body;
  const username = body.username?.toLowerCase();

  if (!username) {
    return new Response(JSON.stringify({ error: "Username is required" }), { status: 400, headers });
  }

  try {
    if (previousRoomId) assertValidRoomId(previousRoomId, "switch-room");
    if (nextRoomId) assertValidRoomId(nextRoomId, "switch-room");
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Validation error" }), { status: 400, headers });
  }

  if (isProfaneUsername(username)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }

  // No-op if same room
  if (previousRoomId === nextRoomId) {
    return new Response(JSON.stringify({ success: true, noop: true }), { status: 200, headers });
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
        return new Response(JSON.stringify({ error: "Next room not found" }), { status: 404, headers });
      }

      await setRoomPresence(nextRoomId, username);
      const userCount = await refreshRoomUserCount(nextRoomId);
      await setRoom(nextRoomId, { ...roomData, userCount });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers });
  } catch (error) {
    console.error("Error during switchRoom:", error);
    return new Response(JSON.stringify({ error: "Failed to switch room" }), { status: 500, headers });
  }
}

export default wrapHandler(webHandler);
