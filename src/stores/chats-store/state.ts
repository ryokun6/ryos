import type { AIChatMessage } from "@/types/chat";
import i18n from "@/lib/i18n";
import {
  getAuthTokenFromRecovery,
  getUsernameFromRecovery,
} from "./repository/recovery";
import type { ChatsStoreInitialState } from "./types";

export const STORE_VERSION = 2;
export const STORE_NAME = "ryos:chats";

export const getInitialAiMessage = (): AIChatMessage => ({
  id: "1",
  role: "assistant",
  parts: [{ type: "text" as const, text: i18n.t("apps.chats.messages.greeting") }],
  metadata: {
    createdAt: new Date(),
  },
});

export const getInitialState = (): ChatsStoreInitialState => {
  const recoveredUsername = getUsernameFromRecovery();
  const recoveredAuthToken = getAuthTokenFromRecovery();

  return {
    aiMessages: [getInitialAiMessage()],
    username: recoveredUsername,
    authToken: recoveredAuthToken,
    hasPassword: null,
    rooms: [],
    currentRoomId: null,
    roomMessages: {},
    unreadCounts: {},
    hasEverUsedChats: false,
    isSidebarVisible: true,
    isChannelsOpen: true,
    isPrivateOpen: true,
    fontSize: 13,
    messageRenderLimit: 50,
  };
};
