import { handleRequest } from "../_http.js";
import { handleCreateUser } from "../_users.js";
import {
  checkRateLimit,
  isBlockedForUserCreation,
  blockIpForUserCreation,
} from "../../_utils/auth.js";
import { getClientIp, createErrorResponse } from "../_helpers.js";
import { runtime as apiRuntime, maxDuration as apiMaxDuration } from "../_constants.js";

export const runtime = apiRuntime;
export const maxDuration = apiMaxDuration;

export async function POST(request: Request): Promise<Response> {
  return handleRequest(request, {
    allowedMethods: ["POST", "OPTIONS"],
    action: "auth:signup",
    handler: async ({ requestId }) => {
      const ip = getClientIp(request);
      const identifier = `ip:${ip}`.toLowerCase();

      // Blocked IP check (24h)
      const blocked = await isBlockedForUserCreation(ip);
      if (blocked) {
        return createErrorResponse(
          "User creation temporarily blocked due to excessive attempts. Try again in 24 hours.",
          429
        );
      }

      const allowed = await checkRateLimit("createUser", identifier, requestId);
      if (!allowed) {
        await blockIpForUserCreation(ip);
        return createErrorResponse(
          "Too many user creation attempts. You're blocked for 24 hours.",
          429
        );
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

      return handleCreateUser(body as { username?: string; password?: string }, requestId);
    },
  });
}
