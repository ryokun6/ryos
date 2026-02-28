import type { ChatsStoreSet, ChatsStoreState } from "../types";

type UiUnreadSlice = Pick<
  ChatsStoreState,
  | "setAiMessages"
  | "toggleSidebarVisibility"
  | "toggleChannelsOpen"
  | "togglePrivateOpen"
  | "setFontSize"
  | "setMessageRenderLimit"
  | "incrementUnread"
  | "clearUnread"
  | "setHasEverUsedChats"
>;

export const createUiUnreadSlice = (set: ChatsStoreSet): UiUnreadSlice => ({
  setAiMessages: (messages) => set({ aiMessages: messages }),
  toggleSidebarVisibility: () =>
    set((state) => ({
      isSidebarVisible: !state.isSidebarVisible,
    })),
  toggleChannelsOpen: () =>
    set((state) => ({ isChannelsOpen: !state.isChannelsOpen })),
  togglePrivateOpen: () => set((state) => ({ isPrivateOpen: !state.isPrivateOpen })),
  setFontSize: (sizeOrFn) =>
    set((state) => ({
      fontSize:
        typeof sizeOrFn === "function" ? sizeOrFn(state.fontSize) : sizeOrFn,
    })),
  setMessageRenderLimit: (limit: number) =>
    set(() => ({ messageRenderLimit: Math.max(20, Math.floor(limit)) })),
  incrementUnread: (roomId) => {
    set((state) => ({
      unreadCounts: {
        ...state.unreadCounts,
        [roomId]: (state.unreadCounts[roomId] || 0) + 1,
      },
    }));
  },
  clearUnread: (roomId) => {
    set((state) => {
      const { [roomId]: _removed, ...rest } = state.unreadCounts;
      return { unreadCounts: rest };
    });
  },
  setHasEverUsedChats: (value: boolean) => {
    set({ hasEverUsedChats: value });
  },
});
