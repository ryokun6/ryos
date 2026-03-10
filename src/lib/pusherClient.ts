import type PusherType from "pusher-js";
import type { Channel } from "pusher-js";
import * as PusherNamespace from "pusher-js";
import {
  getPusherRuntimeConfig,
  getRealtimeProvider,
  getRealtimeWebSocketUrl,
} from "@/utils/runtimeConfig";

type ChannelEventHandler = {
  bivarianceHack(data: unknown): void;
}["bivarianceHack"];
type ConnectionEventHandler = {
  bivarianceHack(data?: unknown): void;
}["bivarianceHack"];

export interface RealtimeChannel {
  name: string;
  bind(eventName: string, handler: ChannelEventHandler): void;
  unbind(eventName?: string, handler?: ChannelEventHandler): void;
}

export interface RealtimeConnection {
  bind(eventName: string, handler: ConnectionEventHandler): void;
  unbind(eventName?: string, handler?: ConnectionEventHandler): void;
}

export interface RealtimeClient {
  connection: RealtimeConnection;
  subscribe(channelName: string): RealtimeChannel;
  unsubscribe(channelName: string): void;
  channel(channelName: string): RealtimeChannel | undefined;
}

const globalWithPusher = globalThis as typeof globalThis & {
  __pusherClient?: RealtimeClient;
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

const pusherRuntimeConfig = getPusherRuntimeConfig();
const PUSHER_APP_KEY = pusherRuntimeConfig.key;
const PUSHER_CLUSTER = pusherRuntimeConfig.cluster;
const PUSHER_FORCE_TLS = pusherRuntimeConfig.forceTLS;

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

export type RealtimeConnectionState =
  | "connected"
  | "connecting"
  | "disconnected";

class LocalRealtimeConnection implements RealtimeConnection {
  private listeners = new Map<string, Set<ConnectionEventHandler>>();
  state: RealtimeConnectionState = "connecting";

  bind(eventName: string, handler: ConnectionEventHandler): void {
    const listeners = this.listeners.get(eventName) || new Set();
    listeners.add(handler);
    this.listeners.set(eventName, listeners);
  }

  unbind(eventName?: string, handler?: ConnectionEventHandler): void {
    if (!eventName) {
      this.listeners.clear();
      return;
    }

    if (!handler) {
      this.listeners.delete(eventName);
      return;
    }

    const listeners = this.listeners.get(eventName);
    if (!listeners) return;
    listeners.delete(handler);
    if (listeners.size === 0) {
      this.listeners.delete(eventName);
    }
  }

  emit(eventName: string, payload?: unknown): void {
    const listeners = this.listeners.get(eventName);
    if (!listeners) return;
    listeners.forEach((listener) => listener(payload));
  }
}

class LocalRealtimeChannel implements RealtimeChannel {
  readonly name: string;
  private listeners = new Map<string, Set<ChannelEventHandler>>();

  constructor(name: string) {
    this.name = name;
  }

  bind(eventName: string, handler: ChannelEventHandler): void {
    const listeners = this.listeners.get(eventName) || new Set();
    listeners.add(handler);
    this.listeners.set(eventName, listeners);
  }

  unbind(eventName?: string, handler?: ChannelEventHandler): void {
    if (!eventName) {
      this.listeners.clear();
      return;
    }

    if (!handler) {
      this.listeners.delete(eventName);
      return;
    }

    const listeners = this.listeners.get(eventName);
    if (!listeners) return;
    listeners.delete(handler);
    if (listeners.size === 0) {
      this.listeners.delete(eventName);
    }
  }

  emit(eventName: string, payload: unknown): void {
    const listeners = this.listeners.get(eventName);
    if (!listeners) return;
    listeners.forEach((listener) => listener(payload));
  }
}

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;

class LocalRealtimeClient implements RealtimeClient {
  readonly connection = new LocalRealtimeConnection();

  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
  private destroyed = false;
  private channels = new Map<string, LocalRealtimeChannel>();
  private heartbeatTimer: number | null = null;
  private heartbeatTimeoutTimer: number | null = null;
  private boundVisibilityHandler: (() => void) | null = null;

  constructor(private readonly websocketUrl: string) {
    this.connect();
    this.setupVisibilityHandler();
  }

  subscribe(channelName: string): RealtimeChannel {
    const existing = this.channels.get(channelName);
    if (existing) {
      this.send({ type: "subscribe", channel: channelName });
      return existing;
    }

    const channel = new LocalRealtimeChannel(channelName);
    this.channels.set(channelName, channel);
    this.send({ type: "subscribe", channel: channelName });
    return channel;
  }

  unsubscribe(channelName: string): void {
    this.channels.delete(channelName);
    this.send({ type: "unsubscribe", channel: channelName });
  }

  channel(channelName: string): RealtimeChannel | undefined {
    return this.channels.get(channelName);
  }

  destroy(): void {
    this.destroyed = true;
    this.clearAllTimers();
    this.teardownVisibilityHandler();
    this.socket?.close();
    this.socket = null;
  }

  private setupVisibilityHandler(): void {
    if (typeof document === "undefined") return;

    this.boundVisibilityHandler = () => {
      if (document.visibilityState === "visible" && !this.destroyed) {
        if (
          !this.socket ||
          this.socket.readyState === WebSocket.CLOSED ||
          this.socket.readyState === WebSocket.CLOSING
        ) {
          this.reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
          this.connect();
        } else if (this.socket.readyState === WebSocket.OPEN) {
          this.sendPing();
        }
      }
    };

    document.addEventListener("visibilitychange", this.boundVisibilityHandler);
  }

  private teardownVisibilityHandler(): void {
    if (typeof document === "undefined" || !this.boundVisibilityHandler) return;
    document.removeEventListener(
      "visibilitychange",
      this.boundVisibilityHandler
    );
    this.boundVisibilityHandler = null;
  }

  private clearAllTimers(): void {
    if (typeof window === "undefined") return;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.heartbeatTimeoutTimer !== null) {
      window.clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  private startHeartbeat(): void {
    if (typeof window === "undefined") return;
    this.stopHeartbeat();

    this.heartbeatTimer = window.setInterval(() => {
      this.sendPing();
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (typeof window === "undefined") return;
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.heartbeatTimeoutTimer !== null) {
      window.clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  private sendPing(): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;

    try {
      this.socket.send(JSON.stringify({ type: "ping" }));
    } catch {
      return;
    }

    if (this.heartbeatTimeoutTimer !== null) {
      window.clearTimeout(this.heartbeatTimeoutTimer);
    }
    this.heartbeatTimeoutTimer = window.setTimeout(() => {
      this.heartbeatTimeoutTimer = null;
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.close();
      }
    }, HEARTBEAT_TIMEOUT_MS);
  }

  private setConnectionState(state: RealtimeConnectionState): void {
    this.connection.state = state;
  }

  private connect(): void {
    if (typeof window === "undefined" || this.destroyed) {
      return;
    }

    if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
      return;
    }

    this.setConnectionState("connecting");
    this.connection.emit("connecting");

    try {
      this.socket = new WebSocket(this.websocketUrl);
    } catch (error) {
      this.setConnectionState("disconnected");
      this.connection.emit(
        "error",
        error instanceof Error
          ? error
          : new Error("[pusherClient] Failed to create local realtime socket")
      );
      this.scheduleReconnect();
      return;
    }

    this.socket.addEventListener("open", () => {
      this.reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
      this.setConnectionState("connected");
      this.connection.emit("connected");
      this.startHeartbeat();
      for (const channelName of this.channels.keys()) {
        this.send({ type: "subscribe", channel: channelName });
      }
    });

    this.socket.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(String(event.data)) as {
          type?: string;
          channel?: string;
          event?: string;
          data?: unknown;
        };

        if (payload.type === "pong") {
          if (this.heartbeatTimeoutTimer !== null) {
            window.clearTimeout(this.heartbeatTimeoutTimer);
            this.heartbeatTimeoutTimer = null;
          }
          return;
        }

        if (payload.type === "event" && payload.channel && payload.event) {
          this.channels.get(payload.channel)?.emit(payload.event, payload.data);
        }
      } catch (error) {
        this.connection.emit(
          "error",
          error instanceof Error
            ? error
            : new Error("[pusherClient] Failed to parse local realtime payload")
        );
      }
    });

    this.socket.addEventListener("error", () => {
      this.connection.emit(
        "error",
        new Error("[pusherClient] Local realtime socket error")
      );
    });

    this.socket.addEventListener("close", () => {
      this.stopHeartbeat();
      this.setConnectionState("disconnected");
      this.connection.emit("disconnected");
      if (!this.destroyed) {
        this.scheduleReconnect();
      }
    });
  }

  private scheduleReconnect(): void {
    if (typeof window === "undefined" || this.destroyed) {
      return;
    }

    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
    }

    this.setConnectionState("connecting");
    this.connection.emit("connecting");

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
      this.reconnectDelayMs = Math.min(
        this.reconnectDelayMs * 2,
        MAX_RECONNECT_DELAY_MS
      );
    }, this.reconnectDelayMs);
  }

  private send(payload: unknown): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
      return;
    }

    this.connect();
  }
}

export function getPusherClient(): RealtimeClient {
  if (!globalWithPusher.__pusherClient) {
    if (getRealtimeProvider() === "local") {
      globalWithPusher.__pusherClient = new LocalRealtimeClient(
        getRealtimeWebSocketUrl()
      );
    } else {
      const Pusher = getPusherConstructor();
      globalWithPusher.__pusherClient = new Pusher(PUSHER_APP_KEY, {
        cluster: PUSHER_CLUSTER,
        forceTLS: PUSHER_FORCE_TLS,
      }) as unknown as RealtimeClient;
    }
  }
  return globalWithPusher.__pusherClient;
}

export function getRealtimeConnectionState(): RealtimeConnectionState {
  const client = globalWithPusher.__pusherClient;
  if (!client) return "disconnected";

  const conn = client.connection as
    | LocalRealtimeConnection
    | { state?: string };
  if (conn && typeof conn.state === "string") {
    const s = conn.state;
    if (s === "connected") return "connected";
    if (s === "connecting" || s === "initialized" || s === "unavailable")
      return "connecting";
    return "disconnected";
  }

  return "disconnected";
}

export type PusherChannel = Channel | RealtimeChannel;

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

export function subscribePusherChannel(channelName: string): PusherChannel {
  const normalizedChannelName = normalizeChannelName(channelName);
  if (!normalizedChannelName) {
    throw new Error("[pusherClient] channelName is required");
  }

  const pusher = getPusherClient();
  const counts = getChannelRefCounts();
  const currentCount = counts[normalizedChannelName] || 0;
  const existingChannel = pusher.channel(normalizedChannelName) as
    | PusherChannel
    | undefined;

  if (currentCount === 0) {
    const subscribedChannel = pusher.subscribe(normalizedChannelName) as PusherChannel;
    counts[normalizedChannelName] = 1;
    clearChannelRecoveryWarnings(normalizedChannelName);
    return subscribedChannel;
  }

  if (!existingChannel) {
    const subscribedChannel = pusher.subscribe(normalizedChannelName) as PusherChannel;
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

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    globalWithPusher.__pusherChannelRefCounts = {};
    globalWithPusher.__pusherChannelRecoveryWarnings = {};
    console.debug("[pusherClient] HMR: keeping connection alive");
  });
}
