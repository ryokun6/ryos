import { handleRequest } from "../../../../_http.js";
import { handleDeleteMessage } from "../../../../_messages.js";
import { extractAuth, validateAuth } from "../../../../../_utils/auth.js";
import { createErrorResponse } from "../../../../_helpers.js";
import { runtime as apiRuntime, maxDuration as apiMaxDuration } from "../../../../_constants.js";

export const runtime = apiRuntime;
export const maxDuration = apiMaxDuration;

function getPathParts(url: URL): string[] {
  return url.pathname.split("/").filter(Boolean);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleRequest(request, {
    allowedMethods: ["DELETE", "OPTIONS"],
    action: "messages:delete",
    handler: async ({ requestId, url }) => {
      const parts = getPathParts(url);
      const messageId = parts[parts.length - 1];
      const roomId = parts[parts.length - 3]; // .../rooms/{roomId}/messages/{messageId}

      if (!roomId || !messageId) {
        return createErrorResponse("roomId and messageId are required", 400);
      }

      const { username, token } = extractAuth(request);
      const authResult = await validateAuth(username, token, requestId);
      if (!authResult.valid) {
        return createErrorResponse("Unauthorized", 401);
      }

      return handleDeleteMessage(roomId, messageId, username, token, requestId);
    },
  });
}
