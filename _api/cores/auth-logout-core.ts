import type { Redis } from "@upstash/redis";
import { deleteToken, validateAuth } from "../_utils/auth/index.js";
import type { CoreResponse } from "../_runtime/core-types.js";

interface LogoutCoreInput {
  originAllowed: boolean;
  username: string | null;
  token: string | null;
  redis: Redis;
}

export async function executeAuthLogoutCore(
  input: LogoutCoreInput
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

  await deleteToken(input.redis, input.token);
  return {
    status: 200,
    body: { success: true, message: "Logged out successfully" },
  };
}
