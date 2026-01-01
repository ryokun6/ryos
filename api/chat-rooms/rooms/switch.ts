import { handleRequest } from "../_http.js";
import { handleSwitchRoom } from "../_rooms.js";
import { createErrorResponse } from "../_helpers.js";
import { runtime as apiRuntime, maxDuration as apiMaxDuration } from "../_constants.js";

export const runtime = apiRuntime;
export const maxDuration = apiMaxDuration;

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, {
    allowedMethods: ["POST", "OPTIONS"],
    action: "rooms:switch",
    handler: async ({ requestId }) => {
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

      return handleSwitchRoom(
        {
          previousRoomId: (body.previousRoomId as string | undefined) || null,
          nextRoomId: (body.nextRoomId as string | undefined) || null,
          username,
        },
        requestId
      );
    },
  });
}
