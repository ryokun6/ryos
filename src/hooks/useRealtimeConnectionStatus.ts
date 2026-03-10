import { useEffect, useState } from "react";
import {
  getPusherClient,
  getRealtimeConnectionState,
  type RealtimeConnectionState,
} from "@/lib/pusherClient";

/**
 * Subscribes to the shared realtime client and returns the current
 * WebSocket / Pusher connection state: "connected", "connecting", or
 * "disconnected".
 */
export function useRealtimeConnectionStatus(): RealtimeConnectionState {
  const [state, setState] = useState<RealtimeConnectionState>(
    getRealtimeConnectionState
  );

  useEffect(() => {
    const client = getPusherClient();

    const onConnected = () => setState("connected");
    const onConnecting = () => setState("connecting");
    const onDisconnected = () => setState("disconnected");

    client.connection.bind("connected", onConnected);
    client.connection.bind("connecting", onConnecting);
    client.connection.bind("disconnected", onDisconnected);

    setState(getRealtimeConnectionState());

    return () => {
      client.connection.unbind("connected", onConnected);
      client.connection.unbind("connecting", onConnecting);
      client.connection.unbind("disconnected", onDisconnected);
    };
  }, []);

  return state;
}
