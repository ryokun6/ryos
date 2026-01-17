/**
 * POST /api/auth/register
 * 
 * Create a new user account with password
 */

import { Redis } from "@upstash/redis";
import {
  generateAuthToken,
  storeToken,
  hashPassword,
  setUserPasswordHash,
  CHAT_USERS_PREFIX,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "../_utils/auth/index.js";
import {
  jsonResponse,
  errorResponse,
  handleCors,
  checkRateLimit,
  parseJsonBody,
} from "../_utils/middleware.js";
import { isProfaneUsername, assertValidUsername } from "../_utils/_validation.js";
import * as RateLimit from "../_utils/_rate-limit.js";

export const runtime = "nodejs"; // Requires bcrypt
export const maxDuration = 15;

interface RegisterRequest {
  username: string;
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

  // Rate limiting: 5/min per IP, with 24h block after exceeded
  const ip = RateLimit.getClientIp(request);
  const blockKey = `rl:block:createUser:ip:${ip}`;
  
  const isBlocked = await redis.get(blockKey);
  if (isBlocked) {
    return errorResponse(
      "User creation temporarily blocked due to excessive attempts. Try again in 24 hours.",
      429,
      cors.origin
    );
  }

  const rateLimit = await checkRateLimit(
    request,
    { prefix: "auth:register", windowSeconds: 60, limit: 5, byIp: true },
    null,
    cors.origin
  );
  
  if (!rateLimit.allowed) {
    // Set 24h block
    await redis.set(blockKey, 1, { ex: 24 * 60 * 60 });
    return rateLimit.error!;
  }

  // Parse body
  const { data: body, error: parseError } = await parseJsonBody<RegisterRequest>(request);
  if (parseError || !body) {
    return errorResponse(parseError || "Invalid request body", 400, cors.origin);
  }

  const { username: rawUsername, password } = body;

  // Validate username
  if (!rawUsername || typeof rawUsername !== "string") {
    return errorResponse("Username is required", 400, cors.origin);
  }

  const username = rawUsername.toLowerCase();

  try {
    assertValidUsername(username, "register");
  } catch (e) {
    return errorResponse(
      e instanceof Error ? e.message : "Invalid username format",
      400,
      cors.origin
    );
  }

  // Check profanity
  if (isProfaneUsername(username)) {
    return errorResponse("Username contains inappropriate language", 400, cors.origin);
  }

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

  // Check if user already exists
  const userKey = `${CHAT_USERS_PREFIX}${username}`;
  const existingUser = await redis.get(userKey);
  
  if (existingUser) {
    return errorResponse("Username already taken", 409, cors.origin);
  }

  // Create user
  const now = Date.now();
  const userData = {
    username,
    lastActive: now,
  };

  await redis.set(userKey, JSON.stringify(userData));

  // Hash and store password
  const passwordHash = await hashPassword(password);
  await setUserPasswordHash(redis, username, passwordHash);

  // Generate auth token
  const token = generateAuthToken();
  await storeToken(redis, username, token);

  return jsonResponse(
    {
      user: { username },
      token,
    },
    201,
    cors.origin
  );
}

export async function OPTIONS(request: Request): Promise<Response> {
  const cors = handleCors(request, ["POST", "OPTIONS"]);
  return cors.preflight || new Response(null, { status: 204 });
}
