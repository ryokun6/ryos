/**
 * Shared Pusher helpers for realtime session channels.
 */

import Pusher from "pusher";

export function createRealtimeSessionPusherClient(): Pusher {
  return new Pusher({
    appId: process.env.PUSHER_APP_ID!,
    key: process.env.PUSHER_KEY!,
    secret: process.env.PUSHER_SECRET!,
    cluster: process.env.PUSHER_CLUSTER!,
    useTLS: true,
  });
}

export function getRealtimeSessionChannelName(
  channelPrefix: string,
  sessionId: string
): string {
  return `${channelPrefix}-${sessionId}`;
}

export async function triggerRealtimeSessionEvent<TPayload>(
  pusher: Pusher,
  channelPrefix: string,
  sessionId: string,
  eventName: string,
  payload: TPayload
): Promise<void> {
  await pusher.trigger(
    getRealtimeSessionChannelName(channelPrefix, sessionId),
    eventName,
    payload
  );
}
