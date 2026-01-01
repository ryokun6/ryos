import { handleRequest } from "../../_http.js";
import { handleClearAllMessages } from "../../_messages.js";
import { extractAuth, validateAuth } from "../../../_utils/auth.js";
import { createErrorResponse } from "../../_helpers.js";
import { runtime as apiRuntime, maxDuration as apiMaxDuration } from "../../_constants.js";

export const runtime = apiRuntime;
export const maxDuration = apiMaxDuration;

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, {
    allowedMethods: ["POST", "OPTIONS"],
    action: "admin:clearMessages",
    handler: async ({ requestId }) => {
      const { username, token } = extractAuth(request);
      const authResult = await validateAuth(username, token, requestId);
      if (!authResult.valid || username?.toLowerCase() !== "ryo") {
        return createErrorResponse("Forbidden - Admin access required", 403);
      }

      return handleClearAllMessages(username, token, requestId);
    },
  });
}
