import { abortableFetch } from "@/utils/abortableFetch";

const warnedStoreIssues = new Set<string>();
export const warnChatsStoreOnce = (key: string, message: string): void => {
  if (warnedStoreIssues.has(key)) {
    return;
  }
  warnedStoreIssues.add(key);
  console.warn(message);
};

export const API_UNAVAILABLE_COOLDOWN_MS = 10_000;
const apiUnavailableUntil: Record<string, number> = {};

export const isApiTemporarilyUnavailable = (key: string): boolean =>
  Date.now() < (apiUnavailableUntil[key] || 0);

export const markApiTemporarilyUnavailable = (key: string): void => {
  apiUnavailableUntil[key] = Date.now() + API_UNAVAILABLE_COOLDOWN_MS;
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

export const makeAuthenticatedRequest = async (
  url: string,
  options: RequestInit,
  refreshToken: () => Promise<{ ok: boolean; error?: string; token?: string }>
): Promise<Response> => {
  const initialResponse = await abortableFetch(url, {
    ...options,
    timeout: 15000,
    throwOnHttpError: false,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });

  if (
    initialResponse.status !== 401 ||
    !options.headers ||
    !("Authorization" in options.headers)
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

  const newHeaders = {
    ...options.headers,
    Authorization: `Bearer ${refreshResult.token}`,
  };

  console.log("[ChatsStore] Retrying request with refreshed token");
  return abortableFetch(url, {
    ...options,
    headers: newHeaders,
    timeout: 15000,
    throwOnHttpError: false,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
};
