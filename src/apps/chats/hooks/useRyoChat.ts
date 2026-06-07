import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { requestRyoReply } from "@/api/ai";
import { getSystemState } from "../utils/systemState";
import { parseRyoMention } from "../utils/ryoMention";

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

  const [isRyoLoading, setIsRyoLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const stopRyo = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsRyoLoading(false);
  }, []);

  useEffect(() => stopRyo, [stopRyo]);

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

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsRyoLoading(true);

      try {
        await requestRyoReply(
          {
            roomId: currentRoomId,
            prompt: messageContent,
            systemState: systemStateWithChat,
          },
          { signal: controller.signal }
        );
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("[RyoChat] Failed to request @ryo reply:", error);
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setIsRyoLoading(false);
        }
      }

      onScrollToBottom();
    },
    [roomMessages, currentRoomId, onScrollToBottom]
  );

  const detectAndProcessMention = useCallback(
    (input: string): { isMention: boolean; messageContent: string } =>
      parseRyoMention(input, t("apps.chats.status.nudgeSent")),
    [t]
  );

  return {
    isRyoLoading,
    stopRyo,
    handleRyoMention,
    detectAndProcessMention,
  };
}
