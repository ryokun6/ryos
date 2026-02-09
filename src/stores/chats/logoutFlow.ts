import type { AIChatMessage } from "@/types/chat";
import { APP_ANALYTICS } from "@/utils/analytics";
import { track } from "@vercel/analytics";
import { logoutRequest } from "./authApi";

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
