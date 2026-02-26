import type { Redis } from "@upstash/redis";
import {
  validateAuth,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from "../_utils/auth/index.js";
import { hashPassword, setUserPasswordHash } from "../_utils/auth/_password.js";
import type { CoreResponse } from "../_runtime/core-types.js";

interface SetPasswordRequest {
  password: string;
}

interface AuthPasswordSetCoreInput {
  originAllowed: boolean;
  username: string | null;
  token: string | null;
  body: unknown;
  redis: Redis;
}

export async function executeAuthPasswordSetCore(
  input: AuthPasswordSetCoreInput
): Promise<CoreResponse> {
  if (!input.originAllowed) {
    return { status: 403, body: { error: "Unauthorized" } };
  }

  if (!input.username || !input.token) {
    return { status: 401, body: { error: "Unauthorized - missing credentials" } };
  }

  const authResult = await validateAuth(input.redis, input.username, input.token, {
    allowExpired: true,
  });
  if (!authResult.valid) {
    return { status: 401, body: { error: "Unauthorized - invalid token" } };
  }

  const body = input.body as SetPasswordRequest;
  const { password } = body || {};

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

  try {
    const passwordHash = await hashPassword(password);
    await setUserPasswordHash(input.redis, input.username.toLowerCase(), passwordHash);
    return { status: 200, body: { success: true } };
  } catch {
    return { status: 500, body: { error: "Failed to set password" } };
  }
}
