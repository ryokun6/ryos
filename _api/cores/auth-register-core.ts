import type { Redis } from "@upstash/redis";
import {
  generateAuthToken,
  storeToken,
  CHAT_USERS_PREFIX,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "../_utils/auth/index.js";
import {
  hashPassword,
  setUserPasswordHash,
  verifyPassword,
  getUserPasswordHash,
} from "../_utils/auth/_password.js";
import {
  isProfaneUsername,
  assertValidUsername,
} from "../_utils/_validation.js";
import type { CoreResponse } from "../_runtime/core-types.js";

interface RegisterRequest {
  username: string;
  password: string;
}

interface RegisterCoreInput {
  body: unknown;
  redis: Redis;
  ip: string;
}

export async function executeAuthRegisterCore(
  input: RegisterCoreInput
): Promise<CoreResponse> {
  const blockKey = `rl:block:register:ip:${input.ip}`;
  const blocked = await input.redis.get(blockKey);
  if (blocked) {
    return {
      status: 429,
      body: { error: "Too many registration attempts. Please try again later." },
    };
  }

  const rlKey = `rl:auth:register:ip:${input.ip}`;
  const current = await input.redis.incr(rlKey);
  if (current === 1) {
    await input.redis.expire(rlKey, 60);
  }
  if (current > 5) {
    await input.redis.set(blockKey, "1", { ex: 86400 });
    return {
      status: 429,
      body: { error: "Too many registration attempts. Please try again later." },
    };
  }

  const body = input.body as RegisterRequest;
  const { username: rawUsername, password } = body || {};

  if (!rawUsername || typeof rawUsername !== "string") {
    return { status: 400, body: { error: "Username is required" } };
  }

  try {
    assertValidUsername(rawUsername, "register");
  } catch (error) {
    return {
      status: 400,
      body: {
        error: error instanceof Error ? error.message : "Invalid username",
      },
    };
  }

  if (isProfaneUsername(rawUsername)) {
    return {
      status: 400,
      body: { error: "Username contains inappropriate language" },
    };
  }

  if (!password || typeof password !== "string") {
    return { status: 400, body: { error: "Password is required" } };
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      status: 400,
      body: { error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` },
    };
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return {
      status: 400,
      body: { error: `Password must be ${PASSWORD_MAX_LENGTH} characters or less` },
    };
  }

  const username = rawUsername.toLowerCase();
  const userKey = `${CHAT_USERS_PREFIX}${username}`;

  const existingUser = await input.redis.get(userKey);
  if (existingUser) {
    try {
      const storedHash = await getUserPasswordHash(input.redis, username);
      if (storedHash) {
        const passwordValid = await verifyPassword(password, storedHash);
        if (passwordValid) {
          const token = generateAuthToken();
          await storeToken(input.redis, username, token);
          return { status: 200, body: { token, user: { username } } };
        }
      }
    } catch {
      // fall through to username conflict response
    }
    return { status: 409, body: { error: "Username already taken" } };
  }

  try {
    const userData = {
      username,
      createdAt: Date.now(),
      lastActive: Date.now(),
    };
    await input.redis.set(userKey, JSON.stringify(userData));

    const passwordHash = await hashPassword(password);
    await setUserPasswordHash(input.redis, username, passwordHash);

    const token = generateAuthToken();
    await storeToken(input.redis, username, token);

    return { status: 201, body: { token, user: { username } } };
  } catch {
    return { status: 500, body: { error: "Failed to create user" } };
  }
}
