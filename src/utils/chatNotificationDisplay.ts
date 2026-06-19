/**
 * Shared display logic for chat notifications: Electron native notification
 * when the desktop window is backgrounded, browser notification when the tab is
 * hidden + permission granted, otherwise Sonner toast.
 */
import { toast } from "@/hooks/useToast";
import i18n from "@/lib/i18n";
import { showChatNotification } from "@/utils/browserNotifications";
import { openChatRoomFromNotification } from "@/utils/openChatRoomFromNotification";
import { showNativeToastNotification } from "@/utils/nativeToastNotifications";

const openLabel = () => i18n.t("apps.chats.notification.openAction");

function showNotificationFallback(params: {
  title: string;
  body: string;
  tag: string;
  chatRoomId: string | null;
  toast: () => void;
}): void {
  const { title, body, tag, chatRoomId, toast: showToast } = params;

  void showNativeToastNotification("basic", title, {
    ...(body ? { description: body } : {}),
    chatRoomId,
  }).then((shown) => {
    if (shown) {
      return;
    }

    const shownInBrowser = showChatNotification({
      title,
      body,
      tag,
      onClick: () => openChatRoomFromNotification(chatRoomId),
    });

    if (!shownInBrowser) {
      showToast();
    }
  });
}

export interface ShowRoomMessageNotificationParams {
  username: string;
  content: string;
  roomId: string;
  messageId: string;
}

/**
 * Shows a room message notification using the best available system
 * notification path, otherwise Sonner toast.
 */
export function showRoomMessageNotification(
  params: ShowRoomMessageNotificationParams
): void {
  const { username, content, roomId, messageId } = params;
  const preview = content.replace(/\s+/g, " ").trim().slice(0, 80);
  const title = `@${username}`;
  const tag = `room-${roomId}`;

  showNotificationFallback({
    title,
    body: preview,
    tag,
    chatRoomId: roomId,
    toast: () => {
      toast(title, {
        id: `chat-room-message-${messageId}`,
        description: preview,
        action: {
          label: openLabel(),
          onClick: () => openChatRoomFromNotification(roomId),
        },
      });
    },
  });
}

export interface ShowAiMessageNotificationParams {
  content: string;
  messageId: string;
}

/**
 * Shows an AI (@Ryo) message notification using the best available system
 * notification path, otherwise Sonner toast.
 */
export function showAiMessageNotification(
  params: ShowAiMessageNotificationParams
): void {
  const { content, messageId } = params;
  const preview = content.replace(/\s+/g, " ").trim().slice(0, 100);
  const title = "@Ryo";
  const tag = "chat-ai";
  const body = preview + (content.length > 100 ? "…" : "");

  showNotificationFallback({
    title,
    body,
    tag,
    chatRoomId: null,
    toast: () => {
      toast(title, {
        id: `chat-ai-message-${messageId}`,
        description: body,
        duration: 6000,
        action: {
          label: openLabel(),
          onClick: () => openChatRoomFromNotification(null),
        },
      });
    },
  });
}
