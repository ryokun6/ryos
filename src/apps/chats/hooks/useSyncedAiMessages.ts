import { useEffect, useRef } from "react";
import type { UIMessage } from "@ai-sdk/react";
import type { AIChatMessage } from "@/types/chat";
import { resolveAiMessageSync } from "../utils/proactiveGreetingApply";
import { aiChatLog as log } from "../logging";

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
    const sdkMessages = currentMessagesRef.current as AIChatMessage[];
    const decision = resolveAiMessageSync(aiMessages, sdkMessages);

    switch (decision.action) {
      case "patch-greeting":
        setMessages(decision.messages);
        return;
      case "sync":
        log.debug("Syncing Zustand store messages to SDK", {
          messageCount: aiMessages.length,
        });
        setMessages(aiMessages);
        return;
      case "skip":
      case "noop":
        return;
    }
  }, [aiMessages, setMessages]);
}
