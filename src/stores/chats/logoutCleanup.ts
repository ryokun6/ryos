import {
  AUTH_TOKEN_RECOVERY_KEY,
  TOKEN_LAST_REFRESH_KEY,
  USERNAME_RECOVERY_KEY,
} from "./recovery";

export const clearChatRecoveryStorage = (
  username: string | null
): void => {
  localStorage.removeItem(USERNAME_RECOVERY_KEY);
  localStorage.removeItem(AUTH_TOKEN_RECOVERY_KEY);

  if (username) {
    const tokenRefreshKey = `${TOKEN_LAST_REFRESH_KEY}${username}`;
    localStorage.removeItem(tokenRefreshKey);
  }
};
