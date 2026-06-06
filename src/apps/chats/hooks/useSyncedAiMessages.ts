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

    // While the user is mid-conversation the AI SDK list is ahead of the
    // persisted store until onFinish runs. Never overwrite a longer SDK list
    // with a shorter store snapshot (e.g. proactive greeting replacing only the
    // default greeting while a user message is already in flight).
    if (sdkMessages.length > aiMessages.length) {
      return;
    }

    if (aiMessages.length !== sdkMessages.length || storeLast?.id !== sdkLast?.id) {
      console.log("Syncing Zustand store messages to SDK.");
      setMessages(aiMessages);
    }
  }, [aiMessages, setMessages]);
}
