import { useEffect, useRef, useCallback } from "react";
import type { PusherChannel } from "@/lib/pusherClient";
import {
  subscribePusherChannel,
  unsubscribePusherChannel,
} from "@/lib/pusherClient";
import { useChatsStore } from "@/stores/useChatsStore";
import { toast } from "sonner";

const CHANNEL_PREFIX = "notifications-";

export interface UnifiedNotification {
  type:
    | "airdrop-request"
    | "listen-invite"
    | "mention"
    | "sync-conflict"
    | "system";
  title: string;
  body: string;
  data?: Record<string, unknown>;
  timestamp: number;
}

function sanitizeChannelName(username: string): string {
  return username.toLowerCase().replace(/[^a-zA-Z0-9_\-.]/g, "_");
}

/**
 * Subscribes to a per-user unified notification channel that aggregates
 * cross-app push notifications: AirDrop requests, Listen Together invites,
 * @mentions, sync conflicts, and system announcements.
 *
 * Server-side code can send to `notifications-{username}` using
 * `triggerRealtimeEvent` to deliver any of these notification types.
 */
export function useUnifiedNotifications(
  onNotification?: (notification: UnifiedNotification) => void
) {
  const username = useChatsStore((s) => s.username);
  const isAuthenticated = useChatsStore((s) => s.isAuthenticated);
  const channelRef = useRef<PusherChannel | null>(null);
  const channelNameRef = useRef<string | null>(null);

  const handleNotification = useCallback(
    (data: unknown) => {
      const notification = data as UnifiedNotification;
      if (!notification?.type || !notification.title) return;

      if (onNotification) {
        onNotification(notification);
        return;
      }

      // Default handling: show a toast
      switch (notification.type) {
        case "airdrop-request":
          toast(notification.title, {
            description: notification.body,
            duration: 10000,
          });
          break;
        case "listen-invite":
          toast(notification.title, {
            description: notification.body,
            duration: 8000,
          });
          break;
        case "mention":
          toast(notification.title, {
            description: notification.body,
            duration: 6000,
          });
          break;
        case "sync-conflict":
          toast.warning(notification.title, {
            description: notification.body,
            duration: 8000,
          });
          break;
        case "system":
          toast.info(notification.title, {
            description: notification.body,
            duration: 10000,
          });
          break;
        default:
          toast(notification.title, {
            description: notification.body,
          });
      }
    },
    [onNotification]
  );

  useEffect(() => {
    if (!username || !isAuthenticated) {
      if (channelRef.current && channelNameRef.current) {
        channelRef.current.unbind("notification", handleNotification);
        unsubscribePusherChannel(channelNameRef.current);
        channelRef.current = null;
        channelNameRef.current = null;
      }
      return;
    }

    const channelName = `${CHANNEL_PREFIX}${sanitizeChannelName(username)}`;

    if (channelNameRef.current === channelName && channelRef.current) {
      return;
    }

    // Unsubscribe from old channel if username changed
    if (channelRef.current && channelNameRef.current) {
      channelRef.current.unbind("notification", handleNotification);
      unsubscribePusherChannel(channelNameRef.current);
    }

    const channel = subscribePusherChannel(channelName);
    channel.bind("notification", handleNotification);
    channelRef.current = channel;
    channelNameRef.current = channelName;

    return () => {
      if (channelRef.current && channelNameRef.current) {
        channelRef.current.unbind("notification", handleNotification);
        unsubscribePusherChannel(channelNameRef.current);
        channelRef.current = null;
        channelNameRef.current = null;
      }
    };
  }, [username, isAuthenticated, handleNotification]);
}
