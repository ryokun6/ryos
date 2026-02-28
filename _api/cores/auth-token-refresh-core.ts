import type { Redis } from "@upstash/redis";
import {
  generateAuthToken,
  storeToken,
  deleteToken,
  storeLastValidToken,
  validateAuth,
  CHAT_USERS_PREFIX,
  TOKEN_GRACE_PERIOD,
} from "../_utils/auth/index.js";
import * as RateLimit from "../_utils/_rate-limit.js";
import type { CoreResponse } from "../_runtime/core-types.js";

interface RefreshRequest {
  username: string;
  oldToken: string;
}

interface AuthTokenRefreshCoreInput {
  originAllowed: boolean;
  body: unknown;
  ip: string;
  redis: Redis;
}

export async function executeAuthTokenRefreshCore(
  input: AuthTokenRefreshCoreInput
): Promise<CoreResponse> {
  if (!input.originAllowed) {
    return { status: 403, body: { error: "Unauthorized" } };
  }

  const rlKey = RateLimit.makeKey(["rl", "auth:refresh", "ip", input.ip]);
  const rlResult = await RateLimit.checkCounterLimit({
    key: rlKey,
    windowSeconds: 60,
    limit: 10,
  });
  if (!rlResult.allowed) {
    return {
      status: 429,
      body: { error: "Too many refresh attempts. Please try again later." },
    };
  }

  const body = input.body as RefreshRequest | undefined;
  const rawUsername = body?.username;
  const oldToken = body?.oldToken;

  if (!rawUsername || typeof rawUsername !== "string") {
    return { status: 400, body: { error: "Username is required" } };
  }
  if (!oldToken || typeof oldToken !== "string") {
    return { status: 400, body: { error: "Old token is required" } };
  }

  const username = rawUsername.toLowerCase();
  const userKey = `${CHAT_USERS_PREFIX}${username}`;
  const userData = await input.redis.get(userKey);
  if (!userData) {
    return { status: 404, body: { error: "User not found" } };
  }

  const validationResult = await validateAuth(input.redis, username, oldToken, {
    allowExpired: true,
  });
  if (!validationResult.valid) {
    return { status: 401, body: { error: "Invalid authentication token" } };
  }

  await storeLastValidToken(
    input.redis,
    username,
    oldToken,
    Date.now(),
    TOKEN_GRACE_PERIOD
  );
  await deleteToken(input.redis, oldToken);
  const newToken = generateAuthToken();
  await storeToken(input.redis, username, newToken);

  return {
    status: 201,
    body: { token: newToken },
  };
}
