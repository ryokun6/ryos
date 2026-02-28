import type { Redis } from "@upstash/redis";
import { getUserTokens, validateAuth } from "../_utils/auth/index.js";
import type { CoreResponse } from "../_runtime/core-types.js";

interface AuthTokensCoreInput {
  originAllowed: boolean;
  username: string | null;
  currentToken: string | null;
  redis: Redis;
}

export async function executeAuthTokensCore(
  input: AuthTokensCoreInput
): Promise<CoreResponse> {
  if (!input.originAllowed) {
    return { status: 403, body: { error: "Unauthorized" } };
  }

  if (!input.username || !input.currentToken) {
    return { status: 401, body: { error: "Unauthorized - missing credentials" } };
  }

  const authResult = await validateAuth(input.redis, input.username, input.currentToken, {
    allowExpired: true,
  });
  if (!authResult.valid) {
    return { status: 401, body: { error: "Unauthorized - invalid token" } };
  }

  const tokens = await getUserTokens(input.redis, input.username.toLowerCase());
  const tokenList = tokens.map((tokenInfo) => ({
    maskedToken: `...${tokenInfo.token.slice(-8)}`,
    createdAt: tokenInfo.createdAt,
    isCurrent: tokenInfo.token === input.currentToken,
  }));

  return {
    status: 200,
    body: { tokens: tokenList, count: tokenList.length },
  };
}
