import { isTauriIOS } from "@/utils/platform";
import { getPushToken } from "@/utils/tauriPushNotifications";

const PUSH_TOKEN_FORMAT_REGEX = /^[A-Za-z0-9:_\-.]{20,512}$/;

interface ResolvePushTokenForLogoutDeps {
  isTauriIOSRuntime: () => boolean;
  getPushTokenRuntime: () => Promise<string>;
  warn: (message: string, error?: unknown) => void;
}

const defaultDeps: ResolvePushTokenForLogoutDeps = {
  isTauriIOSRuntime: isTauriIOS,
  getPushTokenRuntime: getPushToken,
  warn: (message, error) => {
    console.warn(message, error);
  },
};

export async function resolvePushTokenForLogout(
  deps: ResolvePushTokenForLogoutDeps = defaultDeps
): Promise<string | null> {
  if (!deps.isTauriIOSRuntime()) {
    return null;
  }

  try {
    const token = await deps.getPushTokenRuntime();
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
