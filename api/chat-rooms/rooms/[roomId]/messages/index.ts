import { handleRequest } from "../../../_http.js";
import { handleGetMessages, handleSendMessage } from "../../../_messages.js";
import { extractAuth, validateAuth } from "../../../../_utils/auth.js";
import { createErrorResponse } from "../../../_helpers.js";
import { runtime as apiRuntime, maxDuration as apiMaxDuration } from "../../../_constants.js";

export const runtime = apiRuntime;
export const maxDuration = apiMaxDuration;

function getRoomIdFromUrl(url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 2] ?? null : null;
}

export async function GET(request: Request): Promise<Response> {
  return handleRequest(request, {
    allowedMethods: ["GET", "OPTIONS"],
    action: "messages:list",
    handler: async ({ requestId, url }) => {
      const roomId = getRoomIdFromUrl(url);
      if (!roomId) {
        return createErrorResponse("roomId parameter is required", 400);
      }

      const limitParam = url.searchParams.get("limit");
      const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 20, 500) : 20;

      return handleGetMessages(roomId, requestId, limit);
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, {
    allowedMethods: ["POST", "OPTIONS"],
    action: "messages:create",
    handler: async ({ requestId, url }) => {
      const roomId = getRoomIdFromUrl(url);
      if (!roomId) {
        return createErrorResponse("roomId parameter is required", 400);
      }

      let body: Record<string, unknown> = {};
      const contentType = request.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        try {
          body = await request.json();
        } catch {
          body = {};
        }
      }

      const bodyUsername = (body.username as string | undefined) || null;
      const { username, token } = extractAuth(request);

      // Ensure username consistency when provided
      if (
        bodyUsername &&
        username &&
        bodyUsername.toLowerCase() !== username.toLowerCase()
      ) {
        return createErrorResponse("Username mismatch", 401);
      }

      const effectiveUsername = (bodyUsername || username)?.toLowerCase() || null;
      const authResult = await validateAuth(
        effectiveUsername,
        token,
        requestId
      );
      if (!authResult.valid) {
        return createErrorResponse("Unauthorized", 401);
      }

      return handleSendMessage(
        {
          roomId,
          username: effectiveUsername!,
          content: (body.content as string) || "",
        },
        requestId
      );
    },
  });
}
