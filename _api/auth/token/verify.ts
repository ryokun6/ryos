/**
 * POST /api/auth/token/verify
 * 
 * Verify if a token is valid
 */

import { Redis } from "@upstash/redis";
import { validateAuth, extractAuth } from "../../_utils/auth/index.js";
import {
  jsonResponse,
  errorResponse,
  handleCors,
} from "../../_utils/middleware.js";
import { isProfaneUsername } from "../../_utils/_validation.js";

export const runtime = "edge";
export const maxDuration = 15;

export async function POST(request: Request): Promise<Response> {
  // Handle CORS
  const cors = handleCors(request, ["POST", "OPTIONS"]);
  if (cors.preflight) return cors.preflight;
  if (!cors.allowed) {
    return errorResponse("Unauthorized", 403);
  }

  const redis = new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });

  // Extract auth from headers
  const { username, token } = extractAuth(request);

  if (!token) {
    return errorResponse("Authorization token required", 401, cors.origin);
  }

  if (!username) {
    return errorResponse("X-Username header required", 400, cors.origin);
  }

  // Check profanity
  if (isProfaneUsername(username)) {
    return errorResponse("Invalid authentication token", 401, cors.origin);
  }

  // Validate token (allow expired for grace period info)
  const result = await validateAuth(redis, username, token, { allowExpired: true });

  if (!result.valid) {
    return errorResponse("Invalid authentication token", 401, cors.origin);
  }

  if (result.expired) {
    return jsonResponse(
      {
        valid: true,
        username: username.toLowerCase(),
        expired: true,
        message: "Token is within grace period",
      },
      200,
      cors.origin
    );
  }

  return jsonResponse(
    {
      valid: true,
      username: username.toLowerCase(),
      message: "Token is valid",
    },
    200,
    cors.origin
  );
}

export async function OPTIONS(request: Request): Promise<Response> {
  const cors = handleCors(request, ["POST", "OPTIONS"]);
  return cors.preflight || new Response(null, { status: 204 });
}
