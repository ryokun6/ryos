import { useEffect, useRef } from "react";
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
  const currentMessagesRef = useRef(currentMessages);
  currentMessagesRef.current = currentMessages;

  useEffect(() => {
    const sdkMessages = currentMessagesRef.current;
    const storeLast = aiMessages.at(-1);
    const sdkLast = sdkMessages.at(-1);

    if (aiMessages.length !== sdkMessages.length || storeLast?.id !== sdkLast?.id) {
      console.log("Syncing Zustand store messages to SDK.");
      setMessages(aiMessages);
    }
  }, [aiMessages, setMessages]);
}
