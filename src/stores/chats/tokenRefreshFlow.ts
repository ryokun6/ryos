import { readErrorResponseBody } from "./httpErrors";
import { refreshAuthTokenRequest } from "./authApi";
import { parseRefreshTokenResponse } from "./authParsers";
import { applyRefreshedAuthToken } from "./authStateUpdates";

export const getTokenAgeMs = (
  lastRefreshTime: number,
  now: number = Date.now()
): number => now - lastRefreshTime;

export const getTokenAgeDays = (
  lastRefreshTime: number,
  now: number = Date.now()
): number =>
  Math.floor(getTokenAgeMs(lastRefreshTime, now) / (24 * 60 * 60 * 1000));

export const isTokenRefreshDue = (
  lastRefreshTime: number,
  refreshThresholdMs: number,
  now: number = Date.now()
): boolean => getTokenAgeMs(lastRefreshTime, now) > refreshThresholdMs;

export const getDaysUntilTokenRefresh = (
  lastRefreshTime: number,
  refreshThresholdMs: number,
  now: number = Date.now()
): number => {
  const refreshDueAt = lastRefreshTime + refreshThresholdMs;
  const remainingMs = Math.max(0, refreshDueAt - now);
  return Math.floor(remainingMs / (24 * 60 * 60 * 1000));
};

interface RefreshAuthTokenForUserParams {
  username: string;
  currentToken: string;
  saveAuthTokenToRecovery: (token: string) => void;
  saveTokenRefreshTime: (username: string) => void;
  setAuthToken: (token: string) => void;
}

export const refreshAuthTokenForUser = async ({
  username,
  currentToken,
  saveAuthTokenToRecovery,
  saveTokenRefreshTime,
  setAuthToken,
}: RefreshAuthTokenForUserParams): Promise<{
  ok: boolean;
  error?: string;
  token?: string;
}> => {
  const response = await refreshAuthTokenRequest({
    username,
    oldToken: currentToken,
  });

  if (!response.ok) {
    const errorData = await readErrorResponseBody(response);
    return {
      ok: false,
      error: errorData.error || "Failed to refresh token",
    };
  }

  const data = await response.json();
  const parsedRefresh = parseRefreshTokenResponse(data);
  if (!parsedRefresh.ok) {
    return { ok: false, error: parsedRefresh.error };
  }

  applyRefreshedAuthToken({
    username,
    token: parsedRefresh.token,
    setAuthToken,
    saveAuthTokenToRecovery,
    saveTokenRefreshTime,
  });
  return { ok: true, token: parsedRefresh.token };
};

interface CheckAndRefreshTokenFlowParams {
  username: string;
  currentToken: string;
  refreshThresholdMs: number;
  getTokenRefreshTime: (username: string) => number | null;
  saveTokenRefreshTime: (username: string) => void;
  refreshAuthToken: () => Promise<{ ok: boolean; error?: string }>;
}

export const checkAndRefreshTokenFlow = async ({
  username,
  currentToken,
  refreshThresholdMs,
  getTokenRefreshTime,
  saveTokenRefreshTime,
  refreshAuthToken,
}: CheckAndRefreshTokenFlowParams): Promise<{ refreshed: boolean }> => {
  if (!username || !currentToken) {
    return { refreshed: false };
  }

  const lastRefreshTime = getTokenRefreshTime(username);
  if (!lastRefreshTime) {
    saveTokenRefreshTime(username);
    return { refreshed: false };
  }

  const tokenAgeDays = getTokenAgeDays(lastRefreshTime);
  console.log(`[ChatsStore] Token age: ${tokenAgeDays} days`);

  if (isTokenRefreshDue(lastRefreshTime, refreshThresholdMs)) {
    console.log(
      `[ChatsStore] Token is ${tokenAgeDays} days old (refresh due - 7 days before 90-day expiry), refreshing...`
    );

    const refreshResult = await refreshAuthToken();
    if (refreshResult.ok) {
      saveTokenRefreshTime(username);
      console.log("[ChatsStore] Token refreshed automatically (7 days before expiry)");
      return { refreshed: true };
    }

    console.error(
      "[ChatsStore] Failed to refresh token (will retry next hour):",
      refreshResult.error
    );
    return { refreshed: false };
  }

  const daysUntilRefresh = getDaysUntilTokenRefresh(
    lastRefreshTime,
    refreshThresholdMs
  );
  console.log(
    `[ChatsStore] Token is ${tokenAgeDays} days old, next refresh in ${daysUntilRefresh} days`
  );
  return { refreshed: false };
};
