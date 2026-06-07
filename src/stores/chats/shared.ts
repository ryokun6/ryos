import type { ChatMessage } from "@/types/chat";

// Username recovery - plain text, username is public info
export const USERNAME_RECOVERY_KEY = "_usr_recovery_key_";
// Legacy key kept only so we can clean it up during migration
export const LEGACY_AUTH_TOKEN_RECOVERY_KEY = "_auth_recovery_key_";

const MESSAGE_HISTORY_CAP = 500;

export const capRoomMessages = (messages: ChatMessage[]): ChatMessage[] =>
  messages.slice(-MESSAGE_HISTORY_CAP);

// API Response Types
export interface ApiMessage {
  id: string;
  roomId: string;
  username: string;
  content: string;
  timestamp: string | number;
}

// Username recovery: plain-text localStorage (username is not secret)
export const saveUsernameToRecovery = (username: string | null) => {
  if (username) {
    localStorage.setItem(USERNAME_RECOVERY_KEY, username);
  }
};

export const getUsernameFromRecovery = (): string | null => {
  const raw = localStorage.getItem(USERNAME_RECOVERY_KEY);
  if (!raw) return null;
  // Attempt to decode legacy btoa-encoded values
  try {
    const maybeDecoded = atob(raw).split("").reverse().join("");
    if (/^[a-z0-9_-]+$/i.test(maybeDecoded)) return maybeDecoded;
  } catch {
    // Not base64 — treat as plain-text
  }
  return raw;
};

/**
 * Remove any legacy auth-token recovery data from localStorage.
 * Auth tokens are now stored exclusively in httpOnly cookies.
 */
export const clearLegacyTokenRecovery = () => {
  localStorage.removeItem(LEGACY_AUTH_TOKEN_RECOVERY_KEY);
};

/**
 * Read (and consume) a legacy btoa-encoded auth token from localStorage.
 * Returns the plain-text token if one existed, or null.
 */
export const consumeLegacyAuthToken = (): string | null => {
  const encoded = localStorage.getItem(LEGACY_AUTH_TOKEN_RECOVERY_KEY);
  if (!encoded) return null;
  localStorage.removeItem(LEGACY_AUTH_TOKEN_RECOVERY_KEY);
  try {
    return atob(encoded).split("").reverse().join("");
  } catch {
    return null;
  }
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

// Ensure username recovery key is set if username exists but recovery key doesn't.
// NOTE: Do NOT call clearLegacyTokenRecovery() here — this runs during store
// initialization (before rehydration) and would destroy the legacy token before
// onRehydrateStorage can consume it for migration.
export const ensureUsernameRecovery = (username: string | null) => {
  if (username && !localStorage.getItem(USERNAME_RECOVERY_KEY)) {
    console.log(
      "[ChatsStore] Setting recovery key for existing username:",
      username
    );
    saveUsernameToRecovery(username);
  }
};
