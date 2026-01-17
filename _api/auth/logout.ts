/**
 * POST /api/auth/logout
 * 
 * Logout current session (invalidate current token)
 */

import { Redis } from "@upstash/redis";
import { deleteToken } from "../_utils/auth/index.js";
import {
  jsonResponse,
  errorResponse,
  handleCors,
  requireAuth,
} from "../_utils/middleware.js";

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

  // Require authentication
  const auth = await requireAuth(request, redis, cors.origin);
  if (auth.error) return auth.error;

  // Delete current token
  await deleteToken(redis, auth.user!.token);

  return jsonResponse(
    {
      success: true,
      message: "Logged out successfully",
    },
    200,
    cors.origin
  );
}

export async function OPTIONS(request: Request): Promise<Response> {
  const cors = handleCors(request, ["POST", "OPTIONS"]);
  return cors.preflight || new Response(null, { status: 204 });
}
