import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";
import { getSystemState } from "../utils/systemState";

interface UseRyoChatProps {
  currentRoomId: string | null;
  onScrollToBottom: () => void;
  roomMessages?: Array<{
    username: string;
    content: string;
    userId?: string;
    timestamp?: string;
  }>;
}

export function useRyoChat({
  currentRoomId,
  onScrollToBottom,
  roomMessages = [],
}: UseRyoChatProps) {
  const { t } = useTranslation();

  // Create a separate AI chat hook for @ryo mentions in chat rooms
  const ryoChatTransport = useMemo(
    () =>
      new DefaultChatTransport({
        api: getApiUrl("/api/chat"),
        body: {
          systemState: getSystemState(),
        },
      }),
    []
  );

  const {
    messages: ryoMessages,
    status,
    stop: stopRyo,
  } = useChat({
    transport: ryoChatTransport,
    // We no longer stream client-side AI to avoid spoofing. onFinish unused.
  });

  const isRyoLoading = status === "streaming" || status === "submitted";

  const handleRyoMention = useCallback(
    async (messageContent: string) => {
      // Get recent chat room messages as context (last 20 messages)
      const recentMessages = roomMessages
        .slice(-20)
        .map((msg) => `${msg.username}: ${msg.content}`)
        .join("\n");

      // Include chat room context in the system state
      const systemStateWithChat = {
        ...getSystemState(),
        chatRoomContext: {
          roomId: currentRoomId,
          recentMessages: recentMessages,
          mentionedMessage: messageContent,
        },
      };

      if (!currentRoomId) return;
      try {
        await abortableFetch(getApiUrl("/api/ai/ryo-reply"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId: currentRoomId,
            prompt: messageContent,
            systemState: systemStateWithChat,
          }),
          timeout: 20000,
          retry: { maxAttempts: 1, initialDelayMs: 250 },
        });
      } catch (error) {
        console.error("[RyoChat] Failed to request @ryo reply:", error);
      }

      onScrollToBottom();
    },
    [roomMessages, currentRoomId, onScrollToBottom]
  );

  const detectAndProcessMention = useCallback(
    (input: string): { isMention: boolean; messageContent: string } => {
      if (input.startsWith("@ryo ")) {
        // Extract the message content after @ryo
        const messageContent = input.substring(4).trim();
        return { isMention: true, messageContent };
      } else if (input === "@ryo") {
        // If they just typed @ryo without a message, treat it as a nudge
        return { isMention: true, messageContent: t("apps.chats.status.nudgeSent") };
      }
      return { isMention: false, messageContent: "" };
    },
    [t]
  );

  return {
    ryoMessages,
    isRyoLoading,
    stopRyo,
    handleRyoMention,
    detectAndProcessMention,
  };
}
