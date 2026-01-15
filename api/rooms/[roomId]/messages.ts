/**
 * GET /api/rooms/:roomId/messages - Get messages
 * POST /api/rooms/:roomId/messages - Send message
 * DELETE /api/rooms/:roomId/messages?messageId=xxx - Delete message
 */

import { z } from "zod";
import { API_CONFIG, ADMIN_USERNAME, VALIDATION } from "../../_lib/constants.js";
import { 
  validationError, 
  notFound,
  forbidden,
  internalError,
} from "../../_lib/errors.js";
import { jsonSuccess, jsonError, jsonRateLimitError, withCors } from "../../_lib/response.js";
import { generateRequestId, logInfo, logError, logComplete } from "../../_lib/logging.js";
import {
  getEffectiveOrigin,
  isAllowedOrigin,
  handleCorsPreflightIfNeeded,
} from "../../_middleware/cors.js";
import {
  getAuthContext,
} from "../../_middleware/auth.js";
import {
  checkMessageRateLimit,
  getIdentifierFromRequest,
} from "../../_middleware/rate-limit.js";
import {
  filterProfanityPreservingUrls,
  escapeHTML,
  assertValidRoomId,
} from "../../_middleware/validation.js";
import {
  getRoom,
  getMessages,
  addMessage,
  deleteMessage,
  isDuplicateMessage,
  broadcastNewMessage,
  broadcastMessageDeleted,
} from "../../_services/index.js";

// =============================================================================
// Configuration
// =============================================================================

export const runtime = API_CONFIG.DEFAULT_RUNTIME;
export const maxDuration = API_CONFIG.DEFAULT_MAX_DURATION;

// =============================================================================
// Schema
// =============================================================================

const SendMessageSchema = z.object({
  content: z.string().min(1).max(VALIDATION.MESSAGE.MAX_LENGTH),
});

// =============================================================================
// Handler
// =============================================================================

export default async function handler(req: Request): Promise<Response> {
  const requestId = generateRequestId();
  const startTime = performance.now();
  
  // CORS handling
  const origin = getEffectiveOrigin(req);
  const preflightResponse = handleCorsPreflightIfNeeded(req, ["GET", "POST", "DELETE", "OPTIONS"]);
  if (preflightResponse) return preflightResponse;
  
  if (!isAllowedOrigin(origin)) {
    return jsonError(validationError("Unauthorized origin"));
  }

  // Extract roomId from URL
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const roomId = pathParts[2];

  if (!roomId) {
    const response = jsonError(validationError("Room ID is required"));
    return withCors(response, origin);
  }

  // Validate room ID
  try {
    assertValidRoomId(roomId);
  } catch (e) {
    const response = jsonError(validationError(e instanceof Error ? e.message : "Invalid room ID"));
    return withCors(response, origin);
  }

  try {
    // GET - Get messages
    if (req.method === "GET") {
      const limitParam = url.searchParams.get("limit");
      const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 20, 500) : 20;

      logInfo(requestId, `Getting messages for room ${roomId}`, { limit });

      const messages = await getMessages(roomId, limit);

      logInfo(requestId, `Returning ${messages.length} messages`);
      logComplete(requestId, startTime, 200);

      const response = jsonSuccess({ messages });
      return withCors(response, origin);
    }

    // POST - Send message
    if (req.method === "POST") {
      // Authenticate
      const auth = await getAuthContext(req);
      if (!auth.valid || !auth.username) {
        const response = jsonError(validationError("Authentication required"));
        return withCors(response, origin);
      }

      // Rate limit (skip for admin)
      if (!auth.isAdmin) {
        const identifier = getIdentifierFromRequest(req, auth.username);
        const { burst, sustained } = await checkMessageRateLimit(identifier);

        if (!burst.allowed) {
          logInfo(requestId, `Message rate limit (burst) exceeded for ${identifier}`);
          const response = jsonRateLimitError(burst, "Slow down! You're sending messages too fast.");
          return withCors(response, origin);
        }

        if (!sustained.allowed) {
          logInfo(requestId, `Message rate limit (sustained) exceeded for ${identifier}`);
          const response = jsonRateLimitError(sustained, "You've sent too many messages. Please wait a minute.");
          return withCors(response, origin);
        }
      }

      // Parse body
      let body: z.infer<typeof SendMessageSchema>;
      try {
        const rawBody = await req.json();
        const parsed = SendMessageSchema.safeParse(rawBody);
        if (!parsed.success) {
          const response = jsonError(validationError("Invalid request body", parsed.error.format()));
          return withCors(response, origin);
        }
        body = parsed.data;
      } catch {
        const response = jsonError(validationError("Invalid JSON body"));
        return withCors(response, origin);
      }

      // Check room exists
      const room = await getRoom(roomId);
      if (!room) {
        const response = jsonError(notFound("Room"));
        return withCors(response, origin);
      }

      // Check duplicate
      const isDuplicate = await isDuplicateMessage(roomId, auth.username, body.content);
      if (isDuplicate) {
        logInfo(requestId, `Duplicate message blocked from ${auth.username}`);
        const response = jsonError(validationError("Duplicate message"));
        return withCors(response, origin);
      }

      // Sanitize content
      const sanitizedContent = filterProfanityPreservingUrls(escapeHTML(body.content));

      logInfo(requestId, `Sending message in room ${roomId} from ${auth.username}`);

      // Add message
      const message = await addMessage(roomId, auth.username, sanitizedContent);

      // Broadcast
      try {
        await broadcastNewMessage(roomId, message, room);
      } catch (e) {
        logError(requestId, "Failed to broadcast message", e);
      }

      logInfo(requestId, `Message sent: ${message.id}`);
      logComplete(requestId, startTime, 201);

      const response = jsonSuccess({ message }, 201);
      return withCors(response, origin);
    }

    // DELETE - Delete message
    if (req.method === "DELETE") {
      // Authenticate
      const auth = await getAuthContext(req);
      if (!auth.valid || !auth.username) {
        const response = jsonError(validationError("Authentication required"));
        return withCors(response, origin);
      }

      const messageId = url.searchParams.get("messageId");
      if (!messageId) {
        const response = jsonError(validationError("messageId query parameter is required"));
        return withCors(response, origin);
      }

      logInfo(requestId, `Deleting message ${messageId} in room ${roomId}`);

      // Get room for authorization check
      const room = await getRoom(roomId);
      if (!room) {
        const response = jsonError(notFound("Room"));
        return withCors(response, origin);
      }

      // Get message to check ownership
      const messages = await getMessages(roomId, 100);
      const message = messages.find((m) => m.id === messageId);

      if (!message) {
        const response = jsonError(notFound("Message"));
        return withCors(response, origin);
      }

      // Check permissions (owner or admin)
      if (message.username !== auth.username && !auth.isAdmin) {
        const response = jsonError(forbidden("You can only delete your own messages"));
        return withCors(response, origin);
      }

      // Delete message
      const deleted = await deleteMessage(roomId, messageId);
      if (!deleted) {
        const response = jsonError(notFound("Message"));
        return withCors(response, origin);
      }

      // Broadcast
      try {
        await broadcastMessageDeleted(roomId, messageId, room);
      } catch (e) {
        logError(requestId, "Failed to broadcast message-deleted", e);
      }

      logInfo(requestId, `Message deleted: ${messageId}`);
      logComplete(requestId, startTime, 200);

      const response = jsonSuccess({ success: true });
      return withCors(response, origin);
    }

    // Method not allowed
    const response = jsonError(validationError("Method not allowed"));
    return withCors(response, origin);

  } catch (error) {
    logError(requestId, "Messages error", error);
    logComplete(requestId, startTime, 500);
    const response = jsonError(internalError());
    return withCors(response, origin);
  }
}
