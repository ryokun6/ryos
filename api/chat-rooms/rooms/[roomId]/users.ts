import { handleRequest } from "../../_http.js";
import { handleGetRoomUsers } from "../../_rooms.js";
import { createErrorResponse } from "../../_helpers.js";
import { runtime as apiRuntime, maxDuration as apiMaxDuration } from "../../_constants.js";

export const runtime = apiRuntime;
export const maxDuration = apiMaxDuration;

function getRoomIdFromUrl(url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 2] ?? null : null;
}

export async function GET(request: Request): Promise<Response> {
  return handleRequest(request, {
    allowedMethods: ["GET", "OPTIONS"],
    action: "rooms:getUsers",
    handler: async ({ url }) => {
      const roomId = getRoomIdFromUrl(url);
      if (!roomId) {
        return createErrorResponse("roomId parameter is required", 400);
      }
      return handleGetRoomUsers(roomId);
    },
  });
}
