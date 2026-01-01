import { handleRequest } from "../_http.js";
import { handleGetBulkMessages } from "../_messages.js";
import { createErrorResponse } from "../_helpers.js";
import { runtime as apiRuntime, maxDuration as apiMaxDuration } from "../_constants.js";

export const runtime = apiRuntime;
export const maxDuration = apiMaxDuration;

export async function GET(request: Request): Promise<Response> {
  return handleRequest(request, {
    allowedMethods: ["GET", "OPTIONS"],
    action: "messages:bulk",
    handler: async ({ requestId, url }) => {
      const roomIdsParam = url.searchParams.get("roomIds");
      if (!roomIdsParam) {
        return createErrorResponse("roomIds query parameter is required", 400);
      }

      const roomIds = roomIdsParam
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id.length > 0);

      if (roomIds.length === 0) {
        return createErrorResponse("At least one room ID is required", 400);
      }

      return handleGetBulkMessages(roomIds, requestId);
    },
  });
}
