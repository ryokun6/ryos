import type PusherType from "pusher-js";
import type { Channel } from "pusher-js";
import * as PusherNamespace from "pusher-js";

// App-wide singleton so we don't open/close the WebSocket on every React Strict-Mode remount.
// Also survives HMR to prevent connection churn during development.

const globalWithPusher = globalThis as typeof globalThis & {
  __pusherClient?: PusherType;
  __pusherChannelRefCounts?: Record<string, number>;
  Pusher?: PusherConstructor;
};

type PusherConstructor = new (
  key: string,
  options: {
    cluster: string;
    forceTLS: boolean;
  }
) => PusherType;

// Use development Pusher key for local dev and Vercel preview deployments
const PUSHER_APP_KEY =
  import.meta.env.VITE_VERCEL_ENV === "development" ||
  import.meta.env.VITE_VERCEL_ENV === "preview"
    ? "988dd649f3bdb6f0f995"
    : "b47fd563805c8c42da1a";
const PUSHER_CLUSTER = "us3";

const getPusherConstructor = (): PusherConstructor => {
  const constructorFromModule = (
    PusherNamespace as unknown as { default?: PusherConstructor }
  ).default;
  if (constructorFromModule) {
    return constructorFromModule;
  }

  const constructorFromGlobal = globalWithPusher.Pusher;
  if (constructorFromGlobal) {
    return constructorFromGlobal;
  }

  throw new Error("[pusherClient] Pusher constructor not available");
};

export function getPusherClient(): PusherType {
  if (!globalWithPusher.__pusherClient) {
    const Pusher = getPusherConstructor();
    // Create once and cache
    globalWithPusher.__pusherClient = new Pusher(PUSHER_APP_KEY, {
      cluster: PUSHER_CLUSTER,
      forceTLS: true,
    });
  }
  return globalWithPusher.__pusherClient;
}

export type PusherChannel = Channel;

const getChannelRefCounts = (): Record<string, number> => {
  if (!globalWithPusher.__pusherChannelRefCounts) {
    globalWithPusher.__pusherChannelRefCounts = {};
  }
  return globalWithPusher.__pusherChannelRefCounts;
};

/**
 * Acquire a shared channel subscription.
 * Multiple consumers can subscribe safely without unsubscribing each other.
 */
export function subscribePusherChannel(channelName: string): PusherChannel {
  const pusher = getPusherClient();
  const counts = getChannelRefCounts();
  const currentCount = counts[channelName] || 0;
  const existingChannel = (
    pusher as unknown as { channel: (name: string) => PusherChannel | undefined }
  ).channel(channelName);

  if (currentCount === 0 || !existingChannel) {
    const subscribedChannel = pusher.subscribe(channelName);
    counts[channelName] = currentCount + 1;
    return subscribedChannel;
  }

  counts[channelName] = currentCount + 1;
  return existingChannel;
}

/**
 * Release a shared channel subscription.
 * Actual unsubscribe happens only when the final consumer releases it.
 */
export function unsubscribePusherChannel(channelName: string): void {
  if (!channelName) {
    return;
  }

  const counts = getChannelRefCounts();
  const currentCount = counts[channelName] || 0;

  if (currentCount <= 0) {
    return;
  }

  if (currentCount <= 1) {
    delete counts[channelName];
    globalWithPusher.__pusherClient?.unsubscribe(channelName);
    return;
  }

  counts[channelName] = currentCount - 1;
}

// HMR cleanup - don't disconnect during HMR, the singleton survives via globalThis
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    // Intentionally keep the connection alive during HMR
    // The globalThis singleton will be reused by the new module
    console.debug("[pusherClient] HMR: keeping connection alive");
  });
}
