import { track } from "@vercel/analytics";
import { APP_ANALYTICS } from "@/utils/analytics";
import type { AIChatMessage } from "@/types/chat";
import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";
import {
  type RefreshTokenResult,
  logoutRequest,
  refreshAuthTokenRequest,
  registerUserRequest,
} from "./authApi";
import {
  AUTH_TOKEN_RECOVERY_KEY,
  TOKEN_LAST_REFRESH_KEY,
  USERNAME_RECOVERY_KEY,
} from "./recovery";
import {
  readErrorResponseBody,
  withChatRequestDefaults,
} from "./transport";

const PASSWORD_CHECK_DELAY_MS = 100;

export const CHAT_USERNAME_PATTERN =
  /^[a-z](?:[a-z0-9]|[-_](?=[a-z0-9])){2,29}$/i;
export const CHAT_PASSWORD_MIN_LENGTH = 8;

interface ValidateCreateUserInputParams {
  username: string;
  password: string;
}

export const validateCreateUserInput = ({
  username,
  password,
}: ValidateCreateUserInputParams): string | null => {
  if (!username) {
    return "Username cannot be empty";
  }

  if (!CHAT_USERNAME_PATTERN.test(username)) {
    return "Invalid username: use 3-30 letters/numbers; '-' or '_' allowed between characters; no spaces or symbols";
  }

  if (!password || password.trim().length === 0) {
    return "Password is required";
  }
  if (password.length < CHAT_PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${CHAT_PASSWORD_MIN_LENGTH} characters`;
  }

  return null;
};

export const shouldCheckPasswordStatus = (
  username: string | null,
  authToken: string | null
): boolean => Boolean(username && authToken);

export const schedulePasswordStatusCheck = (
  checkFn: () => void,
  delayMs: number = PASSWORD_CHECK_DELAY_MS
): void => {
  setTimeout(checkFn, delayMs);
};

interface RefreshTokenResponseData {
  token?: string;
}

export const parseRefreshTokenResponse = (
  data: RefreshTokenResponseData
): { ok: true; token: string } | { ok: false; error: string } => {
  if (data.token) {
    return { ok: true, token: data.token };
  }

  return {
    ok: false,
    error: "Invalid response format for token refresh",
  };
};

interface RegisterUserResponseData {
  user?: {
    username: string;
  };
  token?: string;
}

export const parseRegisterUserResponse = (
  data: RegisterUserResponseData
):
  | { ok: true; username: string; token?: string }
  | { ok: false; error: string } => {
  if (!data.user?.username) {
    return { ok: false, error: "Invalid response format" };
  }

  return {
    ok: true,
    username: data.user.username,
    token: data.token,
  };
};

interface ApplyRefreshedAuthTokenParams {
  username: string;
  token: string;
  setAuthToken: (token: string) => void;
  saveAuthTokenToRecovery: (token: string) => void;
  saveTokenRefreshTime: (username: string) => void;
}

export const applyRefreshedAuthToken = ({
  username,
  token,
  setAuthToken,
  saveAuthTokenToRecovery,
  saveTokenRefreshTime,
}: ApplyRefreshedAuthTokenParams): void => {
  setAuthToken(token);
  saveAuthTokenToRecovery(token);
  saveTokenRefreshTime(username);
};

interface ApplySuccessfulRegistrationParams {
  username: string;
  token?: string;
  setUsername: (username: string) => void;
  setAuthToken: (token: string) => void;
  saveAuthTokenToRecovery: (token: string) => void;
  saveTokenRefreshTime: (username: string) => void;
  onCheckHasPassword: () => void;
}

export const applySuccessfulRegistration = ({
  username,
  token,
  setUsername,
  setAuthToken,
  saveAuthTokenToRecovery,
  saveTokenRefreshTime,
  onCheckHasPassword,
}: ApplySuccessfulRegistrationParams): void => {
  setUsername(username);

  if (token) {
    setAuthToken(token);
    saveAuthTokenToRecovery(token);
    saveTokenRefreshTime(username);
    schedulePasswordStatusCheck(onCheckHasPassword);
  }

  track(APP_ANALYTICS.USER_CREATE, { username });
};

interface CreateUserFlowParams {
  username: string;
  password: string;
  setUsername: (username: string) => void;
  setAuthToken: (token: string) => void;
  saveAuthTokenToRecovery: (token: string) => void;
  saveTokenRefreshTime: (username: string) => void;
  onCheckHasPassword: () => void;
}

export const runCreateUserFlow = async ({
  username,
  password,
  setUsername,
  setAuthToken,
  saveAuthTokenToRecovery,
  saveTokenRefreshTime,
  onCheckHasPassword,
}: CreateUserFlowParams): Promise<{ ok: boolean; error?: string }> => {
  const trimmedUsername = username.trim();
  const validationError = validateCreateUserInput({
    username: trimmedUsername,
    password,
  });
  if (validationError) {
    return { ok: false, error: validationError };
  }

  try {
    const response = await registerUserRequest({
      username: trimmedUsername,
      password,
    });

    if (!response.ok) {
      const errorData = await readErrorResponseBody(response);
      return {
        ok: false,
        error: errorData.error || "Failed to create user",
      };
    }

    const data = await response.json();
    const parsedRegister = parseRegisterUserResponse(data);
    if (!parsedRegister.ok) {
      return { ok: false, error: parsedRegister.error };
    }

    applySuccessfulRegistration({
      username: parsedRegister.username,
      token: parsedRegister.token,
      setUsername,
      setAuthToken,
      saveAuthTokenToRecovery,
      saveTokenRefreshTime,
      onCheckHasPassword,
    });

    return { ok: true };
  } catch (error) {
    console.error("[ChatsStore] Error creating user:", error);
    return { ok: false, error: "Network error. Please try again." };
  }
};

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
  refreshAuthToken: () => Promise<RefreshTokenResult>;
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

interface PasswordAuthContext {
  username: string;
  authToken: string;
}

export const checkPasswordStatusRequest = async ({
  username,
  authToken,
}: PasswordAuthContext): Promise<Response> =>
  abortableFetch(
    "/api/auth/password/check",
    withChatRequestDefaults({
      method: "GET",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "X-Username": username,
      },
    })
  );

export const fetchPasswordStatus = async ({
  username,
  authToken,
}: PasswordAuthContext): Promise<
  { ok: true; hasPassword: boolean } | { ok: false; error: string }
> => {
  const response = await checkPasswordStatusRequest({
    username,
    authToken,
  });

  if (!response.ok) {
    return { ok: false, error: "Failed to check password status" };
  }

  const data = (await response.json()) as { hasPassword?: unknown };
  return { ok: true, hasPassword: Boolean(data.hasPassword) };
};

interface SetPasswordContext extends PasswordAuthContext {
  password: string;
}

export const setPasswordRequest = async ({
  username,
  authToken,
  password,
}: SetPasswordContext): Promise<Response> =>
  abortableFetch(
    getApiUrl("/api/auth/password/set"),
    withChatRequestDefaults({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
        "X-Username": username,
      },
      body: JSON.stringify({ password }),
    })
  );

export const submitPassword = async ({
  username,
  authToken,
  password,
}: SetPasswordContext): Promise<{ ok: true } | { ok: false; error: string }> => {
  const response = await setPasswordRequest({
    username,
    authToken,
    password,
  });

  if (!response.ok) {
    const errorData = await readErrorResponseBody(response);
    return {
      ok: false,
      error: errorData.error || "Failed to set password",
    };
  }

  return { ok: true };
};

interface PasswordActionContext {
  username: string | null;
  authToken: string | null;
  setHasPassword: (value: boolean | null) => void;
}

export const runCheckHasPasswordFlow = async ({
  username,
  authToken,
  setHasPassword,
}: PasswordActionContext): Promise<{ ok: boolean; error?: string }> => {
  if (!username || !authToken) {
    console.log("[ChatsStore] checkHasPassword: No username or token, setting null");
    setHasPassword(null);
    return { ok: false, error: "Authentication required" };
  }

  console.log("[ChatsStore] checkHasPassword: Checking for user", username);
  try {
    const result = await fetchPasswordStatus({ username, authToken });

    if (result.ok) {
      console.log("[ChatsStore] checkHasPassword: Result", result);
      setHasPassword(result.hasPassword);
      return { ok: true };
    }

    console.log("[ChatsStore] checkHasPassword: Failed");
    setHasPassword(null);
    return { ok: false, error: result.error };
  } catch (error) {
    console.error("[ChatsStore] Error checking password status:", error);
    setHasPassword(null);
    return {
      ok: false,
      error: "Network error while checking password",
    };
  }
};

interface SetPasswordFlowContext extends PasswordActionContext {
  password: string;
}

export const runSetPasswordFlow = async ({
  username,
  authToken,
  password,
  setHasPassword,
}: SetPasswordFlowContext): Promise<{ ok: boolean; error?: string }> => {
  if (!username || !authToken) {
    return { ok: false, error: "Authentication required" };
  }

  try {
    const result = await submitPassword({
      username,
      authToken,
      password,
    });

    if (!result.ok) {
      return {
        ok: false,
        error: result.error || "Failed to set password",
      };
    }

    setHasPassword(true);
    return { ok: true };
  } catch (error) {
    console.error("[ChatsStore] Error setting password:", error);
    return { ok: false, error: "Network error while setting password" };
  }
};

export const notifyServerOnLogout = async (
  username: string | null,
  token: string | null
): Promise<void> => {
  if (!username || !token) {
    return;
  }

  try {
    await logoutRequest({
      username,
      token,
    });
  } catch (error) {
    console.warn("[ChatsStore] Failed to notify server during logout:", error);
  }
};

export const trackLogoutAnalytics = (username: string | null): void => {
  if (username) {
    track(APP_ANALYTICS.USER_LOGOUT, { username });
  }
};

export const clearChatRecoveryStorage = (username: string | null): void => {
  localStorage.removeItem(USERNAME_RECOVERY_KEY);
  localStorage.removeItem(AUTH_TOKEN_RECOVERY_KEY);

  if (username) {
    const tokenRefreshKey = `${TOKEN_LAST_REFRESH_KEY}${username}`;
    localStorage.removeItem(tokenRefreshKey);
  }
};

interface LogoutStateShape {
  aiMessages: AIChatMessage[];
  username: string | null;
  authToken: string | null;
  hasPassword: boolean | null;
  currentRoomId: string | null;
}

export const buildPostLogoutState = <State extends LogoutStateShape>(
  state: State,
  initialAiMessage: AIChatMessage
): State => ({
  ...state,
  aiMessages: [initialAiMessage],
  username: null,
  authToken: null,
  hasPassword: null,
  currentRoomId: null,
});
