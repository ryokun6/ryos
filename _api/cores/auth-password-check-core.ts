import type { Redis } from "@upstash/redis";
import { userHasPassword, validateAuth } from "../_utils/auth/index.js";
import type { CoreResponse } from "../_runtime/core-types.js";

interface AuthPasswordCheckCoreInput {
  originAllowed: boolean;
  username: string | null;
  token: string | null;
  redis: Redis;
}

export async function executeAuthPasswordCheckCore(
  input: AuthPasswordCheckCoreInput
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

  const normalizedUsername = input.username.toLowerCase();
  const hasPassword = await userHasPassword(input.redis, normalizedUsername);
  return {
    status: 200,
    body: {
      hasPassword,
      username: normalizedUsername,
    },
  };
}
