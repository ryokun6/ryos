export type ChatRetryConfig = {
  maxAttempts: number;
  initialDelayMs: number;
};

export type ChatRequestOptions = RequestInit & {
  timeout?: number;
  throwOnHttpError?: boolean;
  retry?: ChatRetryConfig;
};

const DEFAULT_CHAT_RETRY: ChatRetryConfig = {
  maxAttempts: 1,
  initialDelayMs: 250,
};

export const withChatRequestDefaults = (
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

export interface ErrorResponseBody {
  error: string;
}

export const readErrorResponseBody = async (
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

const warnedStoreIssues = new Set<string>();

export const warnChatsStoreOnce = (key: string, message: string): void => {
  if (warnedStoreIssues.has(key)) {
    return;
  }
  warnedStoreIssues.add(key);
  console.warn(message);
};

export const CHAT_API_UNAVAILABLE_COOLDOWN_MS = 10_000;
const apiUnavailableUntil: Record<string, number> = {};

export const isApiTemporarilyUnavailable = (key: string): boolean =>
  Date.now() < (apiUnavailableUntil[key] || 0);

export const markApiTemporarilyUnavailable = (key: string): void => {
  apiUnavailableUntil[key] = Date.now() + CHAT_API_UNAVAILABLE_COOLDOWN_MS;
};

export const clearApiUnavailable = (key: string): void => {
  delete apiUnavailableUntil[key];
};

export const readJsonBody = async <T>(
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
