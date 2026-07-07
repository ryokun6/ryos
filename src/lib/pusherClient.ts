import type PusherType from "pusher-js";
import type { Channel } from "pusher-js";
import {
  getPusherRuntimeConfig,
  getRealtimeProvider,
  getRealtimeWebSocketUrl,
} from "@/utils/runtimeConfig";
import { getApiUrl } from "@/utils/platform";
import { createClientLogger } from "@/utils/logger";

const log = createClientLogger("PusherClient");

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
  refreshAuthentication?(): void;
}

const globalWithPusher = globalThis as typeof globalThis & {
  __pusherClient?: RealtimeClient;
  __pusherChannelRefCounts?: Record<string, number>;
  __pusherChannelRecoveryWarnings?: Record<string, true>;
  __pusherConnectionObservable?: RealtimeConnectionObservable;
  Pusher?: PusherConstructor;
};

type ChannelAuthorizationCallback = (
  error: Error | null,
  authData: unknown
) => void;

type ChannelAuthorizer = (channel: { name: string }) => {
  authorize: (socketId: string, callback: ChannelAuthorizationCallback) => void;
};

type PusherConstructor = new (
  key: string,
  options: {
    cluster: string;
    forceTLS: boolean;
    authorizer?: ChannelAuthorizer;
  }
) => PusherType;

/**
 * Authorizes private/presence channel subscriptions against `/api/pusher/auth`.
 * pusher-js only invokes this for `private-`/`presence-` channels; public
 * channels are unaffected. Credentials are included so the HttpOnly auth cookie
 * authenticates the request, mirroring every other authenticated API call.
 */
const createChannelAuthorizer = (): ChannelAuthorizer => {
  return (channel) => ({
    authorize: (socketId, callback) => {
      fetch(getApiUrl("/api/pusher/auth"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          socket_id: socketId,
          channel_name: channel.name,
        }),
      })
        .then(async (response) => {
          if (!response.ok) {
            callback(
              new Error(
                `[pusherClient] Channel authorization failed (${response.status})`
              ),
              null
            );
            return;
          }
          const data = await response.json();
          callback(null, data);
        })
        .catch((error) => {
          callback(
            error instanceof Error
              ? error
              : new Error("[pusherClient] Channel authorization error"),
            null
          );
        });
    },
  });
};

const pusherRuntimeConfig = getPusherRuntimeConfig();
const PUSHER_APP_KEY = pusherRuntimeConfig.key;
const PUSHER_CLUSTER = pusherRuntimeConfig.cluster;
const PUSHER_FORCE_TLS = pusherRuntimeConfig.forceTLS;

/**
 * Resolves the Pusher constructor, preferring the module default export and
 * falling back to a global `Pusher` (set by some script-tag builds). Throws
 * when neither is available. Exported for unit tests (see
 * tests/test-pusher-client-constructor-wiring.test.ts).
 */
export const getPusherConstructor = (
  PusherNamespace: unknown
): PusherConstructor => {
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

class DeferredRealtimeConnection implements RealtimeConnection {
  private delegate: RealtimeConnection | null = null;
  private pendingBinds: Array<{
    eventName: string;
    handler: ConnectionEventHandler;
  }> = [];

  state: RealtimeConnectionState = "connecting";

  bind(eventName: string, handler: ConnectionEventHandler): void {
    if (this.delegate) {
      this.delegate.bind(eventName, handler);
      return;
    }
    this.pendingBinds.push({ eventName, handler });
  }

  unbind(eventName?: string, handler?: ConnectionEventHandler): void {
    if (this.delegate) {
      this.delegate.unbind(eventName, handler);
    }

    if (!eventName) {
      this.pendingBinds = [];
      return;
    }

    if (!handler) {
      this.pendingBinds = this.pendingBinds.filter(
        (binding) => binding.eventName !== eventName
      );
      return;
    }

    this.pendingBinds = this.pendingBinds.filter(
      (binding) =>
        binding.eventName !== eventName || binding.handler !== handler
    );
  }

  emit(eventName: string, payload?: unknown): void {
    this.pendingBinds
      .filter((binding) => binding.eventName === eventName)
      .forEach((binding) => binding.handler(payload));
  }

  attach(connection: RealtimeConnection): void {
    this.delegate = connection;

    const updateState = (state: RealtimeConnectionState) => {
      this.state = state;
    };
    connection.bind("connected", () => updateState("connected"));
    connection.bind("connecting", () => updateState("connecting"));
    connection.bind("disconnected", () => updateState("disconnected"));

    if ("state" in connection && typeof connection.state === "string") {
      const currentState = connection.state;
      if (currentState === "connected") {
        this.state = "connected";
      } else if (
        currentState === "connecting" ||
        currentState === "initialized" ||
        currentState === "unavailable"
      ) {
        this.state = "connecting";
      } else {
        this.state = "disconnected";
      }
    }

    const pendingBinds = this.pendingBinds;
    this.pendingBinds = [];
    pendingBinds.forEach(({ eventName, handler }) => {
      connection.bind(eventName, handler);
    });
  }
}

class DeferredRealtimeChannel implements RealtimeChannel {
  readonly name: string;

  private delegate: RealtimeChannel | null = null;
  private pendingBinds: Array<{
    eventName: string;
    handler: ChannelEventHandler;
  }> = [];

  constructor(name: string) {
    this.name = name;
  }

  bind(eventName: string, handler: ChannelEventHandler): void {
    if (this.delegate) {
      this.delegate.bind(eventName, handler);
      return;
    }
    this.pendingBinds.push({ eventName, handler });
  }

  unbind(eventName?: string, handler?: ChannelEventHandler): void {
    if (this.delegate) {
      this.delegate.unbind(eventName, handler);
    }

    if (!eventName) {
      this.pendingBinds = [];
      return;
    }

    if (!handler) {
      this.pendingBinds = this.pendingBinds.filter(
        (binding) => binding.eventName !== eventName
      );
      return;
    }

    this.pendingBinds = this.pendingBinds.filter(
      (binding) =>
        binding.eventName !== eventName || binding.handler !== handler
    );
  }

  attach(channel: RealtimeChannel): void {
    this.delegate = channel;
    const pendingBinds = this.pendingBinds;
    this.pendingBinds = [];
    pendingBinds.forEach(({ eventName, handler }) => {
      channel.bind(eventName, handler);
    });
  }
}

/** Exported for unit tests (see tests/test-pusher-lazy-load.test.ts). */
export class DeferredPusherRealtimeClient implements RealtimeClient {
  readonly connection = new DeferredRealtimeConnection();

  private delegate: RealtimeClient | null = null;
  private channels = new Map<string, DeferredRealtimeChannel>();

  constructor(clientPromise: Promise<RealtimeClient>) {
    void clientPromise.then(
      (client) => {
        this.delegate = client;
        this.connection.attach(client.connection);
        for (const channel of this.channels.values()) {
          channel.attach(client.subscribe(channel.name));
        }
      },
      (error) => {
        this.connection.state = "disconnected";
        this.connection.emit(
          "error",
          error instanceof Error
            ? error
            : new Error("[pusherClient] Failed to load Pusher client")
        );
      }
    );
  }

  subscribe(channelName: string): RealtimeChannel {
    const existing = this.channels.get(channelName);
    if (existing) {
      return existing;
    }

    const channel = new DeferredRealtimeChannel(channelName);
    this.channels.set(channelName, channel);
    if (this.delegate) {
      channel.attach(this.delegate.subscribe(channelName));
    }
    return channel;
  }

  unsubscribe(channelName: string): void {
    this.channels.delete(channelName);
    this.delegate?.unsubscribe(channelName);
  }

  channel(channelName: string): RealtimeChannel | undefined {
    return this.channels.get(channelName);
  }
}

/**
 * Mint a single-use realtime auth ticket for the local WebSocket provider.
 * Returns null when unauthenticated or unavailable (public channels still work).
 */
const fetchLocalRealtimeTicket = async (): Promise<string | null> => {
  try {
    const response = await fetch(getApiUrl("/api/realtime/ticket"), {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { ticket?: string };
    return data?.ticket ?? null;
  } catch {
    return null;
  }
};

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;

export class LocalRealtimeClient implements RealtimeClient {
  readonly connection = new LocalRealtimeConnection();

  private socket: WebSocket | null = null;
  private socketId = 0;
  private reconnectTimer: number | null = null;
  private reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
  private destroyed = false;
  private channels = new Map<string, LocalRealtimeChannel>();
  private heartbeatTimer: number | null = null;
  private heartbeatTimeoutTimer: number | null = null;
  private boundVisibilityHandler: (() => void) | null = null;
  private boundOnlineHandler: (() => void) | null = null;
  private authenticationRefreshQueued = false;

  private isConnecting = false;

  constructor(
    private readonly websocketUrl: string,
    private readonly ticketProvider?: () => Promise<string | null>
  ) {
    this.connect();
    this.setupBrowserHandlers();
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

  refreshAuthentication(): void {
    if (
      typeof window === "undefined" ||
      this.destroyed ||
      this.authenticationRefreshQueued
    ) {
      return;
    }
    this.authenticationRefreshQueued = true;
    queueMicrotask(() => {
      this.authenticationRefreshQueued = false;
      if (this.destroyed) return;
      this.restartSocketForAuthentication();
    });
  }

  destroy(): void {
    this.destroyed = true;
    this.clearAllTimers();
    this.teardownBrowserHandlers();
    this.socket?.close();
    this.socket = null;
  }

  private setupBrowserHandlers(): void {
    if (typeof window === "undefined") return;

    this.boundVisibilityHandler = () => {
      if (document.visibilityState !== "visible" || this.destroyed) return;
      this.handleWakeUp();
    };

    this.boundOnlineHandler = () => {
      if (this.destroyed) return;
      this.handleWakeUp();
    };

    document.addEventListener("visibilitychange", this.boundVisibilityHandler);
    window.addEventListener("online", this.boundOnlineHandler);
  }

  private teardownBrowserHandlers(): void {
    if (typeof window === "undefined") return;

    if (this.boundVisibilityHandler) {
      document.removeEventListener(
        "visibilitychange",
        this.boundVisibilityHandler
      );
      this.boundVisibilityHandler = null;
    }

    if (this.boundOnlineHandler) {
      window.removeEventListener("online", this.boundOnlineHandler);
      this.boundOnlineHandler = null;
    }
  }

  private handleWakeUp(): void {
    if (
      !this.socket ||
      this.socket.readyState === WebSocket.CLOSED ||
      this.socket.readyState === WebSocket.CLOSING
    ) {
      this.cancelPendingReconnect();
      this.reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
      this.connect();
    } else if (this.socket.readyState === WebSocket.OPEN) {
      this.sendPing();
    }
  }

  private restartSocketForAuthentication(): void {
    const previousSocket = this.socket;
    this.socketId += 1;
    this.socket = null;
    this.isConnecting = false;
    this.stopHeartbeat();
    this.cancelPendingReconnect();
    this.reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;

    if (previousSocket && previousSocket.readyState <= WebSocket.OPEN) {
      previousSocket.close();
    }
    this.connect();
  }

  private cancelPendingReconnect(): void {
    if (typeof window === "undefined") return;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearAllTimers(): void {
    if (typeof window === "undefined") return;
    this.cancelPendingReconnect();
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
    if (this.connection.state === state) return;
    this.connection.state = state;
  }

  private connect(): void {
    if (typeof window === "undefined" || this.destroyed) {
      return;
    }

    if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
      return;
    }

    if (this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    this.cancelPendingReconnect();

    this.setConnectionState("connecting");
    this.connection.emit("connecting");

    void this.openSocket();
  }

  private async openSocket(): Promise<void> {
    const id = ++this.socketId;
    const isCurrentSocket = () => id === this.socketId && !this.destroyed;

    // Mint a single-use auth ticket so the server can authorize private-channel
    // subscriptions. Connecting without one still works for public channels.
    let url = this.websocketUrl;
    try {
      const ticket = this.ticketProvider ? await this.ticketProvider() : null;
      if (ticket) {
        const withTicket = new URL(this.websocketUrl);
        withTicket.searchParams.set("ticket", ticket);
        url = withTicket.toString();
      }
    } catch {
      // Fall back to an unauthenticated (public-only) connection.
    }

    if (!isCurrentSocket()) {
      return;
    }

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (error) {
      this.isConnecting = false;
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

    this.socket = ws;

    ws.addEventListener("open", () => {
      if (!isCurrentSocket()) return;
      this.isConnecting = false;
      this.reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
      this.setConnectionState("connected");
      this.connection.emit("connected");
      this.startHeartbeat();
      for (const channelName of this.channels.keys()) {
        this.send({ type: "subscribe", channel: channelName });
      }
    });

    ws.addEventListener("message", (event) => {
      if (!isCurrentSocket()) return;
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

        if (
          (payload.type === "subscription_succeeded" ||
            payload.type === "subscription_error") &&
          payload.channel
        ) {
          const eventName =
            payload.type === "subscription_succeeded"
              ? "pusher:subscription_succeeded"
              : "pusher:subscription_error";
          this.channels
            .get(payload.channel)
            ?.emit(eventName, payload.data ?? {});
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

    ws.addEventListener("error", () => {
      if (!isCurrentSocket()) return;
      this.connection.emit(
        "error",
        new Error("[pusherClient] Local realtime socket error")
      );
    });

    ws.addEventListener("close", () => {
      if (!isCurrentSocket()) return;
      this.isConnecting = false;
      this.stopHeartbeat();
      this.socket = null;
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

    this.cancelPendingReconnect();

    this.setConnectionState("connecting");
    this.connection.emit("connecting");

    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(delay * 2, MAX_RECONNECT_DELAY_MS);

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
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
        getRealtimeWebSocketUrl(),
        fetchLocalRealtimeTicket
      );
    } else {
      const pusherClientPromise = import("pusher-js").then((PusherNamespace) => {
        const Pusher = getPusherConstructor(PusherNamespace);
        return new Pusher(PUSHER_APP_KEY, {
          cluster: PUSHER_CLUSTER,
          forceTLS: PUSHER_FORCE_TLS,
          authorizer: createChannelAuthorizer(),
        }) as unknown as RealtimeClient;
      });
      globalWithPusher.__pusherClient = new DeferredPusherRealtimeClient(
        pusherClientPromise
      );
    }
  }
  return globalWithPusher.__pusherClient;
}

export function refreshRealtimeAuthentication(): void {
  globalWithPusher.__pusherClient?.refreshAuthentication?.();
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

// --- Shared connection-state observable -----------------------------------
//
// Several features (status indicator, cloud-sync catch-up, chat logging) need
// to react to realtime connection-state changes. Instead of each consumer
// binding its own `connected`/`connecting`/`disconnected` handlers on the
// client, they share a single observable that binds the three events once.

export type RealtimeConnectionListener = (
  state: RealtimeConnectionState
) => void;

type RealtimeConnectionObservable = {
  snapshot: RealtimeConnectionState;
  listeners: Set<RealtimeConnectionListener>;
  bound: boolean;
};

// Stored on globalThis (like the client itself) so HMR re-imports reuse the
// same listener set and never double-bind the connection events.
const getRealtimeConnectionObservable = (): RealtimeConnectionObservable => {
  if (!globalWithPusher.__pusherConnectionObservable) {
    globalWithPusher.__pusherConnectionObservable = {
      snapshot: "disconnected",
      listeners: new Set(),
      bound: false,
    };
  }
  return globalWithPusher.__pusherConnectionObservable;
};

const setRealtimeConnectionSnapshot = (
  state: RealtimeConnectionState
): void => {
  const observable = getRealtimeConnectionObservable();
  if (observable.snapshot === state) return;
  observable.snapshot = state;
  observable.listeners.forEach((listener) => listener(state));
};

const ensureRealtimeConnectionEventsBound = (): void => {
  const observable = getRealtimeConnectionObservable();
  if (observable.bound) return;
  observable.bound = true;

  // Binding early is safe: DeferredPusherRealtimeClient queues binds made
  // before pusher-js loads and replays them onto the real client.
  const client = getPusherClient();
  client.connection.bind("connected", () =>
    setRealtimeConnectionSnapshot("connected")
  );
  client.connection.bind("connecting", () =>
    setRealtimeConnectionSnapshot("connecting")
  );
  client.connection.bind("disconnected", () =>
    setRealtimeConnectionSnapshot("disconnected")
  );

  observable.snapshot = getRealtimeConnectionState();
};

/**
 * Current realtime connection state. Stable snapshot suitable for
 * `useSyncExternalStore`.
 */
export function getRealtimeConnectionSnapshot(): RealtimeConnectionState {
  const observable = getRealtimeConnectionObservable();
  // Until the events are bound (first subscriber), derive the state directly
  // from the client so read-only callers still see fresh data.
  return observable.bound ? observable.snapshot : getRealtimeConnectionState();
}

/**
 * Subscribe to realtime connection-state changes. The listener receives the
 * new state ("connected" | "connecting" | "disconnected") on every
 * transition. Returns an unsubscribe function.
 */
export function subscribeRealtimeConnection(
  listener: RealtimeConnectionListener
): () => void {
  ensureRealtimeConnectionEventsBound();
  const observable = getRealtimeConnectionObservable();
  observable.listeners.add(listener);
  return () => {
    observable.listeners.delete(listener);
  };
}

export type PusherChannel = Channel | RealtimeChannel;

const getChannelRefCounts = (): Record<string, number> => {
  if (!globalWithPusher.__pusherChannelRefCounts) {
    globalWithPusher.__pusherChannelRefCounts = {};
  }
  return globalWithPusher.__pusherChannelRefCounts;
};

/**
 * Names of the realtime channels currently subscribed (refcount > 0). Read-only
 * snapshot intended for diagnostics such as the in-app debug panel.
 */
export function getRealtimeChannelNames(): string[] {
  return Object.entries(getChannelRefCounts())
    .filter(([, count]) => count > 0)
    .map(([name]) => name)
    .sort();
}

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
    log.debug("HMR: keeping connection alive");
  });
}
