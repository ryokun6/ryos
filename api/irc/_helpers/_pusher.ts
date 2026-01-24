/**
 * Pusher client and broadcast helpers for IRC API
 */

import Pusher from "pusher";

// ============================================================================
// Pusher Client
// ============================================================================

export const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true,
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Sanitize server ID for use in Pusher channel names
 * Pusher channel names can't contain colons, so we replace them with underscores
 */
function sanitizeForChannel(str: string): string {
  return str.replace(/[^a-zA-Z0-9_\-\.]/g, "_");
}

// ============================================================================
// IRC Broadcast Helpers
// ============================================================================

/**
 * Broadcast IRC message to channel
 */
export async function broadcastIrcMessage(
  serverId: string,
  channel: string,
  message: unknown
): Promise<void> {
  const safeServerId = sanitizeForChannel(serverId);
  const safeChannel = sanitizeForChannel(channel);
  const channelName = `irc-${safeServerId}-${safeChannel}`;
  await pusher.trigger(channelName, "irc-message", message);
}

/**
 * Broadcast IRC server event
 */
export async function broadcastIrcServerEvent(
  serverId: string,
  event: string,
  data: unknown
): Promise<void> {
  const safeServerId = sanitizeForChannel(serverId);
  const channelName = `irc-server-${safeServerId}`;
  await pusher.trigger(channelName, event, data);
}

/**
 * Broadcast IRC channel event (join/part/topic)
 */
export async function broadcastIrcChannelEvent(
  serverId: string,
  channel: string,
  event: string,
  data: unknown
): Promise<void> {
  const safeServerId = sanitizeForChannel(serverId);
  const safeChannel = sanitizeForChannel(channel);
  const channelName = `irc-${safeServerId}-${safeChannel}`;
  await pusher.trigger(channelName, event, data);
}
