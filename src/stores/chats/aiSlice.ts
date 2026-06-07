import type { AIChatMessage } from "@/types/chat";
import i18n from "@/lib/i18n";
import type { ChatsStoreState } from "./types";

export const GREETING_FALLBACK = "👋 hey! i'm ryo. ask me anything!";

export const getInitialAiMessage = (): AIChatMessage => ({
  id: "1",
  role: "assistant",
  parts: [{ type: "text" as const, text: i18n.t("apps.chats.messages.greeting") || GREETING_FALLBACK }],
  metadata: {
    createdAt: new Date(),
  },
});

type ChatsSet = (
  partial:
    | Partial<ChatsStoreState>
    | ((state: ChatsStoreState) => Partial<ChatsStoreState>)
) => void;

export function createAiSlice(set: ChatsSet): Pick<ChatsStoreState, "setAiMessages"> {
  return {
    setAiMessages: (messages) => set({ aiMessages: messages }),
  };
}
