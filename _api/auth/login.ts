/**
 * POST /api/auth/login
 * 
 * Authenticate with username and password
 */

import { Redis } from "@upstash/redis";
import {
  generateAuthToken,
  storeToken,
  deleteToken,
  storeLastValidToken,
  verifyPassword,
  getUserPasswordHash,
  CHAT_USERS_PREFIX,
  PASSWORD_MAX_LENGTH,
  TOKEN_GRACE_PERIOD,
} from "../_utils/auth/index.js";
import {
  jsonResponse,
  errorResponse,
  handleCors,
  checkRateLimit,
  parseJsonBody,
} from "../_utils/middleware.js";
import { isProfaneUsername } from "../_utils/_validation.js";

export const runtime = "nodejs"; // Requires bcrypt
export const maxDuration = 15;

interface LoginRequest {
  username: string;
  password: string;
  oldToken?: string;
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
    { prefix: "auth:login", windowSeconds: 60, limit: 10, byIp: true },
    null,
    cors.origin
  );
  
  if (!rateLimit.allowed) {
    return rateLimit.error!;
  }

  // Parse body
  const { data: body, error: parseError } = await parseJsonBody<LoginRequest>(request);
  if (parseError || !body) {
    return errorResponse(parseError || "Invalid request body", 400, cors.origin);
  }

  const { username: rawUsername, password, oldToken } = body;

  // Validate inputs
  if (!rawUsername || typeof rawUsername !== "string") {
    return errorResponse("Username is required", 400, cors.origin);
  }

  if (!password || typeof password !== "string") {
    return errorResponse("Password is required", 400, cors.origin);
  }

  // Prevent bcrypt DoS with very long passwords
  if (password.length > PASSWORD_MAX_LENGTH) {
    return errorResponse("Invalid username or password", 401, cors.origin);
  }

  const username = rawUsername.toLowerCase();

  // Check profanity
  if (isProfaneUsername(username)) {
    return errorResponse("Invalid username or password", 401, cors.origin);
  }

  // Check if user exists
  const userKey = `${CHAT_USERS_PREFIX}${username}`;
  const userData = await redis.get(userKey);
  
  if (!userData) {
    return errorResponse("Invalid username or password", 401, cors.origin);
  }

  // Check password
  const passwordHash = await getUserPasswordHash(redis, username);
  
  if (!passwordHash) {
    return errorResponse("Invalid username or password", 401, cors.origin);
  }

  const isValid = await verifyPassword(password, passwordHash);
  
  if (!isValid) {
    return errorResponse("Invalid username or password", 401, cors.origin);
  }

  // Handle old token (for token rotation)
  if (oldToken) {
    await deleteToken(redis, oldToken);
    await storeLastValidToken(redis, username, oldToken, Date.now(), TOKEN_GRACE_PERIOD);
  }

  // Generate new token
  const token = generateAuthToken();
  await storeToken(redis, username, token);

  return jsonResponse(
    {
      token,
      username,
    },
    200,
    cors.origin
  );
}

export async function OPTIONS(request: Request): Promise<Response> {
  const cors = handleCors(request, ["POST", "OPTIONS"]);
  return cors.preflight || new Response(null, { status: 204 });
}
