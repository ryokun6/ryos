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

class LocalRealtimeConnection implements RealtimeConnection {
  private listeners = new Map<string, Set<ConnectionEventHandler>>();

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

class LocalRealtimeClient implements RealtimeClient {
  readonly connection = new LocalRealtimeConnection();

  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectDelayMs = 1000;
  private destroyed = false;
  private channels = new Map<string, LocalRealtimeChannel>();

  constructor(private readonly websocketUrl: string) {
    this.connect();
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
    if (typeof window !== "undefined" && this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
  }

  private connect(): void {
    if (typeof window === "undefined" || this.destroyed) {
      return;
    }

    if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
      return;
    }

    try {
      this.socket = new WebSocket(this.websocketUrl);
    } catch (error) {
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
      this.reconnectDelayMs = 1000;
      this.connection.emit("connected");
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

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
      this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, 10000);
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
