/**
 * GET /api/auth/password/check
 * 
 * Check if user has a password set
 */

import { Redis } from "@upstash/redis";
import { userHasPassword } from "../../_utils/auth/index.js";
import {
  jsonResponse,
  errorResponse,
  handleCors,
  requireAuth,
} from "../../_utils/middleware.js";

export const runtime = "nodejs"; // Requires password module
export const maxDuration = 15;

export async function GET(request: Request): Promise<Response> {
  // Handle CORS
  const cors = handleCors(request, ["GET", "OPTIONS"]);
  if (cors.preflight) return cors.preflight;
  if (!cors.allowed) {
    return errorResponse("Unauthorized", 403);
  }

  const redis = new Redis({
    url: process.env.REDIS_KV_REST_API_URL!,
    token: process.env.REDIS_KV_REST_API_TOKEN!,
  });

  // Require authentication
  const auth = await requireAuth(request, redis, cors.origin);
  if (auth.error) return auth.error;

  // Check if password is set
  const hasPassword = await userHasPassword(redis, auth.user!.username);

  return jsonResponse(
    {
      hasPassword,
      username: auth.user!.username,
    },
    200,
    cors.origin
  );
}

export async function OPTIONS(request: Request): Promise<Response> {
  const cors = handleCors(request, ["GET", "OPTIONS"]);
  return cors.preflight || new Response(null, { status: 204 });
}
