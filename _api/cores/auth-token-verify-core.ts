import type { Redis } from "@upstash/redis";
import { validateAuth } from "../_utils/auth/index.js";
import { isProfaneUsername } from "../_utils/_validation.js";
import type { CoreResponse } from "../_runtime/core-types.js";

interface VerifyTokenCoreInput {
  originAllowed: boolean;
  username: string | null;
  token: string | null;
  redis: Redis;
}

export async function executeAuthTokenVerifyCore(
  input: VerifyTokenCoreInput
): Promise<CoreResponse> {
  if (!input.originAllowed) {
    return { status: 403, body: { error: "Unauthorized" } };
  }

  if (!input.token) {
    return { status: 401, body: { error: "Authorization token required" } };
  }

  if (!input.username) {
    return { status: 400, body: { error: "X-Username header required" } };
  }

  if (isProfaneUsername(input.username)) {
    return { status: 401, body: { error: "Invalid authentication token" } };
  }

  const result = await validateAuth(input.redis, input.username, input.token, {
    allowExpired: true,
  });

  if (!result.valid) {
    return { status: 401, body: { error: "Invalid authentication token" } };
  }

  const normalizedUsername = input.username.toLowerCase();
  if (result.expired) {
    return {
      status: 200,
      body: {
        valid: true,
        username: normalizedUsername,
        expired: true,
        message: "Token is within grace period",
      },
    };
  }

  return {
    status: 200,
    body: {
      valid: true,
      username: normalizedUsername,
      message: "Token is valid",
    },
  };
}
