import { isTauriIOS } from "@/utils/platform";
import { getPushToken } from "@/utils/tauriPushNotifications";

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
    return normalizedToken.length > 0 ? normalizedToken : null;
  } catch (error) {
    deps.warn(
      "[ChatsStore] Could not resolve iOS push token during logout:",
      error
    );
    return null;
  }
}
