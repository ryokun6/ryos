import { track } from "@vercel/analytics";
import { APP_ANALYTICS } from "@/utils/analytics";
import type { AIChatMessage, ChatMessage, ChatRoom } from "@/types/chat";
import { abortableFetch } from "@/utils/abortableFetch";
import { decodeHtmlEntities } from "@/utils/html";
import { getApiUrl } from "@/utils/platform";

// ─────────────────────────────────────────────────────────────────────────────
// Shared constants
// ─────────────────────────────────────────────────────────────────────────────
const PASSWORD_CHECK_DELAY_MS = 100;
const AUTHENTICATION_REQUIRED_ERROR = "Authentication required";
const INVALID_RESPONSE_FORMAT_ERROR = "Invalid response format";
const USERNAME_REQUIRED_ERROR = "Username required";
const USERNAME_AND_CONTENT_REQUIRED_ERROR = "Username and content required";
const NETWORK_ERROR_MESSAGE = "Network error. Please try again.";
const PASSWORD_STATUS_CHECK_FAILED_ERROR = "Failed to check password status";
const CREATE_USER_FAILED_ERROR = "Failed to create user";
const REFRESH_TOKEN_FAILED_ERROR = "Failed to refresh token";
const SET_PASSWORD_FAILED_ERROR = "Failed to set password";
const CREATE_ROOM_FAILED_ERROR = "Failed to create room";
const DELETE_ROOM_FAILED_ERROR = "Failed to delete room";
const SEND_MESSAGE_FAILED_ERROR = "Failed to send message";
const SWITCH_ROOM_FAILED_ERROR = "Failed to switch rooms";
const FETCH_ROOMS_FAILED_ERROR = "Failed to fetch rooms";
const FETCH_MESSAGES_FAILED_ERROR = "Failed to fetch messages";
const PASSWORD_STATUS_NETWORK_ERROR = "Network error while checking password";
const SET_PASSWORD_NETWORK_ERROR = "Network error while setting password";

// ─────────────────────────────────────────────────────────────────────────────
// Recovery / persistence key helpers
// ─────────────────────────────────────────────────────────────────────────────
const USERNAME_RECOVERY_KEY = "_usr_recovery_key_";
const AUTH_TOKEN_RECOVERY_KEY = "_auth_recovery_key_";
export const TOKEN_REFRESH_THRESHOLD = 83 * 24 * 60 * 60 * 1000;
const TOKEN_LAST_REFRESH_KEY = "_token_refresh_time_";

const encode = (value: string): string => {
  return btoa(value.split("").reverse().join(""));
};

const decode = (encoded: string): string | null => {
  try {
    return atob(encoded).split("").reverse().join("");
  } catch (error) {
    console.error("[ChatsStore] Failed to decode value:", error);
    return null;
  }
};

const encodeUsername = (username: string): string => encode(username);
const decodeUsername = (encoded: string): string | null => decode(encoded);

export const saveUsernameToRecovery = (username: string | null): void => {
  if (username) {
    localStorage.setItem(USERNAME_RECOVERY_KEY, encodeUsername(username));
  }
};

export const getUsernameFromRecovery = (): string | null => {
  const encoded = localStorage.getItem(USERNAME_RECOVERY_KEY);
  if (encoded) {
    return decodeUsername(encoded);
  }
  return null;
};

export const saveAuthTokenToRecovery = (token: string | null): void => {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_RECOVERY_KEY, encode(token));
  } else {
    localStorage.removeItem(AUTH_TOKEN_RECOVERY_KEY);
  }
};

export const getAuthTokenFromRecovery = (): string | null => {
  const encoded = localStorage.getItem(AUTH_TOKEN_RECOVERY_KEY);
  if (encoded) {
    return decode(encoded);
  }
  return null;
};

export const saveTokenRefreshTime = (username: string): void => {
  const key = `${TOKEN_LAST_REFRESH_KEY}${username}`;
  localStorage.setItem(key, Date.now().toString());
};

export const getTokenRefreshTime = (username: string): number | null => {
  const key = `${TOKEN_LAST_REFRESH_KEY}${username}`;
  const time = localStorage.getItem(key);
  if (!time) {
    return null;
  }

  const parsedTime = parseInt(time, 10);
  return Number.isFinite(parsedTime) ? parsedTime : null;
};

export const ensureRecoveryKeysAreSet = (
  username: string | null,
  authToken: string | null
): void => {
  if (username && !localStorage.getItem(USERNAME_RECOVERY_KEY)) {
    console.log(
      "[ChatsStore] Setting recovery key for existing username:",
      username
    );
    saveUsernameToRecovery(username);
  }
  if (authToken && !localStorage.getItem(AUTH_TOKEN_RECOVERY_KEY)) {
    console.log("[ChatsStore] Setting recovery key for existing auth token");
    saveAuthTokenToRecovery(authToken);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Transport + response parsing helpers
// ─────────────────────────────────────────────────────────────────────────────
type ChatRetryConfig = {
  maxAttempts: number;
  initialDelayMs: number;
};

type ChatRequestOptions = RequestInit & {
  timeout?: number;
  throwOnHttpError?: boolean;
  retry?: ChatRetryConfig;
};

const DEFAULT_CHAT_RETRY: ChatRetryConfig = {
  maxAttempts: 1,
  initialDelayMs: 250,
};

const withChatRequestDefaults = (
  options: ChatRequestOptions
): ChatRequestOptions => {
  const mergedRetry: ChatRetryConfig = {
    ...DEFAULT_CHAT_RETRY,
    ...(options.retry || {}),
  };

  return {
    timeout: 15000,
    throwOnHttpError: false,
    ...options,
    retry: mergedRetry,
  };
};

interface ErrorResponseBody {
  error: string;
}

const readErrorResponseBody = async (
  response: Response
): Promise<ErrorResponseBody> => {
  const fallbackError = `HTTP error! status: ${response.status}`;
  const parsed = (await response.json().catch(() => ({
    error: fallbackError,
  }))) as { error?: unknown };

  return {
    error:
      typeof parsed.error === "string" && parsed.error.length > 0
        ? parsed.error
        : fallbackError,
  };
};

const readErrorMessage = async (
  response: Response,
  fallback: string
): Promise<string> => {
  const errorData = await readErrorResponseBody(response);
  return errorData.error || fallback;
};

const logAndBuildErrorResult = (
  message: string,
  error: unknown,
  userError: string = NETWORK_ERROR_MESSAGE
): { ok: false; error: string } => {
  console.error(message, error);
  return { ok: false, error: userError };
};

const toHeaders = (headers?: HeadersInit): Headers => {
  const normalized = new Headers();
  if (!headers) {
    return normalized;
  }

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      normalized.set(key, value);
    });
    return normalized;
  }

  if (Array.isArray(headers)) {
    headers.forEach(([key, value]) => {
      normalized.set(key, value);
    });
    return normalized;
  }

  Object.entries(headers).forEach(([key, value]) => {
    if (typeof value === "string") {
      normalized.set(key, value);
    }
  });
  return normalized;
};

const hasAuthorizationHeader = (headers?: HeadersInit): boolean =>
  toHeaders(headers).has("authorization");

const withAuthorizationHeader = (
  headers: HeadersInit | undefined,
  authToken: string
): Headers => {
  const nextHeaders = toHeaders(headers);
  nextHeaders.set("Authorization", `Bearer ${authToken}`);
  return nextHeaders;
};

const createAuthenticatedHeaders = (
  authToken: string,
  username?: string,
  includeJsonContentType: boolean = false
): Headers => {
  const headers = new Headers();
  if (includeJsonContentType) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("Authorization", `Bearer ${authToken}`);
  if (username) {
    headers.set("X-Username", username);
  }
  return headers;
};

let tempMessageCounter = 0;
const createTempMessageId = (): string =>
  `temp_${Date.now().toString(36)}_${(tempMessageCounter++).toString(36)}`;

const withJsonHeaders = (headers?: HeadersInit): Headers => {
  const nextHeaders = toHeaders(headers);
  if (!nextHeaders.has("content-type")) {
    nextHeaders.set("Content-Type", "application/json");
  }
  return nextHeaders;
};

const runChatRequest = (
  url: string,
  options: ChatRequestOptions,
  usePlatformUrl: boolean = false
): Promise<Response> =>
  abortableFetch(
    usePlatformUrl ? getApiUrl(url) : url,
    withChatRequestDefaults(options)
  );

const withQueryParams = (
  path: string,
  params: Record<string, string | null | undefined>
): string => {
  const queryParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") {
      queryParams.append(key, value);
    }
  });

  const query = queryParams.toString();
  return query ? `${path}?${query}` : path;
};

const warnedStoreIssues = new Set<string>();

const warnChatsStoreOnce = (key: string, message: string): void => {
  if (warnedStoreIssues.has(key)) {
    return;
  }
  warnedStoreIssues.add(key);
  console.warn(message);
};

const CHAT_API_UNAVAILABLE_COOLDOWN_MS = 10_000;
const apiUnavailableUntil: Record<string, number> = {};

const isApiTemporarilyUnavailable = (key: string): boolean =>
  Date.now() < (apiUnavailableUntil[key] || 0);

const markApiTemporarilyUnavailable = (key: string): void => {
  apiUnavailableUntil[key] = Date.now() + CHAT_API_UNAVAILABLE_COOLDOWN_MS;
};

const clearApiUnavailable = (key: string): void => {
  delete apiUnavailableUntil[key];
};

const readJsonBody = async <T>(
  response: Response,
  context: string
): Promise<{ ok: true; data: T } | { ok: false; error: string }> => {
  const contentType = response.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.includes("json")) {
    return {
      ok: false,
      error: `${context}: expected JSON but got ${contentType || "unknown content-type"}`,
    };
  }

  try {
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, error: `${context}: invalid JSON response body` };
  }
};

const readRequiredJsonBody = async <T>(
  response: Response,
  context: string
): Promise<{ ok: true; data: T } | { ok: false; error: string }> => {
  const body = await readJsonBody<T>(response, context);
  if (!body.ok) {
    return { ok: false, error: INVALID_RESPONSE_FORMAT_ERROR };
  }
  return body;
};

// ─────────────────────────────────────────────────────────────────────────────
// Auth API + authentication lifecycle
// ─────────────────────────────────────────────────────────────────────────────
type RefreshTokenResult = {
  ok: boolean;
  error?: string;
  token?: string;
};

type RefreshTokenHandler = () => Promise<RefreshTokenResult>;

const makeAuthenticatedRequest = async (
  url: string,
  options: RequestInit,
  refreshToken: RefreshTokenHandler
): Promise<Response> => {
  const initialResponse = await runChatRequest(url, { ...options });

  if (
    initialResponse.status !== 401 ||
    !hasAuthorizationHeader(options.headers)
  ) {
    return initialResponse;
  }

  console.log("[ChatsStore] Received 401, attempting token refresh...");

  const refreshResult = await refreshToken();
  if (!refreshResult.ok || !refreshResult.token) {
    console.log(
      "[ChatsStore] Token refresh failed, returning original 401 response"
    );
    return initialResponse;
  }

  const newHeaders = withAuthorizationHeader(options.headers, refreshResult.token);

  console.log("[ChatsStore] Retrying request with refreshed token");
  return runChatRequest(url, {
    ...options,
    headers: newHeaders,
  });
};

interface RefreshTokenRequestParams {
  username: string;
  oldToken: string;
}

const refreshAuthTokenRequest = async ({
  username,
  oldToken,
}: RefreshTokenRequestParams): Promise<Response> =>
  runChatRequest("/api/auth/token/refresh", {
    method: "POST",
    headers: withJsonHeaders(),
    body: JSON.stringify({
      username,
      oldToken,
    }),
  });

interface RegisterUserRequestParams {
  username: string;
  password: string;
}

const registerUserRequest = async ({
  username,
  password,
}: RegisterUserRequestParams): Promise<Response> =>
  runChatRequest(
    "/api/auth/register",
    {
      method: "POST",
      headers: withJsonHeaders(),
      body: JSON.stringify({ username, password }),
    },
    true
  );

interface LogoutRequestParams {
  username: string;
  token: string;
}

const logoutRequest = async ({
  username,
  token,
}: LogoutRequestParams): Promise<Response> =>
  runChatRequest(
    "/api/auth/logout",
    {
      method: "POST",
      headers: createAuthenticatedHeaders(token, username, true),
    },
    true
  );

const CHAT_USERNAME_PATTERN =
  /^[a-z](?:[a-z0-9]|[-_](?=[a-z0-9])){2,29}$/i;
const CHAT_PASSWORD_MIN_LENGTH = 8;

interface ValidateCreateUserInputParams {
  username: string;
  password: string;
}

const validateCreateUserInput = ({
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

const parseRefreshTokenResponse = (
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

const parseRegisterUserResponse = (
  data: RegisterUserResponseData
):
  | { ok: true; username: string; token?: string }
  | { ok: false; error: string } => {
  if (!data.user?.username) {
    return { ok: false, error: INVALID_RESPONSE_FORMAT_ERROR };
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

const applyRefreshedAuthToken = ({
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

const applySuccessfulRegistration = ({
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
      return {
        ok: false,
        error: await readErrorMessage(response, CREATE_USER_FAILED_ERROR),
      };
    }

    const registerData = await readRequiredJsonBody<RegisterUserResponseData>(
      response,
      "createUser success response"
    );
    if (!registerData.ok) {
      return registerData;
    }

    const parsedRegister = parseRegisterUserResponse(registerData.data);
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
    return logAndBuildErrorResult("[ChatsStore] Error creating user:", error);
  }
};

const getTokenAgeMs = (
  lastRefreshTime: number,
  now: number = Date.now()
): number => now - lastRefreshTime;

const getTokenAgeDays = (
  lastRefreshTime: number,
  now: number = Date.now()
): number =>
  Math.floor(getTokenAgeMs(lastRefreshTime, now) / (24 * 60 * 60 * 1000));

const isTokenRefreshDue = (
  lastRefreshTime: number,
  refreshThresholdMs: number,
  now: number = Date.now()
): boolean => getTokenAgeMs(lastRefreshTime, now) > refreshThresholdMs;

const getDaysUntilTokenRefresh = (
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
    return {
      ok: false,
      error: await readErrorMessage(response, REFRESH_TOKEN_FAILED_ERROR),
    };
  }

  const refreshData = await readRequiredJsonBody<RefreshTokenResponseData>(
    response,
    "refreshAuthToken success response"
  );
  if (!refreshData.ok) {
    return refreshData;
  }

  const parsedRefresh = parseRefreshTokenResponse(refreshData.data);
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
  if (lastRefreshTime === null) {
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

// ─────────────────────────────────────────────────────────────────────────────
// Password flows
// ─────────────────────────────────────────────────────────────────────────────
interface PasswordAuthContext {
  username: string;
  authToken: string;
}

interface ResolveRequiredAuthTokenParams {
  authToken: string | null;
  ensureAuthToken: () => Promise<{ ok: boolean; error?: string }>;
  getCurrentAuthToken: () => string | null;
}

const resolveRequiredAuthToken = async ({
  authToken,
  ensureAuthToken,
  getCurrentAuthToken,
}: ResolveRequiredAuthTokenParams): Promise<
  { ok: true; authToken: string } | { ok: false; error: string }
> => {
  if (authToken) {
    return { ok: true, authToken };
  }

  const tokenResult = await ensureAuthToken();
  if (!tokenResult.ok) {
    return { ok: false, error: AUTHENTICATION_REQUIRED_ERROR };
  }

  const recoveredAuthToken = getCurrentAuthToken();
  if (!recoveredAuthToken) {
    return { ok: false, error: AUTHENTICATION_REQUIRED_ERROR };
  }

  return { ok: true, authToken: recoveredAuthToken };
};

const requireAuthContext = (
  username: string | null,
  authToken: string | null
): { ok: true; auth: PasswordAuthContext } | { ok: false; error: string } => {
  if (!username || !authToken) {
    return { ok: false, error: AUTHENTICATION_REQUIRED_ERROR };
  }

  return {
    ok: true,
    auth: {
      username,
      authToken,
    },
  };
};

const checkPasswordStatusRequest = async ({
  username,
  authToken,
}: PasswordAuthContext): Promise<Response> =>
  runChatRequest("/api/auth/password/check", {
    method: "GET",
    headers: createAuthenticatedHeaders(authToken, username),
  });

const fetchPasswordStatus = async ({
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
    return { ok: false, error: PASSWORD_STATUS_CHECK_FAILED_ERROR };
  }

  const passwordStatusData = await readRequiredJsonBody<{ hasPassword?: unknown }>(
    response,
    "checkPasswordStatus success response"
  );
  if (!passwordStatusData.ok) {
    return passwordStatusData;
  }

  return { ok: true, hasPassword: Boolean(passwordStatusData.data.hasPassword) };
};

interface SetPasswordContext extends PasswordAuthContext {
  password: string;
}

const setPasswordRequest = async ({
  username,
  authToken,
  password,
}: SetPasswordContext): Promise<Response> =>
  runChatRequest(
    "/api/auth/password/set",
    {
      method: "POST",
      headers: createAuthenticatedHeaders(authToken, username, true),
      body: JSON.stringify({ password }),
    },
    true
  );

const submitPassword = async ({
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
    return {
      ok: false,
      error: await readErrorMessage(response, SET_PASSWORD_FAILED_ERROR),
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
  const authContext = requireAuthContext(username, authToken);
  if (!authContext.ok) {
    console.log("[ChatsStore] checkHasPassword: No username or token, setting null");
    setHasPassword(null);
    return authContext;
  }

  console.log(
    "[ChatsStore] checkHasPassword: Checking for user",
    authContext.auth.username
  );
  try {
    const result = await fetchPasswordStatus(authContext.auth);

    if (result.ok) {
      console.log("[ChatsStore] checkHasPassword: Result", result);
      setHasPassword(result.hasPassword);
      return { ok: true };
    }

    console.log("[ChatsStore] checkHasPassword: Failed");
    setHasPassword(null);
    return { ok: false, error: result.error };
  } catch (error) {
    setHasPassword(null);
    return logAndBuildErrorResult(
      "[ChatsStore] Error checking password status:",
      error,
      PASSWORD_STATUS_NETWORK_ERROR
    );
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
  const authContext = requireAuthContext(username, authToken);
  if (!authContext.ok) {
    return authContext;
  }

  try {
    const result = await submitPassword({
      username: authContext.auth.username,
      authToken: authContext.auth.authToken,
      password,
    });

    if (!result.ok) {
      return {
        ok: false,
        error: result.error || SET_PASSWORD_FAILED_ERROR,
      };
    }

    setHasPassword(true);
    return { ok: true };
  } catch (error) {
    return logAndBuildErrorResult(
      "[ChatsStore] Error setting password:",
      error,
      SET_PASSWORD_NETWORK_ERROR
    );
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

// ─────────────────────────────────────────────────────────────────────────────
// Persist migration + rehydration lifecycle
// ─────────────────────────────────────────────────────────────────────────────
const LEGACY_CHAT_STORAGE_KEYS = {
  AI_MESSAGES: "chats:messages",
  USERNAME: "chats:chatRoomUsername",
  LAST_OPENED_ROOM_ID: "chats:lastOpenedRoomId",
  SIDEBAR_VISIBLE: "chats:sidebarVisible",
  CACHED_ROOMS: "chats:cachedRooms",
  CACHED_ROOM_MESSAGES: "chats:cachedRoomMessages",
} as const;

const tryParseLegacyJson = <T>(value: string): T | null => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

interface PersistLifecycleParams<State> {
  persistedState: unknown;
  version: number;
  storeVersion: number;
  getInitialState: () => State;
}

interface RehydratableChatsState {
  username: string | null;
  authToken: string | null;
  rooms?: unknown;
}

interface LegacyMigratedState {
  aiMessages?: AIChatMessage[];
  username?: string;
  currentRoomId?: string;
  isSidebarVisible?: boolean;
  rooms?: ChatRoom[];
  roomMessages?: Record<string, ChatMessage[]>;
}

const migrateLegacyChatStorageState = (): LegacyMigratedState => {
  const migratedState: LegacyMigratedState = {};

  const oldAiMessagesRaw = localStorage.getItem(LEGACY_CHAT_STORAGE_KEYS.AI_MESSAGES);
  if (oldAiMessagesRaw) {
    const parsedAiMessages = tryParseLegacyJson<AIChatMessage[]>(oldAiMessagesRaw);
    if (parsedAiMessages) {
      migratedState.aiMessages = parsedAiMessages;
    } else {
      console.warn(
        "Failed to parse old AI messages during migration",
        oldAiMessagesRaw
      );
    }
  }

  const oldUsernameKey = LEGACY_CHAT_STORAGE_KEYS.USERNAME;
  const oldUsername = localStorage.getItem(oldUsernameKey);
  if (oldUsername) {
    migratedState.username = oldUsername;
    saveUsernameToRecovery(oldUsername);
    localStorage.removeItem(oldUsernameKey);
    console.log(
      `[ChatsStore] Migrated and removed '${oldUsernameKey}' key during version upgrade.`
    );
  }

  const oldCurrentRoomId = localStorage.getItem(
    LEGACY_CHAT_STORAGE_KEYS.LAST_OPENED_ROOM_ID
  );
  if (oldCurrentRoomId) {
    migratedState.currentRoomId = oldCurrentRoomId;
  }

  const oldSidebarVisibleRaw = localStorage.getItem(
    LEGACY_CHAT_STORAGE_KEYS.SIDEBAR_VISIBLE
  );
  if (oldSidebarVisibleRaw) {
    migratedState.isSidebarVisible = oldSidebarVisibleRaw !== "false";
  }

  const oldCachedRoomsRaw = localStorage.getItem(
    LEGACY_CHAT_STORAGE_KEYS.CACHED_ROOMS
  );
  if (oldCachedRoomsRaw) {
    const parsedRooms = tryParseLegacyJson<ChatRoom[]>(oldCachedRoomsRaw);
    if (parsedRooms) {
      migratedState.rooms = parsedRooms;
    } else {
      console.warn(
        "Failed to parse old cached rooms during migration",
        oldCachedRoomsRaw
      );
    }
  }

  const oldCachedRoomMessagesRaw = localStorage.getItem(
    LEGACY_CHAT_STORAGE_KEYS.CACHED_ROOM_MESSAGES
  );
  if (oldCachedRoomMessagesRaw) {
    const parsedRoomMessages = tryParseLegacyJson<Record<string, ChatMessage[]>>(
      oldCachedRoomMessagesRaw
    );
    if (parsedRoomMessages) {
      migratedState.roomMessages = parsedRoomMessages;
    } else {
      console.warn(
        "Failed to parse old cached room messages during migration",
        oldCachedRoomMessagesRaw
      );
    }
  }

  return migratedState;
};

const applyIdentityRecoveryOnRehydrate = (
  state: RehydratableChatsState
): void => {
  if (state.username === null) {
    const recoveredUsername = getUsernameFromRecovery();
    if (recoveredUsername) {
      console.log(
        `[ChatsStore] Found encoded username '${recoveredUsername}' in recovery storage. Applying.`
      );
      state.username = recoveredUsername;
    } else {
      const oldUsernameKey = LEGACY_CHAT_STORAGE_KEYS.USERNAME;
      const oldUsername = localStorage.getItem(oldUsernameKey);
      if (oldUsername) {
        console.log(
          `[ChatsStore] Found old username '${oldUsername}' in localStorage during rehydration check. Applying.`
        );
        state.username = oldUsername;
        saveUsernameToRecovery(oldUsername);
        localStorage.removeItem(oldUsernameKey);
        console.log(
          `[ChatsStore] Removed old key '${oldUsernameKey}' after rehydration fix.`
        );
      } else {
        console.log(
          "[ChatsStore] Username is null, but no username found in recovery or old localStorage during rehydration check."
        );
      }
    }
  }

  if (state.authToken === null) {
    const recoveredAuthToken = getAuthTokenFromRecovery();
    if (recoveredAuthToken) {
      console.log(
        "[ChatsStore] Found encoded auth token in recovery storage. Applying."
      );
      state.authToken = recoveredAuthToken;
    }
  }

  ensureRecoveryKeysAreSet(state.username, state.authToken);
};

export const migrateChatsPersistedState = <State>({
  persistedState,
  version,
  storeVersion,
  getInitialState,
}: PersistLifecycleParams<State>): State => {
  console.log(
    "[ChatsStore] Migrate function started. Version:",
    version,
    "Persisted state exists:",
    !!persistedState
  );
  if (persistedState) {
    const state = persistedState as RehydratableChatsState;
    console.log(
      "[ChatsStore] Persisted state type for rooms:",
      typeof state.rooms,
      "Is Array:",
      Array.isArray(state.rooms)
    );
  }

  if (version < storeVersion && !persistedState) {
    console.log(
      `[ChatsStore] Migrating from old localStorage keys to version ${storeVersion}...`
    );
    try {
      const migratedState = migrateLegacyChatStorageState();

      console.log("[ChatsStore] Migration data:", migratedState);

      const finalMigratedState = {
        ...getInitialState(),
        ...migratedState,
      } as State;
      console.log("[ChatsStore] Final migrated state:", finalMigratedState);
      console.log(
        "[ChatsStore] Migrated rooms type:",
        typeof (finalMigratedState as RehydratableChatsState).rooms,
        "Is Array:",
        Array.isArray((finalMigratedState as RehydratableChatsState).rooms)
      );
      return finalMigratedState;
    } catch (error) {
      console.error("[ChatsStore] Migration failed:", error);
    }
  }

  if (persistedState) {
    console.log("[ChatsStore] Using persisted state.");
    const finalState = { ...(persistedState as object) } as RehydratableChatsState;

    if (finalState.username || finalState.authToken) {
      ensureRecoveryKeysAreSet(finalState.username, finalState.authToken);
    }

    console.log("[ChatsStore] Final state from persisted:", finalState);
    console.log(
      "[ChatsStore] Persisted state rooms type:",
      typeof finalState.rooms,
      "Is Array:",
      Array.isArray(finalState.rooms)
    );
    return finalState as State;
  }

  console.log("[ChatsStore] Falling back to initial state.");
  return { ...getInitialState() } as State;
};

export const createChatsOnRehydrateStorage = <
  State extends RehydratableChatsState,
>() => {
  console.log("[ChatsStore] Rehydrating storage...");
  return (
    state: State | undefined,
    error: unknown
  ): void => {
    if (error) {
      console.error("[ChatsStore] Error during rehydration:", error);
    } else if (state) {
      console.log(
        "[ChatsStore] Rehydration complete. Current state username:",
        state.username,
        "authToken:",
        state.authToken ? "present" : "null"
      );
      applyIdentityRecoveryOnRehydrate(state);
    }
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Room/message state + transport flows
// ─────────────────────────────────────────────────────────────────────────────
const MESSAGE_HISTORY_CAP = 500;
const MATCH_WINDOW_MS = 10_000;
const INCOMING_TEMP_MATCH_WINDOW_MS = 5_000;
const CHAT_ENDPOINT_KEYS = {
  ROOMS: "rooms",
  ROOM_MESSAGES: "room-messages",
  BULK_MESSAGES: "bulk-messages",
} as const;

const CHAT_PAYLOAD_WARNING_KEYS = {
  ROOMS: "fetchRooms-success-response",
  ROOM_MESSAGES: "fetchMessagesForRoom-success-response",
  BULK_MESSAGES: "fetchBulkMessages-success-response",
} as const;

const CHAT_PAYLOAD_UNAVAILABLE_ERRORS = {
  ROOMS_TEMPORARY: "Rooms API temporarily unavailable",
  ROOMS_UNAVAILABLE: "Rooms API unavailable",
  ROOM_MESSAGES_TEMPORARY: "Messages API temporarily unavailable",
  ROOM_MESSAGES_UNAVAILABLE: "Messages API unavailable",
  BULK_MESSAGES_TEMPORARY: "Bulk messages API temporarily unavailable",
  BULK_MESSAGES_UNAVAILABLE: "Bulk messages API unavailable",
} as const;

interface ApiChatMessagePayload {
  id: string;
  roomId: string;
  username: string;
  content: string;
  timestamp: string | number;
}

const normalizeApiTimestamp = (
  rawTimestamp: string | number
): number => {
  if (typeof rawTimestamp === "number" && Number.isFinite(rawTimestamp)) {
    return rawTimestamp;
  }

  if (typeof rawTimestamp === "string") {
    const trimmed = rawTimestamp.trim();
    if (trimmed.length === 0) {
      return 0;
    }

    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber)) {
      return asNumber;
    }
  }

  const parsedTimestamp = new Date(rawTimestamp).getTime();
  return Number.isFinite(parsedTimestamp) ? parsedTimestamp : 0;
};

const normalizeApiMessage = (
  message: ApiChatMessagePayload
): ChatMessage => ({
  ...message,
  content: decodeHtmlEntities(String(message.content || "")),
  timestamp: normalizeApiTimestamp(message.timestamp),
});

const normalizeApiMessages = (
  messages: ApiChatMessagePayload[]
): ChatMessage[] =>
  messages
    .map((message) => normalizeApiMessage(message))
    .sort((a, b) => a.timestamp - b.timestamp);

export const logIfNetworkResultError = (
  message: string,
  error: string
): void => {
  if (error === NETWORK_ERROR_MESSAGE) {
    console.error(message);
  }
};

const fetchRoomsRequest = async (
  username: string | null
): Promise<Response> => {
  const url = withQueryParams("/api/rooms", { username });

  return runChatRequest(url, {
    method: "GET",
  });
};

const fetchRoomMessagesRequest = async (
  roomId: string
): Promise<Response> =>
  runChatRequest(`/api/rooms/${encodeURIComponent(roomId)}/messages`, {
    method: "GET",
  });

const fetchBulkMessagesRequest = async (
  roomIds: string[]
): Promise<Response> => {
  return runChatRequest(withQueryParams("/api/messages/bulk", {
    roomIds: roomIds.join(","),
  }), {
    method: "GET",
  });
};

const sortChatRoomsForUi = (rooms: ChatRoom[]): ChatRoom[] =>
  [...rooms].sort((a, b) => {
    const aOrder = a.type === "private" ? 1 : 0;
    const bOrder = b.type === "private" ? 1 : 0;
    if (aOrder !== bOrder) return aOrder - bOrder;

    const aName = (a.name || "").toLowerCase();
    const bName = (b.name || "").toLowerCase();
    if (aName !== bName) return aName.localeCompare(bName);

    return a.id.localeCompare(b.id);
  });

const areStringArraysEqual = (
  currentValues?: string[],
  nextValues?: string[]
): boolean => {
  if (!currentValues && !nextValues) {
    return true;
  }
  if (!currentValues || !nextValues) {
    return false;
  }
  if (currentValues.length !== nextValues.length) {
    return false;
  }
  for (let i = 0; i < currentValues.length; i++) {
    if (currentValues[i] !== nextValues[i]) {
      return false;
    }
  }
  return true;
};

const areChatRoomsEqual = (currentRoom: ChatRoom, nextRoom: ChatRoom): boolean =>
  currentRoom.id === nextRoom.id &&
  currentRoom.name === nextRoom.name &&
  currentRoom.type === nextRoom.type &&
  currentRoom.createdAt === nextRoom.createdAt &&
  currentRoom.userCount === nextRoom.userCount &&
  areStringArraysEqual(currentRoom.users, nextRoom.users) &&
  areStringArraysEqual(currentRoom.members, nextRoom.members);

const areChatRoomListsEqual = (
  currentRooms: ChatRoom[],
  nextRooms: ChatRoom[]
): boolean => {
  if (currentRooms.length !== nextRooms.length) {
    return false;
  }

  for (let i = 0; i < currentRooms.length; i++) {
    const currentRoom = currentRooms[i];
    const nextRoom = nextRooms[i];
    if (!currentRoom || !nextRoom || !areChatRoomsEqual(currentRoom, nextRoom)) {
      return false;
    }
  }

  return true;
};

export const prepareRoomsForSet = (
  currentRooms: ChatRoom[],
  incomingRooms: ChatRoom[]
): { changed: boolean; rooms: ChatRoom[] } => {
  if (currentRooms === incomingRooms) {
    return { changed: false, rooms: currentRooms };
  }

  const sortedRooms = sortChatRoomsForUi(incomingRooms);
  return {
    changed: !areChatRoomListsEqual(currentRooms, sortedRooms),
    rooms: sortedRooms,
  };
};

export const capRoomMessages = (messages: ChatMessage[]): ChatMessage[] =>
  messages.length > MESSAGE_HISTORY_CAP
    ? messages.slice(-MESSAGE_HISTORY_CAP)
    : messages;

export const sortAndCapRoomMessages = (
  messages: ChatMessage[]
): ChatMessage[] =>
  capRoomMessages([...messages].sort((a, b) => a.timestamp - b.timestamp));

const getStableMessageClientId = (
  message: Pick<ChatMessage, "id" | "clientId">
): string => message.clientId || message.id;

const withClientId = (
  message: ChatMessage,
  clientId: string
): ChatMessage => ({
  ...message,
  clientId,
});

const buildMessageContentKey = (
  message: Pick<ChatMessage, "username" | "content">
): string => `${message.username}\u0000${message.content}`;

const replaceMessageAtIndex = (
  messages: ChatMessage[],
  targetIndex: number,
  incoming: ChatMessage
): ChatMessage[] => {
  const targetMessage = messages[targetIndex];
  if (!targetMessage) {
    return sortAndCapRoomMessages(messages);
  }

  const updated = [...messages];
  updated[targetIndex] = withClientId(
    incoming,
    getStableMessageClientId(targetMessage)
  );
  return sortAndCapRoomMessages(updated);
};

export const mergeServerMessagesWithOptimistic = (
  existingMessages: ChatMessage[],
  fetchedMessages: ChatMessage[]
): ChatMessage[] => {
  const byId = new Map<string, ChatMessage>();
  const tempMessages: ChatMessage[] = [];

  for (const message of existingMessages) {
    if (message.id.startsWith("temp_")) {
      tempMessages.push(message);
    } else {
      byId.set(message.id, message);
    }
  }

  for (const message of fetchedMessages) {
    const prev = byId.get(message.id);
    if (prev?.clientId) {
      byId.set(message.id, withClientId(message, prev.clientId));
    } else {
      byId.set(message.id, message);
    }
  }

  const usedTempIds = new Set<string>();
  const fetchedByClientId = new Map<string, ChatMessage>();
  const fetchedByContentKey = new Map<string, ChatMessage[]>();

  for (const fetchedMessage of fetchedMessages) {
    if (fetchedMessage.clientId && !fetchedByClientId.has(fetchedMessage.clientId)) {
      fetchedByClientId.set(fetchedMessage.clientId, fetchedMessage);
    }

    const contentKey = buildMessageContentKey(fetchedMessage);
    const keyedMessages = fetchedByContentKey.get(contentKey);
    if (keyedMessages) {
      keyedMessages.push(fetchedMessage);
    } else {
      fetchedByContentKey.set(contentKey, [fetchedMessage]);
    }
  }

  for (const temp of tempMessages) {
    const tempClientId = getStableMessageClientId(temp);
    let matched = false;

    const serverByClientId = fetchedByClientId.get(tempClientId);
    if (serverByClientId) {
      const existingServerMessage = byId.get(serverByClientId.id);
      if (existingServerMessage) {
        byId.set(
          serverByClientId.id,
          withClientId(existingServerMessage, tempClientId)
        );
      }
      matched = true;
    }

    if (!matched) {
      const candidateMessages = fetchedByContentKey.get(buildMessageContentKey(temp));
      if (candidateMessages) {
        for (const candidate of candidateMessages) {
          if (Math.abs(candidate.timestamp - temp.timestamp) <= MATCH_WINDOW_MS) {
            const existingServerMessage = byId.get(candidate.id);
            if (existingServerMessage) {
              byId.set(
                candidate.id,
                withClientId(existingServerMessage, tempClientId)
              );
            }
            matched = true;
            break;
          }
        }
      }
    }

    if (!matched && !usedTempIds.has(temp.id)) {
      byId.set(temp.id, temp);
      usedTempIds.add(temp.id);
    }
  }

  return sortAndCapRoomMessages(Array.from(byId.values()));
};

const mergeIncomingRoomMessage = (
  existingMessages: ChatMessage[],
  incoming: ChatMessage
): ChatMessage[] | null => {
  if (existingMessages.some((message) => message.id === incoming.id)) {
    return null;
  }

  const incomingClientId = incoming.clientId;
  if (incomingClientId) {
    const indexByClientId = existingMessages.findIndex(
      (message) =>
        message.id === incomingClientId || message.clientId === incomingClientId
    );
    if (indexByClientId !== -1) {
      return replaceMessageAtIndex(existingMessages, indexByClientId, incoming);
    }
  }

  const tempIndex = existingMessages.findIndex(
    (message) =>
      message.id.startsWith("temp_") &&
      message.username === incoming.username &&
      message.content === incoming.content
  );

  if (tempIndex !== -1) {
    return replaceMessageAtIndex(existingMessages, tempIndex, incoming);
  }

  const incomingTs = Number(incoming.timestamp);
  const candidateIndexes: number[] = [];
  existingMessages.forEach((message, idx) => {
    if (message.id.startsWith("temp_") && message.username === incoming.username) {
      const delta = Math.abs(Number(message.timestamp) - incomingTs);
      if (Number.isFinite(delta) && delta <= INCOMING_TEMP_MATCH_WINDOW_MS) {
        candidateIndexes.push(idx);
      }
    }
  });

  if (candidateIndexes.length > 0) {
    let bestIndex = candidateIndexes[0];
    let bestDelta = Math.abs(
      Number(existingMessages[bestIndex].timestamp) - incomingTs
    );
    for (let i = 1; i < candidateIndexes.length; i++) {
      const idx = candidateIndexes[i];
      const delta = Math.abs(Number(existingMessages[idx].timestamp) - incomingTs);
      if (delta < bestDelta) {
        bestIndex = idx;
        bestDelta = delta;
      }
    }
    return replaceMessageAtIndex(existingMessages, bestIndex, incoming);
  }

  return sortAndCapRoomMessages([...existingMessages, incoming]);
};

export const setCurrentRoomMessagesInMap = (
  roomMessages: Record<string, ChatMessage[]>,
  currentRoomId: string,
  messages: ChatMessage[]
): Record<string, ChatMessage[]> => ({
  ...roomMessages,
  [currentRoomId]: sortAndCapRoomMessages(messages),
});

export const mergeIncomingRoomMessageInMap = (
  roomMessages: Record<string, ChatMessage[]>,
  roomId: string,
  message: ChatMessage
): Record<string, ChatMessage[]> | null => {
  const existingMessages = roomMessages[roomId] || [];
  const incoming: ChatMessage = {
    ...message,
    content: decodeHtmlEntities(String(message.content || "")),
  };
  const mergedMessages = mergeIncomingRoomMessage(existingMessages, incoming);
  if (!mergedMessages) {
    return null;
  }

  return {
    ...roomMessages,
    [roomId]: mergedMessages,
  };
};

export const removeRoomMessageFromMap = (
  roomMessages: Record<string, ChatMessage[]>,
  roomId: string,
  messageId: string
): { changed: boolean; roomMessages: Record<string, ChatMessage[]> } => {
  const existingMessages = roomMessages[roomId] || [];
  const updatedMessages = existingMessages.filter((message) => message.id !== messageId);
  if (updatedMessages.length >= existingMessages.length) {
    return { changed: false, roomMessages };
  }
  return {
    changed: true,
    roomMessages: {
      ...roomMessages,
      [roomId]: updatedMessages,
    },
  };
};

export const clearRoomMessagesInMap = (
  roomMessages: Record<string, ChatMessage[]>,
  roomId: string
): Record<string, ChatMessage[]> => ({
  ...roomMessages,
  [roomId]: [],
});

export const mergeFetchedMessagesForRoom = (
  roomMessages: Record<string, ChatMessage[]>,
  roomId: string,
  apiMessages: ApiChatMessagePayload[]
): Record<string, ChatMessage[]> => {
  const existing = roomMessages[roomId] || [];
  const fetchedMessages = normalizeApiMessages(apiMessages || []);
  const merged = mergeServerMessagesWithOptimistic(existing, fetchedMessages);

  return {
    ...roomMessages,
    [roomId]: merged,
  };
};

export const mergeFetchedBulkMessages = (
  roomMessages: Record<string, ChatMessage[]>,
  messagesMap: Record<string, ApiChatMessagePayload[]>
): Record<string, ChatMessage[]> => {
  const nextRoomMessages = { ...roomMessages };

  Object.entries(messagesMap).forEach(([roomId, messages]) => {
    const processed = normalizeApiMessages(messages);
    const existing = nextRoomMessages[roomId] || [];
    nextRoomMessages[roomId] = mergeServerMessagesWithOptimistic(
      existing,
      processed
    );
  });

  return nextRoomMessages;
};

export const buildPersistedRoomMessages = (
  roomMessages: Record<string, ChatMessage[]>
): Record<string, ChatMessage[]> =>
  Object.fromEntries(
    Object.entries(roomMessages).map(([roomId, messages]) => [
      roomId,
      capRoomMessages(messages),
    ])
  );

export const toggleBoolean = (value: boolean): boolean => !value;

export const resolveNextFontSize = (
  currentSize: number,
  sizeOrFn: number | ((prevSize: number) => number)
): number =>
  typeof sizeOrFn === "function" ? sizeOrFn(currentSize) : sizeOrFn;

export const sanitizeMessageRenderLimit = (limit: number): number =>
  Math.max(20, Math.floor(limit));

export const incrementUnreadCount = (
  unreadCounts: Record<string, number>,
  roomId: string
): Record<string, number> => ({
  ...unreadCounts,
  [roomId]: (unreadCounts[roomId] || 0) + 1,
});

export const clearUnreadCount = (
  unreadCounts: Record<string, number>,
  roomId: string
): Record<string, number> => {
  if (!(roomId in unreadCounts)) {
    return unreadCounts;
  }
  const { [roomId]: _removed, ...rest } = unreadCounts;
  return rest;
};

interface CreateRoomPayload {
  type: "public" | "private";
  name?: string;
  members?: string[];
}

interface CreateRoomRequestParams {
  name: string;
  type: "public" | "private";
  members: string[];
  authToken: string;
  username: string;
  refreshAuthToken: RefreshTokenHandler;
}

const createRoomRequest = async ({
  name,
  type,
  members,
  authToken,
  username,
  refreshAuthToken,
}: CreateRoomRequestParams): Promise<Response> => {
  const payload: CreateRoomPayload = { type };
  if (type === "public") {
    payload.name = name.trim();
  } else {
    payload.members = members;
  }

  const headers = createAuthenticatedHeaders(authToken, username, true);

  return makeAuthenticatedRequest(
    "/api/rooms",
    {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    },
    refreshAuthToken
  );
};

interface DeleteRoomRequestParams {
  roomId: string;
  authToken: string;
  username: string;
  refreshAuthToken: RefreshTokenHandler;
}

const deleteRoomRequest = async ({
  roomId,
  authToken,
  username,
  refreshAuthToken,
}: DeleteRoomRequestParams): Promise<Response> => {
  const headers = createAuthenticatedHeaders(authToken, username, true);

  return makeAuthenticatedRequest(
    `/api/rooms/${encodeURIComponent(roomId)}`,
    {
      method: "DELETE",
      headers,
    },
    refreshAuthToken
  );
};

const createOptimisticChatMessage = (
  roomId: string,
  username: string,
  content: string
): ChatMessage => {
  const tempId = createTempMessageId();
  return {
    id: tempId,
    clientId: tempId,
    roomId,
    username,
    content,
    timestamp: Date.now(),
  };
};

interface SendRoomMessageRequestParams {
  roomId: string;
  content: string;
  username: string;
  authToken: string | null;
  refreshAuthToken: RefreshTokenHandler;
}

const sendRoomMessageRequest = async ({
  roomId,
  content,
  username,
  authToken,
  refreshAuthToken,
}: SendRoomMessageRequestParams): Promise<Response> => {
  const unauthenticatedHeaders = withJsonHeaders();
  const headers = authToken
    ? createAuthenticatedHeaders(authToken, username, true)
    : unauthenticatedHeaders;

  const messageUrl = `/api/rooms/${encodeURIComponent(roomId)}/messages`;
  const messageBody = JSON.stringify({ content });

  return authToken
    ? makeAuthenticatedRequest(
        messageUrl,
        {
          method: "POST",
          headers,
          body: messageBody,
        },
        refreshAuthToken
      )
    : runChatRequest(
        messageUrl,
        {
          method: "POST",
          headers: unauthenticatedHeaders,
          body: messageBody,
        },
        true
      );
};

interface CreateRoomFlowParams {
  name: string;
  type: "public" | "private";
  members: string[];
  username: string | null;
  authToken: string | null;
  ensureAuthToken: () => Promise<{ ok: boolean; error?: string }>;
  getCurrentAuthToken: () => string | null;
  refreshAuthToken: () => Promise<RefreshTokenResult>;
}

export const runCreateRoomFlow = async ({
  name,
  type,
  members,
  username,
  authToken,
  ensureAuthToken,
  getCurrentAuthToken,
  refreshAuthToken,
}: CreateRoomFlowParams): Promise<{ ok: boolean; error?: string; roomId?: string }> => {
  if (!username) {
    return { ok: false, error: USERNAME_REQUIRED_ERROR };
  }

  const authTokenResult = await resolveRequiredAuthToken({
    authToken,
    ensureAuthToken,
    getCurrentAuthToken,
  });
  if (!authTokenResult.ok) {
    return authTokenResult;
  }

  try {
    const response = await createRoomRequest({
      name,
      type,
      members,
      authToken: authTokenResult.authToken,
      username,
      refreshAuthToken,
    });

    if (!response.ok) {
      return {
        ok: false,
        error: await readErrorMessage(response, CREATE_ROOM_FAILED_ERROR),
      };
    }

    const createRoomData = await readRequiredJsonBody<{ room?: { id: string } }>(
      response,
      "createRoom success response"
    );
    if (!createRoomData.ok) {
      return createRoomData;
    }

    if (createRoomData.data.room?.id) {
      return { ok: true, roomId: createRoomData.data.room.id };
    }

    return { ok: false, error: INVALID_RESPONSE_FORMAT_ERROR };
  } catch (error) {
    return logAndBuildErrorResult("[ChatsStore] Error creating room:", error);
  }
};

interface DeleteRoomFlowParams {
  roomId: string;
  username: string | null;
  authToken: string | null;
  refreshAuthToken: () => Promise<RefreshTokenResult>;
  onDeletedCurrentRoom: () => void;
}

export const runDeleteRoomFlow = async ({
  roomId,
  username,
  authToken,
  refreshAuthToken,
  onDeletedCurrentRoom,
}: DeleteRoomFlowParams): Promise<{ ok: boolean; error?: string }> => {
  const authContext = requireAuthContext(username, authToken);
  if (!authContext.ok) {
    return authContext;
  }

  try {
    const response = await deleteRoomRequest({
      roomId,
      authToken: authContext.auth.authToken,
      username: authContext.auth.username,
      refreshAuthToken,
    });

    if (!response.ok) {
      return {
        ok: false,
        error: await readErrorMessage(response, DELETE_ROOM_FAILED_ERROR),
      };
    }

    onDeletedCurrentRoom();
    return { ok: true };
  } catch (error) {
    return logAndBuildErrorResult("[ChatsStore] Error deleting room:", error);
  }
};

interface SendMessageFlowParams {
  roomId: string;
  content: string;
  username: string | null;
  authToken: string | null;
  refreshAuthToken: () => Promise<RefreshTokenResult>;
  addMessageToRoom: (roomId: string, message: ChatMessage) => void;
  removeMessageFromRoom: (roomId: string, messageId: string) => void;
}

export const runSendMessageFlow = async ({
  roomId,
  content,
  username,
  authToken,
  refreshAuthToken,
  addMessageToRoom,
  removeMessageFromRoom,
}: SendMessageFlowParams): Promise<{ ok: boolean; error?: string }> => {
  const trimmedContent = content.trim();
  if (!username || !trimmedContent) {
    return { ok: false, error: USERNAME_AND_CONTENT_REQUIRED_ERROR };
  }

  const optimisticMessage = createOptimisticChatMessage(
    roomId,
    username,
    trimmedContent
  );
  addMessageToRoom(roomId, optimisticMessage);

  try {
    const response = await sendRoomMessageRequest({
      roomId,
      content: trimmedContent,
      username,
      authToken,
      refreshAuthToken,
    });

    if (!response.ok) {
      removeMessageFromRoom(roomId, optimisticMessage.id);
      return {
        ok: false,
        error: await readErrorMessage(response, SEND_MESSAGE_FAILED_ERROR),
      };
    }

    return { ok: true };
  } catch (error) {
    removeMessageFromRoom(roomId, optimisticMessage.id);
    return logAndBuildErrorResult("[ChatsStore] Error sending message:", error);
  }
};

interface SyncPresenceOnRoomSwitchParams {
  previousRoomId: string | null;
  nextRoomId: string | null;
  username: string;
  onRoomsRefresh: () => void;
}

export const syncPresenceOnRoomSwitch = async ({
  previousRoomId,
  nextRoomId,
  username,
  onRoomsRefresh,
}: SyncPresenceOnRoomSwitchParams): Promise<void> => {
  try {
    const response = await runChatRequest("/api/presence/switch", {
        method: "POST",
        headers: withJsonHeaders(),
        body: JSON.stringify({
          previousRoomId,
          nextRoomId,
          username,
        }),
      });

    if (!response.ok) {
      const errorMessage = await readErrorMessage(
        response,
        SWITCH_ROOM_FAILED_ERROR
      );
      console.error("[ChatsStore] Error switching rooms:", errorMessage);
      return;
    }

    console.log("[ChatsStore] Room switch API call successful");
    setTimeout(() => {
      console.log("[ChatsStore] Refreshing rooms after switch");
      onRoomsRefresh();
    }, 50);
  } catch (error) {
    console.error("[ChatsStore] Network error switching rooms:", error);
  }
};

interface GuardedPayloadFlowParams<TSuccessBody, TValue> {
  endpointKey: string;
  endpointUnavailableError: string;
  request: () => Promise<Response>;
  errorContext: string;
  successContext: string;
  fallbackHttpError: string;
  successWarningKey: string;
  successUnavailableError: string;
  extractValue: (body: TSuccessBody) => TValue | null;
}

const runGuardedPayloadFlow = async <TSuccessBody, TValue>({
  endpointKey,
  endpointUnavailableError,
  request,
  errorContext,
  successContext,
  fallbackHttpError,
  successWarningKey,
  successUnavailableError,
  extractValue,
}: GuardedPayloadFlowParams<TSuccessBody, TValue>): Promise<
  { ok: true; value: TValue } | { ok: false; error: string }
> => {
  if (isApiTemporarilyUnavailable(endpointKey)) {
    return { ok: false, error: endpointUnavailableError };
  }

  try {
    const response = await request();
    if (!response.ok) {
      const errorData = await readJsonBody<{ error?: string }>(
        response,
        errorContext
      );
      return {
        ok: false,
        error: errorData.ok
          ? errorData.data.error || fallbackHttpError
          : `HTTP error! status: ${response.status}`,
      };
    }

    const payloadData = await readJsonBody<TSuccessBody>(response, successContext);
    if (!payloadData.ok) {
      warnChatsStoreOnce(successWarningKey, `[ChatsStore] ${payloadData.error}`);
      markApiTemporarilyUnavailable(endpointKey);
      return { ok: false, error: successUnavailableError };
    }

    const value = extractValue(payloadData.data);
    if (value !== null) {
      clearApiUnavailable(endpointKey);
      return { ok: true, value };
    }

    return { ok: false, error: INVALID_RESPONSE_FORMAT_ERROR };
  } catch {
    markApiTemporarilyUnavailable(endpointKey);
    return { ok: false, error: NETWORK_ERROR_MESSAGE };
  }
};

export const fetchRoomsPayload = async (
  username: string | null
): Promise<{ ok: true; rooms: ChatRoom[] } | { ok: false; error: string }> => {
  const result = await runGuardedPayloadFlow<{ rooms?: ChatRoom[] }, ChatRoom[]>({
    endpointKey: CHAT_ENDPOINT_KEYS.ROOMS,
    endpointUnavailableError: CHAT_PAYLOAD_UNAVAILABLE_ERRORS.ROOMS_TEMPORARY,
    request: () => fetchRoomsRequest(username),
    errorContext: "fetchRooms error response",
    successContext: "fetchRooms success response",
    fallbackHttpError: FETCH_ROOMS_FAILED_ERROR,
    successWarningKey: CHAT_PAYLOAD_WARNING_KEYS.ROOMS,
    successUnavailableError: CHAT_PAYLOAD_UNAVAILABLE_ERRORS.ROOMS_UNAVAILABLE,
    extractValue: (body) => (Array.isArray(body.rooms) ? body.rooms : null),
  });

  if (result.ok) {
    return { ok: true, rooms: result.value };
  }
  return result;
};

export const fetchRoomMessagesPayload = async (
  roomId: string
): Promise<
  { ok: true; messages: ApiChatMessagePayload[] } | { ok: false; error: string }
> => {
  const result = await runGuardedPayloadFlow<
    { messages?: ApiChatMessagePayload[] },
    ApiChatMessagePayload[]
  >({
    endpointKey: CHAT_ENDPOINT_KEYS.ROOM_MESSAGES,
    endpointUnavailableError:
      CHAT_PAYLOAD_UNAVAILABLE_ERRORS.ROOM_MESSAGES_TEMPORARY,
    request: () => fetchRoomMessagesRequest(roomId),
    errorContext: "fetchMessagesForRoom error response",
    successContext: "fetchMessagesForRoom success response",
    fallbackHttpError: FETCH_MESSAGES_FAILED_ERROR,
    successWarningKey: CHAT_PAYLOAD_WARNING_KEYS.ROOM_MESSAGES,
    successUnavailableError:
      CHAT_PAYLOAD_UNAVAILABLE_ERRORS.ROOM_MESSAGES_UNAVAILABLE,
    extractValue: (body) => (Array.isArray(body.messages) ? body.messages : null),
  });

  if (result.ok) {
    return { ok: true, messages: result.value };
  }
  return result;
};

export const fetchBulkMessagesPayload = async (
  roomIds: string[]
): Promise<
  | { ok: true; messagesMap: Record<string, ApiChatMessagePayload[]> }
  | { ok: false; error: string }
> => {
  const result = await runGuardedPayloadFlow<
    { messagesMap?: Record<string, ApiChatMessagePayload[]> },
    Record<string, ApiChatMessagePayload[]>
  >({
    endpointKey: CHAT_ENDPOINT_KEYS.BULK_MESSAGES,
    endpointUnavailableError:
      CHAT_PAYLOAD_UNAVAILABLE_ERRORS.BULK_MESSAGES_TEMPORARY,
    request: () => fetchBulkMessagesRequest(roomIds),
    errorContext: "fetchBulkMessages error response",
    successContext: "fetchBulkMessages success response",
    fallbackHttpError: FETCH_MESSAGES_FAILED_ERROR,
    successWarningKey: CHAT_PAYLOAD_WARNING_KEYS.BULK_MESSAGES,
    successUnavailableError:
      CHAT_PAYLOAD_UNAVAILABLE_ERRORS.BULK_MESSAGES_UNAVAILABLE,
    extractValue: (body) =>
      body.messagesMap && typeof body.messagesMap === "object"
        ? body.messagesMap
        : null,
  });

  if (result.ok) {
    return { ok: true, messagesMap: result.value };
  }
  return result;
};

// ─────────────────────────────────────────────────────────────────────────────
// Grouped helper exports for store consumption
// ─────────────────────────────────────────────────────────────────────────────
export const chatsStoreAuthHelpers = {
  buildPostLogoutState,
  checkAndRefreshTokenFlow,
  clearChatRecoveryStorage,
  notifyServerOnLogout,
  refreshAuthTokenForUser,
  runCheckHasPasswordFlow,
  runCreateUserFlow,
  runSetPasswordFlow,
  schedulePasswordStatusCheck,
  shouldCheckPasswordStatus,
  trackLogoutAnalytics,
} as const;

export const chatsStorePersistenceHelpers = {
  createChatsOnRehydrateStorage,
  ensureRecoveryKeysAreSet,
  getAuthTokenFromRecovery,
  getTokenRefreshTime,
  getUsernameFromRecovery,
  migrateChatsPersistedState,
  saveAuthTokenToRecovery,
  saveTokenRefreshTime,
  saveUsernameToRecovery,
  TOKEN_REFRESH_THRESHOLD,
} as const;

export const chatsStoreRoomHelpers = {
  buildPersistedRoomMessages,
  clearRoomMessagesInMap,
  clearUnreadCount,
  fetchBulkMessagesPayload,
  fetchRoomMessagesPayload,
  fetchRoomsPayload,
  incrementUnreadCount,
  logIfNetworkResultError,
  mergeFetchedBulkMessages,
  mergeFetchedMessagesForRoom,
  mergeIncomingRoomMessageInMap,
  prepareRoomsForSet,
  removeRoomMessageFromMap,
  resolveNextFontSize,
  sanitizeMessageRenderLimit,
  runCreateRoomFlow,
  runDeleteRoomFlow,
  runSendMessageFlow,
  setCurrentRoomMessagesInMap,
  syncPresenceOnRoomSwitch,
  toggleBoolean,
} as const;
