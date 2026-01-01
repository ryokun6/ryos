import { handleRequest } from "../_http.js";
import { handleListTokens } from "../_tokens.js";
import { extractAuth, validateAuth } from "../../_utils/auth.js";
import { createErrorResponse } from "../_helpers.js";
import { runtime as apiRuntime, maxDuration as apiMaxDuration } from "../_constants.js";

export const runtime = apiRuntime;
export const maxDuration = apiMaxDuration;

export async function GET(request: Request): Promise<Response> {
  return handleRequest(request, {
    allowedMethods: ["GET", "OPTIONS"],
    action: "auth:token:list",
    handler: async ({ requestId }) => {
      const { username, token } = extractAuth(request);
      const authResult = await validateAuth(username, token, requestId);
      if (!authResult.valid) {
        return createErrorResponse("Unauthorized", 401);
      }

      return handleListTokens(username, request, requestId);
    },
  });
}
