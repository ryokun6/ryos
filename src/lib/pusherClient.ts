import Pusher, { Channel } from "pusher-js";

// App-wide singleton so we don't open/close the WebSocket on every React Strict-Mode remount.
// Also survives HMR to prevent connection churn during development.

const globalWithPusher = globalThis as typeof globalThis & {
  __pusherClient?: Pusher;
};

// Use development Pusher key for local dev and Vercel preview deployments
const PUSHER_APP_KEY =
  import.meta.env.VITE_VERCEL_ENV === "development" ||
  import.meta.env.VITE_VERCEL_ENV === "preview"
    ? "988dd649f3bdb6f0f995"
    : "b47fd563805c8c42da1a";
const PUSHER_CLUSTER = "us3";

export function getPusherClient(): Pusher {
  if (!globalWithPusher.__pusherClient) {
    // Create once and cache
    globalWithPusher.__pusherClient = new Pusher(PUSHER_APP_KEY, {
      cluster: PUSHER_CLUSTER,
      forceTLS: true,
    });
  }
  return globalWithPusher.__pusherClient;
}

export type PusherChannel = Channel;

// HMR cleanup - don't disconnect during HMR, the singleton survives via globalThis
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    // Intentionally keep the connection alive during HMR
    // The globalThis singleton will be reused by the new module
    console.debug("[pusherClient] HMR: keeping connection alive");
  });
}
