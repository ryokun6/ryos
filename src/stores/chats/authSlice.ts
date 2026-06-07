import { APP_ANALYTICS, getTextAnalytics, track } from "@/utils/analytics";
import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";
import type { ChatsStoreDataSnapshot, ChatsStoreState } from "./types";
import {
  USERNAME_RECOVERY_KEY,
  clearLegacyTokenRecovery,
  saveUsernameToRecovery,
} from "./shared";
import { getInitialAiMessage } from "./aiSlice";

type ChatsGet = () => ChatsStoreState;
type ChatsSet = (
  partial:
    | Partial<ChatsStoreState>
    | ((state: ChatsStoreState) => Partial<ChatsStoreState>)
) => void;

/** Wired from `index.ts` after `useChatsStore` is created — avoids circular imports. */
export const chatsStoreApiRef: {
  getState: null | (() => ChatsStoreState);
  setState: null | ((partial: Partial<ChatsStoreState>) => void);
} = {
  getState: null,
  setState: null,
};

/**
 * Clear auth state without making API calls (which could 401 again).
 * Used when an authenticated request + refresh both fail with 401,
 * indicating the session is definitively invalid.
 */
export function forceLogoutOnUnauthorized() {
  const getState = chatsStoreApiRef.getState;
  const setState = chatsStoreApiRef.setState;
  if (!getState || !setState) return;
  const store = getState();
  if (!store.username) return;
  console.log("[ChatsStore] Unauthorized — clearing auth state for", store.username);
  localStorage.removeItem(USERNAME_RECOVERY_KEY);
  clearLegacyTokenRecovery();
  setState({
    username: null,
    isAuthenticated: false,
    hasPassword: null,
    currentRoomId: null,
  });
}

export function createAuthSlice(
  set: ChatsSet,
  get: ChatsGet,
  getInitialState: () => ChatsStoreDataSnapshot
): Pick<
  ChatsStoreState,
  | "setUsername"
  | "setAuthenticated"
  | "setHasPassword"
  | "checkHasPassword"
  | "setPassword"
  | "createUser"
  | "logout"
  | "reset"
> {
  return {
    setUsername: (username) => {
      saveUsernameToRecovery(username);
      set({ username });

      // Re-filter rooms: drop private rooms the new identity cannot see.
      // IRC rooms remain visible to everyone.
      const lowerUser = username?.toLowerCase() ?? null;
      const currentRooms = get().rooms;
      if (currentRooms.length > 0) {
        const filtered = currentRooms.filter((room) => {
          if (!room.type || room.type === "public" || room.type === "irc")
            return true;
          if (!lowerUser) return false;
          return Array.isArray(room.members) && room.members.includes(lowerUser);
        });
        if (filtered.length !== currentRooms.length) {
          set({ rooms: filtered });
        }
      }

      if (username) {
        setTimeout(() => {
          get().checkHasPassword();
        }, 100);
      } else {
        set({ hasPassword: null });
      }
    },
    setAuthenticated: (authenticated) => {
      set({ isAuthenticated: authenticated });
    },
    setHasPassword: (hasPassword) => {
      set({ hasPassword });
    },
    checkHasPassword: async () => {
      const currentUsername = get().username;

      if (!currentUsername) {
        set({ hasPassword: null });
        return { ok: false, error: "Authentication required" };
      }

      try {
        const response = await abortableFetch(
          "/api/auth/password/check",
          {
            method: "GET",
            timeout: 15000,
            throwOnHttpError: false,
            retry: { maxAttempts: 1, initialDelayMs: 250 },
          }
        );

        if (response.ok) {
          const data = await response.json();
          set({ hasPassword: data.hasPassword });
          return { ok: true };
        } else {
          set({ hasPassword: null });
          return { ok: false, error: "Failed to check password status" };
        }
      } catch (error) {
        console.error(
          "[ChatsStore] Error checking password status:",
          error
        );
        set({ hasPassword: null });
        return {
          ok: false,
          error: "Network error while checking password",
        };
      }
    },
    setPassword: async (password, currentPassword) => {
      const currentUsername = get().username;

      if (!currentUsername) {
        return { ok: false, error: "Authentication required" };
      }

      try {
        const payload: { password: string; currentPassword?: string } = {
          password,
        };
        if (typeof currentPassword === "string" && currentPassword.length > 0) {
          payload.currentPassword = currentPassword;
        }

        const response = await abortableFetch(
          getApiUrl("/api/auth/password/set"),
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
            timeout: 15000,
            throwOnHttpError: false,
            retry: { maxAttempts: 1, initialDelayMs: 250 },
          }
        );

        if (!response.ok) {
          const data = await response.json();
          return {
            ok: false,
            error: data.error || "Failed to set password",
          };
        }

        // Update local state to reflect password has been set
        set({ hasPassword: true });
        return { ok: true };
      } catch (error) {
        console.error("[ChatsStore] Error setting password:", error);
        return { ok: false, error: "Network error while setting password" };
      }
    },
    reset: () => {
      const currentUsername = get().username;
      if (currentUsername) {
        saveUsernameToRecovery(currentUsername);
      }
      set(getInitialState());
    },
    logout: async () => {
      console.log("[ChatsStore] Logging out user...");

      const currentUsername = get().username;

      if (currentUsername) {
        try {
          await abortableFetch(getApiUrl("/api/auth/logout"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            timeout: 15000,
            throwOnHttpError: false,
            retry: { maxAttempts: 1, initialDelayMs: 250 },
          });
        } catch (err) {
          console.warn(
            "[ChatsStore] Failed to notify server during logout:",
            err
          );
        }
      }

      if (currentUsername) {
        track(APP_ANALYTICS.USER_LOGOUT, { username: currentUsername });
      }

      localStorage.removeItem(USERNAME_RECOVERY_KEY);
      clearLegacyTokenRecovery();

      set((state) => ({
        ...state,
        aiMessages: [getInitialAiMessage()],
        username: null,
        isAuthenticated: false,
        hasPassword: null,
        currentRoomId: null,
        rooms: [],
        roomMessages: {},
        unreadCounts: {},
      }));

      try {
        await get().fetchRooms();
      } catch (error) {
        console.error(
          "[ChatsStore] Error refreshing rooms after logout:",
          error
        );
      }

      console.log("[ChatsStore] User logged out successfully");
    },
    createUser: async (username: string, password: string) => {
      const trimmedUsername = username.trim();
      if (!trimmedUsername) {
        return { ok: false, error: "Username cannot be empty" };
      }

      // Client-side validation mirroring server rules to provide instant feedback
      const isValid = /^[a-z](?:[a-z0-9]|[-_](?=[a-z0-9])){2,29}$/i.test(
        trimmedUsername
      );
      if (!isValid) {
        return {
          ok: false,
          error:
            "Invalid username: use 3-30 letters/numbers; '-' or '_' allowed between characters; no spaces or symbols",
        };
      }

      // Require password client-side and enforce minimum length consistent with server
      if (!password || password.trim().length === 0) {
        return { ok: false, error: "Password is required" };
      }
      const PASSWORD_MIN_LENGTH = 8; // Keep in sync with server
      if (password.length < PASSWORD_MIN_LENGTH) {
        return {
          ok: false,
          error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
        };
      }

      try {
        const response = await abortableFetch(
          getApiUrl("/api/auth/register"),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username: trimmedUsername, password }),
            timeout: 15000,
            throwOnHttpError: false,
            retry: { maxAttempts: 1, initialDelayMs: 250 },
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({
            error: `HTTP error! status: ${response.status}`,
          }));
          return {
            ok: false,
            error: errorData.error || "Failed to create user",
          };
        }

        const data = await response.json();
        if (data.user) {
          set({ username: data.user.username, isAuthenticated: true });

          setTimeout(() => {
            get().checkHasPassword();
          }, 100);

          track(APP_ANALYTICS.USER_CREATE, { username: data.user.username });

          return { ok: true };
        }

        return { ok: false, error: "Invalid response format" };
      } catch (error) {
        console.error("[ChatsStore] Error creating user:", error);
        return { ok: false, error: "Network error. Please try again." };
      }
    },
  };
}
