import { applyIdentityRecoveryOnRehydrate } from "./rehydration";
import { migrateLegacyChatStorageState } from "./migration";
import { ensureRecoveryKeysAreSet } from "./recovery";

interface PersistLifecycleParams<State> {
  persistedState: unknown;
  version: number;
  storeVersion: number;
  getInitialState: () => State;
}

interface RehydratableChatsState {
  username: string | null;
  authToken: string | null;
  rooms?: unknown;
}

export const migrateChatsPersistedState = <State>({
  persistedState,
  version,
  storeVersion,
  getInitialState,
}: PersistLifecycleParams<State>): State => {
  console.log(
    "[ChatsStore] Migrate function started. Version:",
    version,
    "Persisted state exists:",
    !!persistedState
  );
  if (persistedState) {
    const state = persistedState as RehydratableChatsState;
    console.log(
      "[ChatsStore] Persisted state type for rooms:",
      typeof state.rooms,
      "Is Array:",
      Array.isArray(state.rooms)
    );
  }

  if (version < storeVersion && !persistedState) {
    console.log(
      `[ChatsStore] Migrating from old localStorage keys to version ${storeVersion}...`
    );
    try {
      const migratedState = migrateLegacyChatStorageState();

      console.log("[ChatsStore] Migration data:", migratedState);

      const finalMigratedState = {
        ...getInitialState(),
        ...migratedState,
      } as State;
      console.log("[ChatsStore] Final migrated state:", finalMigratedState);
      console.log(
        "[ChatsStore] Migrated rooms type:",
        typeof (finalMigratedState as RehydratableChatsState).rooms,
        "Is Array:",
        Array.isArray((finalMigratedState as RehydratableChatsState).rooms)
      );
      return finalMigratedState;
    } catch (error) {
      console.error("[ChatsStore] Migration failed:", error);
    }
  }

  if (persistedState) {
    console.log("[ChatsStore] Using persisted state.");
    const finalState = { ...(persistedState as object) } as RehydratableChatsState;

    if (finalState.username || finalState.authToken) {
      ensureRecoveryKeysAreSet(finalState.username, finalState.authToken);
    }

    console.log("[ChatsStore] Final state from persisted:", finalState);
    console.log(
      "[ChatsStore] Persisted state rooms type:",
      typeof finalState.rooms,
      "Is Array:",
      Array.isArray(finalState.rooms)
    );
    return finalState as State;
  }

  console.log("[ChatsStore] Falling back to initial state.");
  return { ...getInitialState() } as State;
};

export const createChatsOnRehydrateStorage = <
  State extends RehydratableChatsState,
>() => {
  console.log("[ChatsStore] Rehydrating storage...");
  return (
    state: State | undefined,
    error: unknown
  ): void => {
    if (error) {
      console.error("[ChatsStore] Error during rehydration:", error);
    } else if (state) {
      console.log(
        "[ChatsStore] Rehydration complete. Current state username:",
        state.username,
        "authToken:",
        state.authToken ? "present" : "null"
      );
      applyIdentityRecoveryOnRehydrate(state);
    }
  };
};
