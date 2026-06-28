import { create } from "zustand";
import {
  checkUserPassword,
  deleteAccount as deleteAccountApi,
  getAuthSession,
  loginWithPassword,
  logoutUserSafe,
  registerUser,
  setUserPassword,
  verifyAuthToken,
} from "@/api/auth";
import { ApiRequestError } from "@/api/core";
import { runSessionTeardown } from "@/auth/sessionBoundary";
import { APP_ANALYTICS, track } from "@/utils/analytics";
import { createClientLogger } from "@/utils/logger";
import { PASSWORD_MIN_LENGTH, USERNAME_REGEX } from "@/shared/validation";
import { deleteSyncClientState } from "@/sync/state";

const USERNAME_RECOVERY_KEY = "_usr_recovery_key_";
const authLog = createClientLogger("AuthStore");

export type AuthResult = { ok: boolean; error?: string };

export interface AuthStoreState {
  username: string | null;
  isAuthenticated: boolean;
  hasPassword: boolean | null;
  isRestoringSession: boolean;
  setUsername: (username: string | null) => void;
  setAuthenticated: (authenticated: boolean) => void;
  setHasPassword: (hasPassword: boolean | null) => void;
  restoreSession: () => Promise<AuthResult>;
  login: (params: { username: string; password: string }) => Promise<AuthResult>;
  loginWithToken: (params: { username: string; token: string }) => Promise<AuthResult>;
  register: (params: { username: string; password: string }) => Promise<AuthResult>;
  checkHasPassword: () => Promise<AuthResult>;
  setPassword: (password: string, currentPassword?: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
  deleteAccount: (params: {
    confirmUsername: string;
    currentPassword?: string;
  }) => Promise<AuthResult>;
  handleUnauthorized: () => Promise<void>;
}

function readRecoveredUsername(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(USERNAME_RECOVERY_KEY);
}

function persistRecoveredUsername(username: string | null): void {
  if (typeof localStorage === "undefined") return;
  if (username) {
    localStorage.setItem(USERNAME_RECOVERY_KEY, username);
  } else {
    localStorage.removeItem(USERNAME_RECOVERY_KEY);
  }
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError ? error.message : fallback;
}

async function teardownLocalSession(
  username: string,
  reason: "logout" | "account-deleted" | "unauthorized"
): Promise<void> {
  try {
    const { destroyCloudSyncEngine } = await import("@/sync/engine");
    destroyCloudSyncEngine();
  } catch (error) {
    authLog.warn("Failed to stop Cloud Sync during session teardown:", error);
  }
  if (reason === "account-deleted") {
    deleteSyncClientState(username);
  }
  await runSessionTeardown({ username, reason });
}

let restorePromise: Promise<AuthResult> | null = null;
let authOperationVersion = 0;

export const useAuthStore = create<AuthStoreState>()((set, get) => ({
  username: readRecoveredUsername(),
  isAuthenticated: false,
  hasPassword: null,
  isRestoringSession: false,

  setUsername: (username) => {
    authOperationVersion += 1;
    persistRecoveredUsername(username);
    set({ username, hasPassword: username ? get().hasPassword : null });
  },
  setAuthenticated: (isAuthenticated) => {
    authOperationVersion += 1;
    set({ isAuthenticated });
  },
  setHasPassword: (hasPassword) => set({ hasPassword }),

  restoreSession: async () => {
    if (restorePromise) return restorePromise;
    const operationVersion = authOperationVersion;
    restorePromise = (async () => {
      set({ isRestoringSession: true });
      try {
        const session = await getAuthSession();
        if (operationVersion !== authOperationVersion) {
          return { ok: false, error: "Session restore superseded" };
        }
        if (!session.ok) {
          if (session.status === 401 || session.status === 403) {
            await get().handleUnauthorized();
          }
          return { ok: false, error: `Session restore failed (${session.status})` };
        }
        if (!session.data.authenticated || !session.data.username) {
          await get().handleUnauthorized();
          return { ok: false, error: "No authenticated session" };
        }

        persistRecoveredUsername(session.data.username);
        set({
          username: session.data.username,
          isAuthenticated: true,
          hasPassword: null,
        });
        void get().checkHasPassword();
        return { ok: true };
      } catch (error) {
        authLog.warn("Session restore request failed:", error);
        return { ok: false, error: "Network error while restoring session" };
      } finally {
        set({ isRestoringSession: false });
        restorePromise = null;
      }
    })();
    return restorePromise;
  },

  login: async ({ username, password }) => {
    const operationVersion = ++authOperationVersion;
    try {
      const result = await loginWithPassword({ username, password });
      if (operationVersion !== authOperationVersion) {
        return { ok: false, error: "Login superseded" };
      }
      if (!result.username) return { ok: false, error: "Invalid response format" };
      const previousUsername = get().username;
      if (previousUsername && previousUsername !== result.username) {
        await teardownLocalSession(previousUsername, "logout");
      }
      persistRecoveredUsername(result.username);
      set({ username: result.username, isAuthenticated: true, hasPassword: true });
      track(APP_ANALYTICS.USER_LOGIN_PASSWORD, { username: result.username });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: errorMessage(error, "Network error while logging in") };
    }
  },

  loginWithToken: async ({ username, token }) => {
    const operationVersion = ++authOperationVersion;
    try {
      const result = await verifyAuthToken({ username, token });
      if (operationVersion !== authOperationVersion) {
        return { ok: false, error: "Login superseded" };
      }
      if (!result.valid || !result.username) {
        return { ok: false, error: "Invalid token" };
      }
      const previousUsername = get().username;
      if (previousUsername && previousUsername !== result.username) {
        await teardownLocalSession(previousUsername, "logout");
      }
      persistRecoveredUsername(result.username);
      set({ username: result.username, isAuthenticated: true, hasPassword: null });
      void get().checkHasPassword();
      track(APP_ANALYTICS.USER_LOGIN_TOKEN, { username: result.username });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: errorMessage(error, "Network error while verifying") };
    }
  },

  register: async ({ username, password }) => {
    const operationVersion = ++authOperationVersion;
    const trimmedUsername = username.trim();
    if (!trimmedUsername) return { ok: false, error: "Username cannot be empty" };
    if (!USERNAME_REGEX.test(trimmedUsername)) {
      return {
        ok: false,
        error:
          "Invalid username: use 3-30 letters/numbers; '-' or '_' allowed between characters; no spaces or symbols",
      };
    }
    if (!password.trim()) return { ok: false, error: "Password is required" };
    if (password.length < PASSWORD_MIN_LENGTH) {
      return {
        ok: false,
        error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
      };
    }

    try {
      const result = await registerUser({ username: trimmedUsername, password });
      if (operationVersion !== authOperationVersion) {
        return { ok: false, error: "Registration superseded" };
      }
      if (!result.user) return { ok: false, error: "Invalid response format" };
      const previousUsername = get().username;
      if (previousUsername && previousUsername !== result.user.username) {
        await teardownLocalSession(previousUsername, "logout");
      }
      persistRecoveredUsername(result.user.username);
      set({
        username: result.user.username,
        isAuthenticated: true,
        hasPassword: true,
      });
      track(APP_ANALYTICS.USER_CREATE, { username: result.user.username });
      return { ok: true };
    } catch (error) {
      authLog.error("Error creating user:", error);
      return { ok: false, error: errorMessage(error, "Network error. Please try again.") };
    }
  },

  checkHasPassword: async () => {
    const username = get().username;
    if (!username) {
      set({ hasPassword: null });
      return { ok: false, error: "Authentication required" };
    }
    try {
      const result = await checkUserPassword();
      if (get().username === username && get().isAuthenticated) {
        set({ hasPassword: result.hasPassword });
      }
      return { ok: true };
    } catch (error) {
      set({ hasPassword: null });
      return { ok: false, error: errorMessage(error, "Network error while checking password") };
    }
  },

  setPassword: async (password, currentPassword) => {
    const username = get().username;
    if (!username) return { ok: false, error: "Authentication required" };
    try {
      await setUserPassword({
        password,
        ...(currentPassword ? { currentPassword } : {}),
      });
      if (get().username === username && get().isAuthenticated) {
        set({ hasPassword: true });
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: errorMessage(error, "Network error while setting password") };
    }
  },

  logout: async () => {
    authOperationVersion += 1;
    const username = get().username;
    if (username) {
      await teardownLocalSession(username, "logout");
      await logoutUserSafe();
      track(APP_ANALYTICS.USER_LOGOUT, { username });
    }
    persistRecoveredUsername(null);
    set({ username: null, isAuthenticated: false, hasPassword: null });
  },

  deleteAccount: async ({ confirmUsername, currentPassword }) => {
    authOperationVersion += 1;
    const username = get().username;
    if (!username) return { ok: false, error: "Authentication required" };
    try {
      await deleteAccountApi({
        confirm: true,
        confirmUsername,
        ...(currentPassword ? { currentPassword } : {}),
      });
    } catch (error) {
      return { ok: false, error: errorMessage(error, "Network error while deleting account") };
    }
    track(APP_ANALYTICS.USER_LOGOUT, { username });
    await teardownLocalSession(username, "account-deleted");
    persistRecoveredUsername(null);
    set({ username: null, isAuthenticated: false, hasPassword: null });
    return { ok: true };
  },

  handleUnauthorized: async () => {
    authOperationVersion += 1;
    const username = get().username;
    if (username) await teardownLocalSession(username, "unauthorized");
    persistRecoveredUsername(null);
    set({ username: null, isAuthenticated: false, hasPassword: null });
  },
}));

if (typeof window !== "undefined" && useAuthStore.getState().username) {
  queueMicrotask(() => void useAuthStore.getState().restoreSession());
}
