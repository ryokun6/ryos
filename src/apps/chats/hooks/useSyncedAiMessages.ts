import { useEffect, useRef } from "react";
import type { UIMessage } from "@ai-sdk/react";
import type { AIChatMessage } from "@/types/chat";
import {
  applyFreshProactiveGreeting,
  isDefaultGreetingMessage,
} from "../utils/proactiveGreetingApply";

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

    const sdkHasDefaultGreeting = sdkMessages.some((message) =>
      isDefaultGreetingMessage(message as AIChatMessage)
    );
    const storeProactiveGreeting = aiMessages.find(
      (message) =>
        message.id === "proactive-1" || message.id?.startsWith("proactive-")
    );

    // Swap the loading placeholder greeting in the live SDK list when the store
    // already received the proactive greeting but the stream is still running.
    if (sdkHasDefaultGreeting && storeProactiveGreeting) {
      const patchedMessages = applyFreshProactiveGreeting(
        sdkMessages as AIChatMessage[],
        storeProactiveGreeting
      );
      if (patchedMessages) {
        setMessages(patchedMessages);
      }
      return;
    }

    // While the user is mid-conversation the AI SDK list is ahead of the
    // persisted store until onFinish runs. Never overwrite a longer SDK list
    // with a shorter store snapshot.
    if (sdkMessages.length > aiMessages.length) {
      return;
    }

    if (aiMessages.length !== sdkMessages.length || storeLast?.id !== sdkLast?.id) {
      console.log("Syncing Zustand store messages to SDK.");
      setMessages(aiMessages);
    }
  }, [aiMessages, setMessages]);
}
