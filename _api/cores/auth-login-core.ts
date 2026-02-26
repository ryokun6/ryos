import type { Redis } from "@upstash/redis";
import {
  generateAuthToken,
  storeToken,
  deleteToken,
  storeLastValidToken,
  CHAT_USERS_PREFIX,
  TOKEN_GRACE_PERIOD,
} from "../_utils/auth/index.js";
import {
  verifyPassword,
  getUserPasswordHash,
} from "../_utils/auth/_password.js";
import type { CoreResponse } from "../_runtime/core-types.js";

interface LoginRequest {
  username: string;
  password: string;
  oldToken?: string;
}

interface LoginCoreInput {
  body: unknown;
  redis: Redis;
  ip: string;
}

export async function executeAuthLoginCore(
  input: LoginCoreInput
): Promise<CoreResponse> {
  const rlKey = `rl:auth:login:ip:${input.ip}`;
  const current = await input.redis.incr(rlKey);
  if (current === 1) {
    await input.redis.expire(rlKey, 60);
  }
  if (current > 10) {
    return {
      status: 429,
      body: { error: "Too many login attempts. Please try again later." },
    };
  }

  const body = input.body as LoginRequest;
  const { username: rawUsername, password, oldToken } = body || {};

  if (!rawUsername || typeof rawUsername !== "string") {
    return { status: 400, body: { error: "Username is required" } };
  }

  if (!password || typeof password !== "string") {
    return { status: 400, body: { error: "Password is required" } };
  }

  const username = rawUsername.toLowerCase();
  const userKey = `${CHAT_USERS_PREFIX}${username}`;

  const userData = await input.redis.get(userKey);
  if (!userData) {
    return { status: 401, body: { error: "Invalid credentials" } };
  }

  const passwordHash = await getUserPasswordHash(input.redis, username);
  if (!passwordHash) {
    return { status: 401, body: { error: "Invalid credentials" } };
  }

  const passwordValid = await verifyPassword(password, passwordHash);
  if (!passwordValid) {
    return { status: 401, body: { error: "Invalid credentials" } };
  }

  try {
    if (oldToken) {
      await storeLastValidToken(
        input.redis,
        username,
        oldToken,
        Date.now(),
        TOKEN_GRACE_PERIOD
      );
      await deleteToken(input.redis, oldToken);
    }

    const token = generateAuthToken();
    await storeToken(input.redis, username, token);
    return { status: 200, body: { token, username } };
  } catch {
    return { status: 500, body: { error: "Login failed" } };
  }
}
