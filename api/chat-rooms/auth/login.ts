import { handleRequest } from "../_http.js";
import { handleAuthenticateWithPassword } from "../_tokens.js";
import { checkRateLimit } from "../../_utils/auth.js";
import { getClientIp, createErrorResponse } from "../_helpers.js";
import { runtime as apiRuntime, maxDuration as apiMaxDuration } from "../_constants.js";

export const runtime = apiRuntime;
export const maxDuration = apiMaxDuration;

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, {
    allowedMethods: ["POST", "OPTIONS"],
    action: "auth:login",
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

      const ip = getClientIp(request);
      const identifier = (
        (body.username as string) ||
        request.headers.get("x-username") ||
        `anon:${ip}`
      )!
        .toString()
        .toLowerCase();

      const allowed = await checkRateLimit("authenticateWithPassword", identifier, requestId);
      if (!allowed) {
        return createErrorResponse("Too many requests, please slow down", 429);
      }

      return handleAuthenticateWithPassword(
        body as { username?: string; password?: string; oldToken?: string },
        requestId
      );
    },
  });
}
