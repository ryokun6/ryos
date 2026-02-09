import type { UIMessage } from "@ai-sdk/react";
import { useAppStore } from "@/stores/useAppStore";
import { toast } from "@/hooks/useToast";
import { openChatRoomFromNotification } from "@/utils/openChatRoomFromNotification";

// Helper function to extract visible text from message parts
export const getAssistantVisibleText = (message: UIMessage): string => {
  // Define type for message parts
  type MessagePart = {
    type: string;
    text?: string;
  };

  // If message has parts, extract text from text parts only
  if (message.parts && message.parts.length > 0) {
    return message.parts
      .filter((part: MessagePart) => part.type === "text")
      .map((part: MessagePart) => {
        const text = part.text || "";
        // Handle urgent messages by removing leading !!!!
        return text.startsWith("!!!!") ? text.slice(4).trimStart() : text;
      })
      .join("");
  }

  // Fallback - no content property in v5, return empty string
  return "";
};

// Helper to check if chats app is currently in the foreground
export const isChatsInForeground = (): boolean => {
  const appStore = useAppStore.getState();
  const foregroundId = appStore.foregroundInstanceId;
  if (!foregroundId) return false;
  const foregroundInstance = appStore.instances[foregroundId];
  return foregroundInstance?.appId === "chats";
};

// Helper to show notification with assistant's message when chat is backgrounded
export const showBackgroundedMessageNotification = (
  message: UIMessage
): void => {
  // Extract text content (without tool calls)
  const textContent = getAssistantVisibleText(message);
  if (!textContent.trim()) return;

  // Truncate and clean up message preview
  const preview = textContent.replace(/\s+/g, " ").trim().slice(0, 100);

  // Show notification similar to room chat toasts
  toast(`@Ryo`, {
    id: `chat-ai-message-${message.id}`,
    description: preview + (textContent.length > 100 ? "…" : ""),
    duration: 6000,
    action: {
      label: "Open",
      onClick: () => {
        // Open/focus Chats and switch to @Ryo context.
        openChatRoomFromNotification(null);
      },
    },
  });
};
