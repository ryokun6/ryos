import type PusherType from "pusher-js";
import type { Channel } from "pusher-js";
import * as PusherNamespace from "pusher-js";

// App-wide singleton so we don't open/close the WebSocket on every React Strict-Mode remount.
// Also survives HMR to prevent connection churn during development.

const globalWithPusher = globalThis as typeof globalThis & {
  __pusherClient?: PusherType;
  __pusherChannelRefCounts?: Record<string, number>;
  __pusherChannelRecoveryWarnings?: Record<string, true>;
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

const warnChannelRecoveryOnce = (key: string, message: string): void => {
  if (!globalWithPusher.__pusherChannelRecoveryWarnings) {
    globalWithPusher.__pusherChannelRecoveryWarnings = {};
  }
  if (globalWithPusher.__pusherChannelRecoveryWarnings[key]) {
    return;
  }
  globalWithPusher.__pusherChannelRecoveryWarnings[key] = true;
  console.warn(`[pusherClient] ${message}`);
};

const normalizeChannelName = (
  channelName: string | null | undefined
): string => channelName?.trim() || "";

const clearChannelRecoveryWarnings = (channelName: string): void => {
  if (!globalWithPusher.__pusherChannelRecoveryWarnings) {
    return;
  }
  delete globalWithPusher.__pusherChannelRecoveryWarnings[
    `missing-channel:${channelName}`
  ];
  delete globalWithPusher.__pusherChannelRecoveryWarnings[
    `underflow:${channelName}`
  ];
};

/**
 * Acquire a shared channel subscription.
 * Multiple consumers can subscribe safely without unsubscribing each other.
 */
export function subscribePusherChannel(channelName: string): PusherChannel {
  const normalizedChannelName = normalizeChannelName(channelName);
  if (!normalizedChannelName) {
    throw new Error("[pusherClient] channelName is required");
  }

  const pusher = getPusherClient();
  const counts = getChannelRefCounts();
  const currentCount = counts[normalizedChannelName] || 0;
  const existingChannel = (
    pusher as unknown as { channel: (name: string) => PusherChannel | undefined }
  ).channel(normalizedChannelName);

  if (currentCount === 0) {
    // Always call subscribe for the first local holder to ensure the channel is
    // actively subscribed even if a stale channel object exists.
    const subscribedChannel = pusher.subscribe(normalizedChannelName);
    counts[normalizedChannelName] = 1;
    clearChannelRecoveryWarnings(normalizedChannelName);
    return subscribedChannel;
  }

  if (!existingChannel) {
    const subscribedChannel = pusher.subscribe(normalizedChannelName);
    // Count became stale while channel was missing; recover to 1 active holder.
    warnChannelRecoveryOnce(
      `missing-channel:${normalizedChannelName}`,
      `Recovered missing channel "${normalizedChannelName}" while refcount was ${currentCount}`
    );
    counts[normalizedChannelName] = 1;
    return subscribedChannel;
  }

  counts[normalizedChannelName] = currentCount + 1;
  return existingChannel;
}

/**
 * Release a shared channel subscription.
 * Actual unsubscribe happens only when the final consumer releases it.
 */
export function unsubscribePusherChannel(channelName: string): void {
  const normalizedChannelName = normalizeChannelName(channelName);
  if (!normalizedChannelName) {
    return;
  }

  const counts = getChannelRefCounts();
  const currentCount = counts[normalizedChannelName] || 0;

  if (currentCount <= 0) {
    warnChannelRecoveryOnce(
      `underflow:${normalizedChannelName}`,
      `Ignored unsubscribe underflow for "${normalizedChannelName}"`
    );
    return;
  }

  if (currentCount <= 1) {
    delete counts[normalizedChannelName];
    globalWithPusher.__pusherClient?.unsubscribe(normalizedChannelName);
    clearChannelRecoveryWarnings(normalizedChannelName);
    return;
  }

  counts[normalizedChannelName] = currentCount - 1;
}

// HMR cleanup - don't disconnect during HMR, the singleton survives via globalThis
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    // Intentionally keep the connection alive during HMR
    // The globalThis singleton will be reused by the new module
    // Reset channel refcounts to avoid stale holder counts across code reloads.
    globalWithPusher.__pusherChannelRefCounts = {};
    globalWithPusher.__pusherChannelRecoveryWarnings = {};
    console.debug("[pusherClient] HMR: keeping connection alive");
  });
}
