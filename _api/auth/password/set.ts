/**
 * POST /api/auth/password/set
 * 
 * Set or update user's password
 */

import { Redis } from "@upstash/redis";
import {
  hashPassword,
  setUserPasswordHash,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "../../_utils/auth/index.js";
import {
  jsonResponse,
  errorResponse,
  handleCors,
  requireAuth,
  parseJsonBody,
} from "../../_utils/middleware.js";

export const runtime = "nodejs"; // Requires bcrypt
export const maxDuration = 15;

interface SetPasswordRequest {
  password: string;
}

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

  // Parse body
  const { data: body, error: parseError } = await parseJsonBody<SetPasswordRequest>(request);
  if (parseError || !body) {
    return errorResponse(parseError || "Invalid request body", 400, cors.origin);
  }

  const { password } = body;

  // Validate password
  if (!password || typeof password !== "string") {
    return errorResponse("Password is required", 400, cors.origin);
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return errorResponse(
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
      400,
      cors.origin
    );
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return errorResponse(
      `Password must be ${PASSWORD_MAX_LENGTH} characters or less`,
      400,
      cors.origin
    );
  }

  // Hash and store password
  const passwordHash = await hashPassword(password);
  await setUserPasswordHash(redis, auth.user!.username, passwordHash);

  return jsonResponse(
    {
      success: true,
    },
    200,
    cors.origin
  );
}

export async function OPTIONS(request: Request): Promise<Response> {
  const cors = handleCors(request, ["POST", "OPTIONS"]);
  return cors.preflight || new Response(null, { status: 204 });
}
