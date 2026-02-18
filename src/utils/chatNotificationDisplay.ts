/**
 * Shared display logic for chat notifications: native browser notification when
 * tab is hidden + permission granted, otherwise Sonner toast.
 */
import { toast } from "sonner";
import i18n from "@/lib/i18n";
import { showChatNotification } from "@/utils/browserNotifications";
import { openChatRoomFromNotification } from "@/utils/openChatRoomFromNotification";

const openLabel = () => i18n.t("apps.chats.notification.openAction");

export interface ShowRoomMessageNotificationParams {
  username: string;
  content: string;
  roomId: string;
  messageId: string;
}

/**
 * Shows a room message notification: native Notification when tab is hidden
 * and permission granted, otherwise Sonner toast.
 */
export function showRoomMessageNotification(
  params: ShowRoomMessageNotificationParams
): void {
  const { username, content, roomId, messageId } = params;
  const preview = content.replace(/\s+/g, " ").trim().slice(0, 80);
  const title = `@${username}`;
  const tag = `room-${roomId}`;

  const shown = showChatNotification({
    title,
    body: preview,
    tag,
    onClick: () => openChatRoomFromNotification(roomId),
  });

  if (!shown) {
    toast(title, {
      id: `chat-room-message-${messageId}`,
      description: preview,
      action: {
        label: openLabel(),
        onClick: () => openChatRoomFromNotification(roomId),
      },
    });
  }
}

export interface ShowAiMessageNotificationParams {
  content: string;
  messageId: string;
}

/**
 * Shows an AI (@Ryo) message notification: native Notification when tab is
 * hidden and permission granted, otherwise Sonner toast.
 */
export function showAiMessageNotification(
  params: ShowAiMessageNotificationParams
): void {
  const { content, messageId } = params;
  const preview = content.replace(/\s+/g, " ").trim().slice(0, 100);
  const title = "@Ryo";
  const tag = "chat-ai";

  const shown = showChatNotification({
    title,
    body: preview + (content.length > 100 ? "…" : ""),
    tag,
    onClick: () => openChatRoomFromNotification(null),
  });

  if (!shown) {
    toast(title, {
      id: `chat-ai-message-${messageId}`,
      description: preview + (content.length > 100 ? "…" : ""),
      duration: 6000,
      action: {
        label: openLabel(),
        onClick: () => openChatRoomFromNotification(null),
      },
    });
  }
}
