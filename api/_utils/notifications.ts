/**
 * Unified notification delivery.
 *
 * Send push notifications to a user's personal channel.
 * Clients subscribe via `useUnifiedNotifications` hook.
 */

import { triggerRealtimeEvent, triggerRealtimeBatch } from "./realtime.js";

export type NotificationType =
  | "airdrop-request"
  | "listen-invite"
  | "mention"
  | "sync-conflict"
  | "system";

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  timestamp?: number;
}

function sanitizeChannelName(username: string): string {
  return username.toLowerCase().replace(/[^a-zA-Z0-9_\-.]/g, "_");
}

function getNotificationChannel(username: string): string {
  return `notifications-${sanitizeChannelName(username)}`;
}

/**
 * Send a notification to a single user.
 */
export async function sendNotification(
  username: string,
  payload: NotificationPayload
): Promise<void> {
  const channel = getNotificationChannel(username);
  await triggerRealtimeEvent(channel, "notification", {
    ...payload,
    timestamp: payload.timestamp ?? Date.now(),
  });
}

/**
 * Send a notification to multiple users at once (batched).
 */
export async function sendNotificationBatch(
  usernames: string[],
  payload: NotificationPayload
): Promise<void> {
  if (usernames.length === 0) return;

  const enriched = { ...payload, timestamp: payload.timestamp ?? Date.now() };
  const events = usernames.map((username) => ({
    channel: getNotificationChannel(username),
    name: "notification",
    data: enriched,
  }));

  await triggerRealtimeBatch(events);
}
