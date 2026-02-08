export const USERNAME_RECOVERY_KEY = "_usr_recovery_key_";
export const AUTH_TOKEN_RECOVERY_KEY = "_auth_recovery_key_";
export const TOKEN_REFRESH_THRESHOLD = 83 * 24 * 60 * 60 * 1000;
export const TOKEN_LAST_REFRESH_KEY = "_token_refresh_time_";

const encode = (value: string): string => {
  return btoa(value.split("").reverse().join(""));
};

const decode = (encoded: string): string | null => {
  try {
    return atob(encoded).split("").reverse().join("");
  } catch (error) {
    console.error("[ChatsStore] Failed to decode value:", error);
    return null;
  }
};

const encodeUsername = (username: string): string => encode(username);
const decodeUsername = (encoded: string): string | null => decode(encoded);

export const saveUsernameToRecovery = (username: string | null): void => {
  if (username) {
    localStorage.setItem(USERNAME_RECOVERY_KEY, encodeUsername(username));
  }
};

export const getUsernameFromRecovery = (): string | null => {
  const encoded = localStorage.getItem(USERNAME_RECOVERY_KEY);
  if (encoded) {
    return decodeUsername(encoded);
  }
  return null;
};

export const saveAuthTokenToRecovery = (token: string | null): void => {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_RECOVERY_KEY, encode(token));
  } else {
    localStorage.removeItem(AUTH_TOKEN_RECOVERY_KEY);
  }
};

export const getAuthTokenFromRecovery = (): string | null => {
  const encoded = localStorage.getItem(AUTH_TOKEN_RECOVERY_KEY);
  if (encoded) {
    return decode(encoded);
  }
  return null;
};

export const saveTokenRefreshTime = (username: string): void => {
  const key = `${TOKEN_LAST_REFRESH_KEY}${username}`;
  localStorage.setItem(key, Date.now().toString());
};

export const getTokenRefreshTime = (username: string): number | null => {
  const key = `${TOKEN_LAST_REFRESH_KEY}${username}`;
  const time = localStorage.getItem(key);
  return time ? parseInt(time, 10) : null;
};

export const ensureRecoveryKeysAreSet = (
  username: string | null,
  authToken: string | null
): void => {
  if (username && !localStorage.getItem(USERNAME_RECOVERY_KEY)) {
    console.log(
      "[ChatsStore] Setting recovery key for existing username:",
      username
    );
    saveUsernameToRecovery(username);
  }
  if (authToken && !localStorage.getItem(AUTH_TOKEN_RECOVERY_KEY)) {
    console.log("[ChatsStore] Setting recovery key for existing auth token");
    saveAuthTokenToRecovery(authToken);
  }
};
