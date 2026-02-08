import { getApiUrl, isTauriIOS } from "@/utils/platform";
import { getPushToken } from "@/utils/tauriPushNotifications";

const PUSH_TOKEN_FORMAT_REGEX = /^[A-Za-z0-9:_\-.]{20,512}$/;
const PUSH_TOKEN_LOOKUP_TIMEOUT_MS = 3_000;

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
}

const defaultUnregisterDeps: UnregisterPushTokenForLogoutDeps = {
  fetchRuntime: fetch,
  getApiUrlRuntime: getApiUrl,
  warn: (message, error) => {
    console.warn(message, error);
  },
};

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  return new Promise<T>((resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Push token lookup timed out after ${timeoutMs}ms`));
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
      deps.tokenLookupTimeoutMs ?? PUSH_TOKEN_LOOKUP_TIMEOUT_MS
    );
    const normalizedToken = typeof token === "string" ? token.trim() : "";
    if (normalizedToken.length === 0) {
      return null;
    }

    if (!PUSH_TOKEN_FORMAT_REGEX.test(normalizedToken)) {
      deps.warn(
        "[ChatsStore] Ignoring invalid iOS push token during logout resolution:",
        { tokenLength: normalizedToken.length }
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

export async function unregisterPushTokenForLogout(
  username: string,
  authToken: string,
  pushToken: string | null,
  deps: UnregisterPushTokenForLogoutDeps = defaultUnregisterDeps
): Promise<void> {
  if (!pushToken) {
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
    const response = await deps.fetchRuntime(
      deps.getApiUrlRuntime("/api/push/unregister"),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${normalizedAuthToken}`,
          "X-Username": normalizedUsername,
        },
        body: JSON.stringify({ token: pushToken }),
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
