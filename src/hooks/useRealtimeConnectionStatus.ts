import { useEffect, useReducer } from "react";
import {
  getPusherClient,
  getRealtimeConnectionState,
  type RealtimeConnectionState,
} from "@/lib/pusherClient";

interface RealtimeConnectionStatusState {
  connectionState: RealtimeConnectionState;
}

const initialState: RealtimeConnectionStatusState = {
  connectionState: getRealtimeConnectionState(),
};

type RealtimeConnectionStatusAction = {
  type: "setConnectionState";
  value: RealtimeConnectionState;
};

function reducer(
  state: RealtimeConnectionStatusState,
  action: RealtimeConnectionStatusAction
): RealtimeConnectionStatusState {
  switch (action.type) {
    case "setConnectionState":
      return { ...state, connectionState: action.value };
    default:
      return state;
  }
}

/**
 * Subscribes to the shared realtime client and returns the current
 * WebSocket / Pusher connection state: "connected", "connecting", or
 * "disconnected".
 */
export function useRealtimeConnectionStatus(): RealtimeConnectionState {
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const client = getPusherClient();

    const onConnected = () =>
      dispatch({ type: "setConnectionState", value: "connected" });
    const onConnecting = () =>
      dispatch({ type: "setConnectionState", value: "connecting" });
    const onDisconnected = () =>
      dispatch({ type: "setConnectionState", value: "disconnected" });

    client.connection.bind("connected", onConnected);
    client.connection.bind("connecting", onConnecting);
    client.connection.bind("disconnected", onDisconnected);

    dispatch({
      type: "setConnectionState",
      value: getRealtimeConnectionState(),
    });

    return () => {
      client.connection.unbind("connected", onConnected);
      client.connection.unbind("connecting", onConnecting);
      client.connection.unbind("disconnected", onDisconnected);
    };
  }, []);

  return state.connectionState;
}
