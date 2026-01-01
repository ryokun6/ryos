import { handleRequest } from "../../_http.js";
import { handleLeaveRoom } from "../../_rooms.js";
import { createErrorResponse } from "../../_helpers.js";
import { runtime as apiRuntime, maxDuration as apiMaxDuration } from "../../_constants.js";

export const runtime = apiRuntime;
export const maxDuration = apiMaxDuration;

function getRoomIdFromUrl(url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 2] ?? null : null;
}

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, {
    allowedMethods: ["POST", "OPTIONS"],
    action: "rooms:leave",
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

      const username = (body.username as string | undefined) || null;
      if (!username) {
        return createErrorResponse("Username is required", 400);
      }

      return handleLeaveRoom({ roomId, username }, requestId);
    },
  });
}
