import { track } from "@vercel/analytics";
import { APP_ANALYTICS } from "@/utils/analytics";
import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";
import {
  clearRecoveryKeys,
  clearTokenRefreshTime,
  getTokenRefreshTime,
  saveAuthTokenToRecovery,
  saveTokenRefreshTime,
  saveUsernameToRecovery,
  TOKEN_REFRESH_THRESHOLD,
} from "../repository/recovery";
import { getInitialAiMessage, getInitialState } from "../state";
import type { ChatsStoreGet, ChatsStoreSet, ChatsStoreState } from "../types";

type AuthSlice = Pick<
  ChatsStoreState,
  | "setUsername"
  | "setAuthToken"
  | "setHasPassword"
  | "checkHasPassword"
  | "setPassword"
  | "ensureAuthToken"
  | "refreshAuthToken"
  | "checkAndRefreshTokenIfNeeded"
  | "createUser"
  | "reset"
  | "logout"
>;

export const createAuthSlice = (set: ChatsStoreSet, get: ChatsStoreGet): AuthSlice => ({
  setUsername: (username) => {
    saveUsernameToRecovery(username);
    set({ username });

    const currentToken = get().authToken;
    if (username && currentToken) {
      setTimeout(() => {
        get().checkHasPassword();
      }, 100);
    } else if (!username) {
      set({ hasPassword: null });
    }
  },
  setAuthToken: (token) => {
    saveAuthTokenToRecovery(token);
    set({ authToken: token });

    const currentUsername = get().username;
    if (token && currentUsername) {
      setTimeout(() => {
        get().checkHasPassword();
      }, 100);
    } else if (!token) {
      set({ hasPassword: null });
    }
  },
  setHasPassword: (hasPassword) => {
    set({ hasPassword });
  },
  checkHasPassword: async () => {
    const currentUsername = get().username;
    const currentToken = get().authToken;

    if (!currentUsername || !currentToken) {
      console.log(
        "[ChatsStore] checkHasPassword: No username or token, setting null"
      );
      set({ hasPassword: null });
      return { ok: false, error: "Authentication required" };
    }

    console.log(
      "[ChatsStore] checkHasPassword: Checking for user",
      currentUsername
    );
    try {
      const response = await abortableFetch("/api/auth/password/check", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${currentToken}`,
          "X-Username": currentUsername,
        },
        timeout: 15000,
        throwOnHttpError: false,
        retry: { maxAttempts: 1, initialDelayMs: 250 },
      });

      console.log(
        "[ChatsStore] checkHasPassword: Response status",
        response.status
      );
      if (response.ok) {
        const data = await response.json();
        console.log("[ChatsStore] checkHasPassword: Result", data);
        set({ hasPassword: data.hasPassword });
        return { ok: true };
      } else {
        console.log(
          "[ChatsStore] checkHasPassword: Failed with status",
          response.status
        );
        set({ hasPassword: null });
        return { ok: false, error: "Failed to check password status" };
      }
    } catch (error) {
      console.error("[ChatsStore] Error checking password status:", error);
      set({ hasPassword: null });
      return { ok: false, error: "Network error while checking password" };
    }
  },
  setPassword: async (password) => {
    const currentUsername = get().username;
    const currentToken = get().authToken;

    if (!currentUsername || !currentToken) {
      return { ok: false, error: "Authentication required" };
    }

    try {
      const response = await abortableFetch(getApiUrl("/api/auth/password/set"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentToken}`,
          "X-Username": currentUsername,
        },
        body: JSON.stringify({ password }),
        timeout: 15000,
        throwOnHttpError: false,
        retry: { maxAttempts: 1, initialDelayMs: 250 },
      });

      if (!response.ok) {
        const data = await response.json();
        return {
          ok: false,
          error: data.error || "Failed to set password",
        };
      }

      set({ hasPassword: true });
      return { ok: true };
    } catch (error) {
      console.error("[ChatsStore] Error setting password:", error);
      return { ok: false, error: "Network error while setting password" };
    }
  },
  ensureAuthToken: async () => {
    const currentUsername = get().username;
    const currentToken = get().authToken;

    if (!currentUsername) {
      console.log("[ChatsStore] No username set, skipping token generation");
      return { ok: true };
    }

    if (currentToken) {
      console.log(
        "[ChatsStore] Auth token already exists for user:",
        currentUsername
      );
      return { ok: true };
    }

    console.log(
      "[ChatsStore] Generating auth token for existing user:",
      currentUsername
    );
    console.warn(
      "[ChatsStore] User has username but no token - requires re-authentication:",
      currentUsername
    );
    return { ok: false, error: "Please log in again to continue" };
  },
  refreshAuthToken: async () => {
    const currentUsername = get().username;
    const currentToken = get().authToken;

    if (!currentUsername) {
      console.log("[ChatsStore] No username set, skipping token refresh");
      return { ok: false, error: "Username required" };
    }

    if (!currentToken) {
      console.log("[ChatsStore] No auth token set, skipping token refresh");
      return { ok: false, error: "Auth token required" };
    }

    console.log(
      "[ChatsStore] Refreshing auth token for existing user:",
      currentUsername
    );

    try {
      const response = await abortableFetch("/api/auth/token/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: currentUsername,
          oldToken: currentToken,
        }),
        timeout: 15000,
        throwOnHttpError: false,
        retry: { maxAttempts: 1, initialDelayMs: 250 },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: `HTTP error! status: ${response.status}`,
        }));
        console.error("[ChatsStore] Error refreshing token:", errorData);
        return {
          ok: false,
          error: errorData.error || "Failed to refresh token",
        };
      }

      const data = await response.json();
      if (data.token) {
        console.log("[ChatsStore] Auth token refreshed successfully");
        set({ authToken: data.token });
        saveAuthTokenToRecovery(data.token);
        saveTokenRefreshTime(currentUsername);
        return { ok: true, token: data.token };
      } else {
        console.error("[ChatsStore] Invalid response format for token refresh");
        return {
          ok: false,
          error: "Invalid response format for token refresh",
        };
      }
    } catch (error) {
      console.error("[ChatsStore] Error refreshing token:", error);
      return { ok: false, error: "Network error while refreshing token" };
    }
  },
  checkAndRefreshTokenIfNeeded: async () => {
    const currentUsername = get().username;
    const currentToken = get().authToken;

    if (!currentUsername || !currentToken) {
      console.log(
        "[ChatsStore] No username or auth token set, skipping token check"
      );
      return { refreshed: false };
    }

    const lastRefreshTime = getTokenRefreshTime(currentUsername);

    if (!lastRefreshTime) {
      console.log("[ChatsStore] No refresh time found, recording current time");
      saveTokenRefreshTime(currentUsername);
      return { refreshed: false };
    }

    const tokenAge = Date.now() - lastRefreshTime;
    const tokenAgeDays = Math.floor(tokenAge / (24 * 60 * 60 * 1000));

    console.log(`[ChatsStore] Token age: ${tokenAgeDays} days`);

    if (tokenAge > TOKEN_REFRESH_THRESHOLD) {
      console.log(
        `[ChatsStore] Token is ${tokenAgeDays} days old (refresh due - 7 days before 90-day expiry), refreshing...`
      );

      const refreshResult = await get().refreshAuthToken();

      if (refreshResult.ok) {
        saveTokenRefreshTime(currentUsername);
        console.log(
          "[ChatsStore] Token refreshed automatically (7 days before expiry)"
        );
        return { refreshed: true };
      } else {
        console.error(
          "[ChatsStore] Failed to refresh token (will retry next hour):",
          refreshResult.error
        );
        return { refreshed: false };
      }
    } else {
      console.log(
        `[ChatsStore] Token is ${tokenAgeDays} days old, next refresh in ${
          83 - tokenAgeDays
        } days`
      );
      return { refreshed: false };
    }
  },
  createUser: async (username: string, password: string) => {
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      return { ok: false, error: "Username cannot be empty" };
    }

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

    if (!password || password.trim().length === 0) {
      return { ok: false, error: "Password is required" };
    }
    const PASSWORD_MIN_LENGTH = 8;
    if (password.length < PASSWORD_MIN_LENGTH) {
      return {
        ok: false,
        error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
      };
    }

    try {
      const response = await abortableFetch(getApiUrl("/api/auth/register"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmedUsername, password }),
        timeout: 15000,
        throwOnHttpError: false,
        retry: { maxAttempts: 1, initialDelayMs: 250 },
      });

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
        set({ username: data.user.username });

        if (data.token) {
          set({ authToken: data.token });
          saveAuthTokenToRecovery(data.token);
          saveTokenRefreshTime(data.user.username);
        }

        if (data.token) {
          setTimeout(() => {
            get().checkHasPassword();
          }, 100);
        }

        track(APP_ANALYTICS.USER_CREATE, { username: data.user.username });

        return { ok: true };
      }

      return { ok: false, error: "Invalid response format" };
    } catch (error) {
      console.error("[ChatsStore] Error creating user:", error);
      return { ok: false, error: "Network error. Please try again." };
    }
  },
  reset: () => {
    const currentUsername = get().username;
    const currentAuthToken = get().authToken;
    if (currentUsername) {
      saveUsernameToRecovery(currentUsername);
    }
    if (currentAuthToken) {
      saveAuthTokenToRecovery(currentAuthToken);
    }

    set(getInitialState());
  },
  logout: async () => {
    console.log("[ChatsStore] Logging out user...");

    const currentUsername = get().username;
    const currentToken = get().authToken;

    if (currentUsername && currentToken) {
      try {
        await abortableFetch(getApiUrl("/api/auth/logout"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${currentToken}`,
            "X-Username": currentUsername,
          },
          timeout: 15000,
          throwOnHttpError: false,
          retry: { maxAttempts: 1, initialDelayMs: 250 },
        });
      } catch (err) {
        console.warn("[ChatsStore] Failed to notify server during logout:", err);
      }
    }

    if (currentUsername) {
      track(APP_ANALYTICS.USER_LOGOUT, { username: currentUsername });
    }

    clearRecoveryKeys();
    if (currentUsername) {
      clearTokenRefreshTime(currentUsername);
    }

    set((state) => ({
      ...state,
      aiMessages: [getInitialAiMessage()],
      username: null,
      authToken: null,
      hasPassword: null,
      currentRoomId: null,
    }));

    try {
      await get().fetchRooms();
    } catch (error) {
      console.error("[ChatsStore] Error refreshing rooms after logout:", error);
    }

    console.log("[ChatsStore] User logged out successfully");
  },
});
