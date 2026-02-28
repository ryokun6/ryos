import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getChatsPersistConfig } from "./persistence";
import { ensureRecoveryKeysAreSet } from "./repository/recovery";
import { createAuthSlice } from "./slices/auth-slice";
import { createRoomsSlice } from "./slices/rooms-slice";
import { createUiUnreadSlice } from "./slices/ui-unread-slice";
import { getInitialState } from "./state";
import type { ChatsStoreState } from "./types";

export function createChatsStore() {
  return create<ChatsStoreState>()(
    persist(
      (set, get) => {
        const initialState = getInitialState();
        ensureRecoveryKeysAreSet(initialState.username, initialState.authToken);

        return {
          ...initialState,
          ...createUiUnreadSlice(set),
          ...createAuthSlice(set, get),
          ...createRoomsSlice(set, get),
        };
      },
      getChatsPersistConfig()
    )
  );
}
