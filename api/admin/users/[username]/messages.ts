/**
 * GET /api/admin/users/:username/messages - Get recent messages by user
 */

import { z } from "zod";
import { API_CONFIG } from "../../../_lib/constants.js";
import { validationError, internalError } from "../../../_lib/errors.js";
import { jsonSuccess, jsonError, withCors } from "../../../_lib/response.js";
import {
  generateRequestId,
  logInfo,
  logError,
  logComplete,
} from "../../../_lib/logging.js";
import {
  getEffectiveOrigin,
  isAllowedOrigin,
  handleCorsPreflightIfNeeded,
} from "../../../_middleware/cors.js";
import { getAuthContext } from "../../../_middleware/auth.js";
import { getAllRooms } from "../../../_services/rooms.js";
import { getMessages } from "../../../_services/messages.js";
import type { Message } from "../../../_lib/types.js";

// =============================================================================
// Configuration
// =============================================================================

export const runtime = API_CONFIG.DEFAULT_RUNTIME;
export const maxDuration = API_CONFIG.DEFAULT_MAX_DURATION;

// =============================================================================
// Schema
// =============================================================================

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

// =============================================================================
// Types
// =============================================================================

interface UserMessage extends Message {
  roomName?: string;
}

// =============================================================================
// Handler
// =============================================================================

export default async function handler(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  const startTime = performance.now();

  const origin = getEffectiveOrigin(req);
  const preflightResponse = handleCorsPreflightIfNeeded(req, ["GET", "OPTIONS"]);
  if (preflightResponse) return preflightResponse;

  if (!isAllowedOrigin(origin)) {
    return jsonError(validationError("Unauthorized origin"));
  }

  // Authenticate admin
  const auth = await getAuthContext(req);
  if (!auth.valid || !auth.isAdmin) {
    const response = jsonError(validationError("Admin access required"));
    return withCors(response, origin);
  }

  if (req.method !== "GET") {
    const response = jsonError(validationError("Method not allowed"));
    return withCors(response, origin);
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const targetUsername = pathParts[pathParts.length - 2]?.toLowerCase();

  if (!targetUsername) {
    const response = jsonError(validationError("Username is required"));
    return withCors(response, origin);
  }

  let limit = 50;
  const queryParse = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!queryParse.success) {
    const response = jsonError(validationError("Invalid query parameters"));
    return withCors(response, origin);
  }
  if (queryParse.data.limit) {
    limit = queryParse.data.limit;
  }

  try {
    logInfo(requestId, `Fetching messages for user: ${targetUsername}`);

    const rooms = await getAllRooms();

    const allMessages: UserMessage[] = [];

    for (const room of rooms) {
      const roomMessages = await getMessages(room.id, Math.max(limit, 20));
      for (const message of roomMessages) {
        if (message.username.toLowerCase() === targetUsername) {
          allMessages.push({
            ...message,
            roomName: room.name,
          });
        }
      }
    }

    const sortedMessages = allMessages
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);

    logComplete(requestId, startTime, 200);
    const response = jsonSuccess({ messages: sortedMessages });
    return withCors(response, origin);
  } catch (error) {
    logError(requestId, "Admin user messages error", error);
    logComplete(requestId, startTime, 500);
    const response = jsonError(internalError());
    return withCors(response, origin);
  }
}
