import { useSyncExternalStore } from "react";
import {
  getRealtimeConnectionSnapshot,
  subscribeRealtimeConnection,
  type RealtimeConnectionState,
} from "@/lib/pusherClient";

const getServerSnapshot = (): RealtimeConnectionState => "disconnected";

/**
 * Subscribes to the shared realtime connection-state observable and returns
 * the current WebSocket / Pusher connection state: "connected",
 * "connecting", or "disconnected".
 */
export function useRealtimeConnectionStatus(): RealtimeConnectionState {
  return useSyncExternalStore(
    subscribeRealtimeConnection,
    getRealtimeConnectionSnapshot,
    getServerSnapshot
  );
}
