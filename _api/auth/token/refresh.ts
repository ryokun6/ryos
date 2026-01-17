/**
 * POST /api/auth/token/refresh
 * 
 * Refresh an existing token
 */

import { Redis } from "@upstash/redis";
import {
  generateAuthToken,
  storeToken,
  deleteToken,
  storeLastValidToken,
  validateAuth,
  CHAT_USERS_PREFIX,
  TOKEN_GRACE_PERIOD,
} from "../../_utils/auth/index.js";
import {
  jsonResponse,
  errorResponse,
  handleCors,
  checkRateLimit,
  parseJsonBody,
} from "../../_utils/middleware.js";

export const runtime = "edge";
export const maxDuration = 15;

interface RefreshRequest {
  username: string;
  oldToken: string;
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

  // Rate limiting: 10/min per IP
  const rateLimit = await checkRateLimit(
    request,
    { prefix: "auth:refresh", windowSeconds: 60, limit: 10, byIp: true },
    null,
    cors.origin
  );
  
  if (!rateLimit.allowed) {
    return rateLimit.error!;
  }

  // Parse body
  const { data: body, error: parseError } = await parseJsonBody<RefreshRequest>(request);
  if (parseError || !body) {
    return errorResponse(parseError || "Invalid request body", 400, cors.origin);
  }

  const { username: rawUsername, oldToken } = body;

  // Validate inputs
  if (!rawUsername || typeof rawUsername !== "string") {
    return errorResponse("Username is required", 400, cors.origin);
  }

  if (!oldToken || typeof oldToken !== "string") {
    return errorResponse("Old token is required", 400, cors.origin);
  }

  const username = rawUsername.toLowerCase();

  // Check if user exists
  const userKey = `${CHAT_USERS_PREFIX}${username}`;
  const userData = await redis.get(userKey);
  
  if (!userData) {
    return errorResponse("User not found", 404, cors.origin);
  }

  // Validate old token (allow expired for grace period refresh)
  const validationResult = await validateAuth(redis, username, oldToken, { allowExpired: true });

  if (!validationResult.valid) {
    return errorResponse("Invalid authentication token", 401, cors.origin);
  }

  // Store old token for grace period
  await storeLastValidToken(redis, username, oldToken, Date.now(), TOKEN_GRACE_PERIOD);

  // Delete old token
  await deleteToken(redis, oldToken);

  // Generate new token
  const newToken = generateAuthToken();
  await storeToken(redis, username, newToken);

  return jsonResponse(
    {
      token: newToken,
    },
    201,
    cors.origin
  );
}

export async function OPTIONS(request: Request): Promise<Response> {
  const cors = handleCors(request, ["POST", "OPTIONS"]);
  return cors.preflight || new Response(null, { status: 204 });
}
