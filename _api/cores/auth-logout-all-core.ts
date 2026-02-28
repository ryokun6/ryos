import type { Redis } from "@upstash/redis";
import { deleteAllUserTokens, validateAuth } from "../_utils/auth/index.js";
import type { CoreResponse } from "../_runtime/core-types.js";

interface AuthLogoutAllCoreInput {
  originAllowed: boolean;
  username: string | null;
  token: string | null;
  redis: Redis;
}

export async function executeAuthLogoutAllCore(
  input: AuthLogoutAllCoreInput
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

  const deletedCount = await deleteAllUserTokens(input.redis, input.username.toLowerCase());
  return {
    status: 200,
    body: {
      success: true,
      message: `Logged out from ${deletedCount} devices`,
      deletedCount,
    },
  };
}
