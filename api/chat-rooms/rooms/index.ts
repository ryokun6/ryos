import { handleRequest } from "../_http.js";
import { handleGetRooms, handleCreateRoom } from "../_rooms.js";
import { extractAuth, validateAuth } from "../../_utils/auth.js";
import { createErrorResponse } from "../_helpers.js";
import { runtime as apiRuntime, maxDuration as apiMaxDuration } from "../_constants.js";

export const runtime = apiRuntime;
export const maxDuration = apiMaxDuration;

export async function GET(request: Request): Promise<Response> {
  return handleRequest(request, {
    allowedMethods: ["GET", "OPTIONS"],
    action: "rooms:list",
    handler: async ({ requestId }) => {
      return handleGetRooms(request, requestId);
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, {
    allowedMethods: ["POST", "OPTIONS"],
    action: "rooms:create",
    handler: async ({ requestId }) => {
      const { username, token } = extractAuth(request);

      const authResult = await validateAuth(username, token, requestId);
      if (!authResult.valid) {
        return createErrorResponse("Unauthorized", 401);
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

      return handleCreateRoom(
        body as { name?: string; type?: "public" | "private"; members?: string[] },
        username,
        token,
        requestId
      );
    },
  });
}
