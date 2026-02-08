import { getApiUrl, isTauriIOS } from "@/utils/platform";
import { normalizePushToken } from "@/utils/pushToken";
import { getPushToken } from "@/utils/tauriPushNotifications";
export const PUSH_TOKEN_LOOKUP_TIMEOUT_MS = 3_000;
export const PUSH_UNREGISTER_TIMEOUT_MS = 3_000;

interface ResolvePushTokenForLogoutDeps {
  isTauriIOSRuntime: () => boolean;
  getPushTokenRuntime: () => Promise<string>;
  warn: (message: string, error?: unknown) => void;
  tokenLookupTimeoutMs?: number;
}

const defaultDeps: ResolvePushTokenForLogoutDeps = {
  isTauriIOSRuntime: isTauriIOS,
  getPushTokenRuntime: getPushToken,
  warn: (message, error) => {
    console.warn(message, error);
  },
  tokenLookupTimeoutMs: PUSH_TOKEN_LOOKUP_TIMEOUT_MS,
};

interface UnregisterPushTokenForLogoutDeps {
  fetchRuntime: typeof fetch;
  getApiUrlRuntime: (path: string) => string;
  warn: (message: string, error?: unknown) => void;
  requestTimeoutMs?: number;
}

const defaultUnregisterDeps: UnregisterPushTokenForLogoutDeps = {
  fetchRuntime: fetch,
  getApiUrlRuntime: getApiUrl,
  requestTimeoutMs: PUSH_UNREGISTER_TIMEOUT_MS,
  warn: (message, error) => {
    console.warn(message, error);
  },
};

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationLabel: string,
  onTimeout?: () => void
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  return new Promise<T>((resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      onTimeout?.();
      reject(new Error(`${operationLabel} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(resolve).catch(reject);
  }).finally(() => {
    if (typeof timeoutHandle !== "undefined") {
      clearTimeout(timeoutHandle);
    }
  });
}

export async function resolvePushTokenForLogout(
  deps: ResolvePushTokenForLogoutDeps = defaultDeps
): Promise<string | null> {
  if (!deps.isTauriIOSRuntime()) {
    return null;
  }

  try {
    const token = await withTimeout(
      deps.getPushTokenRuntime(),
      deps.tokenLookupTimeoutMs ?? PUSH_TOKEN_LOOKUP_TIMEOUT_MS,
      "Push token lookup"
    );
    const normalizedToken = normalizePushToken(token);
    if (!normalizedToken) {
      const normalizedLength =
        typeof token === "string" ? token.trim().length : 0;
      if (normalizedLength === 0) {
        return null;
      }
      deps.warn(
        "[ChatsStore] Ignoring invalid iOS push token during logout resolution:",
        { tokenLength: normalizedLength }
      );
      return null;
    }

    return normalizedToken;
  } catch (error) {
    deps.warn(
      "[ChatsStore] Could not resolve iOS push token during logout:",
      error
    );
    return null;
  }
}

/**
 * Best-effort token-scoped unregister for logout flows.
 * Does not throw on network/API failures to avoid blocking logout UX.
 */
export async function unregisterPushTokenForLogout(
  username: string,
  authToken: string,
  pushToken: string | null,
  deps: UnregisterPushTokenForLogoutDeps = defaultUnregisterDeps
): Promise<void> {
  const normalizedPushToken = normalizePushToken(pushToken);
  if (!normalizedPushToken) {
    const normalizedLength =
      typeof pushToken === "string" ? pushToken.trim().length : 0;
    if (normalizedLength === 0) {
      return;
    }
    deps.warn(
      "[ChatsStore] Skipping push unregister during logout due to invalid token format",
      { tokenLength: normalizedLength }
    );
    return;
  }

  const normalizedUsername = username.trim();
  const normalizedAuthToken = authToken.trim();
  if (!normalizedUsername || !normalizedAuthToken) {
    deps.warn(
      "[ChatsStore] Skipping push unregister during logout due to missing auth context"
    );
    return;
  }

  try {
    const abortController =
      typeof AbortController === "function" ? new AbortController() : null;
    const unregisterRequestInit: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${normalizedAuthToken}`,
        "X-Username": normalizedUsername,
      },
      body: JSON.stringify({ token: normalizedPushToken }),
    };
    if (abortController) {
      unregisterRequestInit.signal = abortController.signal;
    }

    const response = await withTimeout(
      deps.fetchRuntime(
        deps.getApiUrlRuntime("/api/push/unregister"),
        unregisterRequestInit
      ),
      deps.requestTimeoutMs ?? PUSH_UNREGISTER_TIMEOUT_MS,
      "Push token unregister request",
      () => {
        abortController?.abort();
      }
    );

    if (!response.ok) {
      deps.warn(
        "[ChatsStore] Push unregister during logout returned non-OK response:",
        { status: response.status }
      );
    }
  } catch (error) {
    deps.warn(
      "[ChatsStore] Failed to unregister iOS push token during logout:",
      error
    );
  }
}
