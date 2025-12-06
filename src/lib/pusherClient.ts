import Pusher, { Channel } from "pusher-js";

// App-wide singleton so we don't open/close the WebSocket on every React Strict-Mode remount.

const globalWithPusher = globalThis as typeof globalThis & {
  __pusherClient?: Pusher;
};

// Use development Pusher key for local dev and Vercel preview deployments
const isDevOrPreview =
  import.meta.env.MODE === "development" ||
  import.meta.env.VITE_VERCEL_ENV === "preview";

const PUSHER_APP_KEY = isDevOrPreview
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
