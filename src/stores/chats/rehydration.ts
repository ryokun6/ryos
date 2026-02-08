import { LEGACY_CHAT_STORAGE_KEYS } from "./legacyStorage";
import {
  ensureRecoveryKeysAreSet,
  getAuthTokenFromRecovery,
  getUsernameFromRecovery,
  saveUsernameToRecovery,
} from "./recovery";

interface RehydratableIdentityState {
  username: string | null;
  authToken: string | null;
}

export const applyIdentityRecoveryOnRehydrate = (
  state: RehydratableIdentityState
): void => {
  if (state.username === null) {
    const recoveredUsername = getUsernameFromRecovery();
    if (recoveredUsername) {
      console.log(
        `[ChatsStore] Found encoded username '${recoveredUsername}' in recovery storage. Applying.`
      );
      state.username = recoveredUsername;
    } else {
      const oldUsernameKey = LEGACY_CHAT_STORAGE_KEYS.USERNAME;
      const oldUsername = localStorage.getItem(oldUsernameKey);
      if (oldUsername) {
        console.log(
          `[ChatsStore] Found old username '${oldUsername}' in localStorage during rehydration check. Applying.`
        );
        state.username = oldUsername;
        saveUsernameToRecovery(oldUsername);
        localStorage.removeItem(oldUsernameKey);
        console.log(
          `[ChatsStore] Removed old key '${oldUsernameKey}' after rehydration fix.`
        );
      } else {
        console.log(
          "[ChatsStore] Username is null, but no username found in recovery or old localStorage during rehydration check."
        );
      }
    }
  }

  if (state.authToken === null) {
    const recoveredAuthToken = getAuthTokenFromRecovery();
    if (recoveredAuthToken) {
      console.log(
        "[ChatsStore] Found encoded auth token in recovery storage. Applying."
      );
      state.authToken = recoveredAuthToken;
    }
  }

  ensureRecoveryKeysAreSet(state.username, state.authToken);
};
