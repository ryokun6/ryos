import { createChatsStore } from "./chats-store/create-store";

export type { ChatsStoreState } from "./chats-store/types";

export const useChatsStore = createChatsStore();
