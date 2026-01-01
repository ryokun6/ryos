import { handleRequest } from "../../_http.js";
import { handleGetRoom, handleDeleteRoom } from "../../_rooms.js";
import { extractAuth, validateAuth } from "../../../_utils/auth.js";
import { createErrorResponse } from "../../_helpers.js";
import { runtime as apiRuntime, maxDuration as apiMaxDuration } from "../../_constants.js";

export const runtime = apiRuntime;
export const maxDuration = apiMaxDuration;

function getRoomIdFromUrl(url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : null;
}

export async function GET(request: Request): Promise<Response> {
  return handleRequest(request, {
    allowedMethods: ["GET", "OPTIONS"],
    action: "rooms:get",
    handler: async ({ requestId, url }) => {
      const roomId = getRoomIdFromUrl(url);
      if (!roomId) {
        return createErrorResponse("roomId parameter is required", 400);
      }
      return handleGetRoom(roomId, requestId);
    },
  });
}

export async function DELETE(request: Request): Promise<Response> {
  return handleRequest(request, {
    allowedMethods: ["DELETE", "OPTIONS"],
    action: "rooms:delete",
    handler: async ({ requestId, url }) => {
      const roomId = getRoomIdFromUrl(url);
      if (!roomId) {
        return createErrorResponse("roomId parameter is required", 400);
      }

      const { username, token } = extractAuth(request);
      const authResult = await validateAuth(username, token, requestId);
      if (!authResult.valid) {
        return createErrorResponse("Unauthorized", 401);
      }

      return handleDeleteRoom(roomId, username, token, requestId);
    },
  });
}
