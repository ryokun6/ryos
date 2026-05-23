import { useEffect } from "react";
import type { UIMessage } from "@ai-sdk/react";
import type { AIChatMessage } from "@/types/chat";

interface UseSyncedAiMessagesOptions {
  aiMessages: AIChatMessage[];
  currentMessages: UIMessage[];
  setMessages: (messages: AIChatMessage[]) => void;
}

export function useSyncedAiMessages({
  aiMessages,
  currentMessages,
  setMessages,
}: UseSyncedAiMessagesOptions) {
  useEffect(() => {
    const storeLast = aiMessages.at(-1);
    const sdkLast = currentMessages.at(-1);

    if (aiMessages.length !== currentMessages.length || storeLast?.id !== sdkLast?.id) {
      console.log("Syncing Zustand store messages to SDK.");
      setMessages(aiMessages);
    }
  }, [aiMessages, currentMessages, setMessages]);
}
