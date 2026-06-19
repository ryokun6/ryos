import type {
  BrowserWindow,
  IpcMain,
  Session,
  WebContents,
} from "electron";
import {
  getChatRoomChannelName,
  getChatsGlobalChannelName,
} from "../src/shared/constants/realtime";
import {
  normalizeChatTimestamp,
  type ChatMessage,
  type ChatRoom,
} from "../src/shared/contracts/chat";
import { decodeHtmlEntities } from "../src/utils/decodeHtmlEntities";
import {
  buildLocalRealtimeClientMessage,
  buildLocalRealtimeTicketWebSocketUrl,
} from "../src/utils/desktopChatNotificationRealtime";
import {
  sanitizeDesktopChatNotificationConfig,
  sanitizeDesktopChatNotificationState,
  shouldSubscribeRoomInMain,
  shouldUseMainChatNotificationService,
  getMainChatNotificationDecision,
  type DesktopChatNotificationConfig,
  type DesktopChatNotificationManageFailureReason,
  type DesktopChatNotificationManageResult,
  type DesktopChatNotificationRoom,
  type DesktopChatNotificationState,
} from "../src/utils/desktopChatNotificationPolicy";

type ChannelEventHandler = (data: unknown) => void;

type PusherChannel = {
  name: string;
  bind(eventName: string, handler: ChannelEventHandler): void;
  unbind(eventName?: string, handler?: ChannelEventHandler): void;
};

type PusherClient = {
  connection?: {
    state?: string;
    bind?(eventName: string, handler: () => void): void;
  };
  subscribe(channelName: string): PusherChannel;
  unsubscribe(channelName: string): void;
  disconnect?: () => void;
};

type RealtimeClient = PusherClient & {
  destroy?: () => void;
};

type LocalWebSocket = {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  on(eventName: "open", handler: () => void): LocalWebSocket;
  on(eventName: "message", handler: (data: unknown) => void): LocalWebSocket;
  on(eventName: "error", handler: (error: unknown) => void): LocalWebSocket;
  on(eventName: "close", handler: () => void): LocalWebSocket;
};

type LocalWebSocketConstructor = new (
  url: string,
  options?: { headers?: Record<string, string> }
) => LocalWebSocket;

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
) => PusherClient;

type ShowNotification = (
  options: Electron.NotificationConstructorOptions,
  onClick: () => void
) => boolean;

type ChatNotificationEvent =
  | { type: "room-created"; room: ChatRoom }
  | { type: "room-deleted"; roomId: string }
  | { type: "room-updated"; room: ChatRoom }
  | { type: "rooms-updated"; rooms: ChatRoom[] }
  | {
      type: "room-message";
      message: ChatMessage;
      incrementUnread: boolean;
      showInMain: boolean;
      showInRenderer: boolean;
    }
  | { type: "message-deleted"; roomId: string; messageId: string };

interface RegisterChatNotificationOptions {
  ipcMain: IpcMain;
  session: Session;
  getMainWindow: () => BrowserWindow | null;
  isTrustedWebContents: (contents: WebContents | null | undefined) => boolean;
  isAllowedAppUrl: (url: string) => boolean;
  isMainWindowForeground: () => boolean;
  focusMainWindow: () => void;
  showNotification: ShowNotification;
}

const MAX_SEEN_MESSAGE_IDS = 300;
const MAX_NOTIFICATION_PREVIEW_LENGTH = 80;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function upsertRoom(rooms: ChatRoom[], incomingRoom: ChatRoom): ChatRoom[] {
  const existingIndex = rooms.findIndex((room) => room.id === incomingRoom.id);
  if (existingIndex === -1) {
    return [...rooms, incomingRoom];
  }

  const nextRooms = [...rooms];
  nextRooms[existingIndex] = { ...rooms[existingIndex], ...incomingRoom };
  return nextRooms;
}

function removeRoom(rooms: ChatRoom[], roomId: string): ChatRoom[] {
  return rooms.filter((room) => room.id !== roomId);
}

function getRoomType(
  rooms: DesktopChatNotificationRoom[],
  roomId: string
): ChatRoom["type"] | undefined {
  return rooms.find((room) => room.id === roomId)?.type ?? undefined;
}

function isChatRoom(value: unknown): value is ChatRoom {
  return isRecord(value) && typeof value.id === "string";
}

function isChatMessage(value: unknown): value is ChatMessage {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.roomId === "string" &&
    typeof value.username === "string"
  );
}

function toNotificationPreview(content: unknown): string {
  const decoded = decodeHtmlEntities(String(content || ""));
  return decoded.replace(/\s+/g, " ").trim().slice(0, MAX_NOTIFICATION_PREVIEW_LENGTH);
}

function asPusherConstructor(namespace: unknown): PusherConstructor {
  const maybeNamespace = namespace as { default?: PusherConstructor };
  return maybeNamespace.default ?? (namespace as PusherConstructor);
}

const LOCAL_WEBSOCKET_OPEN = 1;
const LOCAL_REALTIME_HEARTBEAT_INTERVAL_MS = 30_000;
const LOCAL_REALTIME_HEARTBEAT_TIMEOUT_MS = 10_000;
const LOCAL_REALTIME_INITIAL_RECONNECT_DELAY_MS = 1_000;
const LOCAL_REALTIME_MAX_RECONNECT_DELAY_MS = 30_000;
const LOCAL_REALTIME_MAX_RECONNECT_FAILURES = 5;

function localWebSocketDataToString(data: unknown): string {
  if (typeof data === "string") {
    return data;
  }
  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }
  if (Array.isArray(data) && data.every((item) => Buffer.isBuffer(item))) {
    return Buffer.concat(data).toString("utf8");
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }
  return String(data);
}

class LocalRealtimeChannel implements PusherChannel {
  readonly name: string;

  private readonly listeners = new Map<string, Set<ChannelEventHandler>>();

  constructor(name: string) {
    this.name = name;
  }

  bind(eventName: string, handler: ChannelEventHandler): void {
    const listeners = this.listeners.get(eventName) ?? new Set();
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
    if (!listeners) {
      return;
    }
    listeners.delete(handler);
    if (listeners.size === 0) {
      this.listeners.delete(eventName);
    }
  }

  emit(eventName: string, payload: unknown): void {
    const listeners = this.listeners.get(eventName);
    if (!listeners) {
      return;
    }
    for (const listener of listeners) {
      listener(payload);
    }
  }
}

interface LocalRealtimeClientOptions {
  websocketUrl: string;
  appPublicOrigin: string;
  WebSocketConstructor: LocalWebSocketConstructor;
  fetchTicket: () => Promise<string>;
  onReady: () => void;
  onFatalError: (
    reason: DesktopChatNotificationManageFailureReason,
    error: unknown
  ) => void;
}

class LocalRealtimeClient implements RealtimeClient {
  private socket: LocalWebSocket | null = null;
  private socketId = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelayMs = LOCAL_REALTIME_INITIAL_RECONNECT_DELAY_MS;
  private reconnectFailures = 0;
  private connecting = false;
  private destroyed = false;
  private readonly channels = new Map<string, LocalRealtimeChannel>();

  constructor(private readonly options: LocalRealtimeClientOptions) {
    this.connect();
  }

  subscribe(channelName: string): PusherChannel {
    const existing = this.channels.get(channelName);
    if (existing) {
      this.sendSubscribe(channelName);
      return existing;
    }

    const channel = new LocalRealtimeChannel(channelName);
    this.channels.set(channelName, channel);
    this.sendSubscribe(channelName);
    return channel;
  }

  unsubscribe(channelName: string): void {
    this.channels.delete(channelName);
    this.send(
      buildLocalRealtimeClientMessage({
        type: "unsubscribe",
        channel: channelName,
      })
    );
  }

  disconnect(): void {
    this.destroy();
  }

  destroy(): void {
    this.destroyed = true;
    this.clearTimers();
    this.socket?.close();
    this.socket = null;
    this.channels.clear();
  }

  private connect(): void {
    if (this.destroyed || this.connecting) {
      return;
    }
    if (this.socket && this.socket.readyState <= LOCAL_WEBSOCKET_OPEN) {
      return;
    }

    this.connecting = true;
    this.clearReconnectTimer();
    void this.openSocket();
  }

  private async openSocket(): Promise<void> {
    const id = ++this.socketId;
    const isCurrentSocket = () => id === this.socketId && !this.destroyed;

    let ticket: string;
    try {
      ticket = await this.options.fetchTicket();
    } catch (error) {
      this.connecting = false;
      if (isCurrentSocket()) {
        this.fail("channel-auth-failed", error);
      }
      return;
    }

    if (!ticket.trim()) {
      this.connecting = false;
      if (isCurrentSocket()) {
        this.fail("channel-auth-failed", new Error("Missing realtime ticket"));
      }
      return;
    }

    if (!isCurrentSocket()) {
      this.connecting = false;
      return;
    }

    let socket: LocalWebSocket;
    try {
      socket = new this.options.WebSocketConstructor(
        buildLocalRealtimeTicketWebSocketUrl(this.options.websocketUrl, ticket),
        { headers: { Origin: this.options.appPublicOrigin } }
      );
    } catch (error) {
      this.connecting = false;
      if (isCurrentSocket()) {
        this.scheduleReconnectOrFail(error);
      }
      return;
    }

    this.socket = socket;
    let opened = false;

    socket.on("open", () => {
      if (!isCurrentSocket()) {
        return;
      }
      opened = true;
      this.connecting = false;
      this.reconnectFailures = 0;
      this.reconnectDelayMs = LOCAL_REALTIME_INITIAL_RECONNECT_DELAY_MS;
      this.startHeartbeat();
      for (const channelName of this.channels.keys()) {
        this.sendSubscribe(channelName);
      }
      this.options.onReady();
    });

    socket.on("message", (data) => {
      if (!isCurrentSocket()) {
        return;
      }
      this.handleMessage(data);
    });

    socket.on("error", (error) => {
      if (!isCurrentSocket()) {
        return;
      }
      console.warn("[electron] Local chat realtime socket error:", error);
    });

    socket.on("close", () => {
      if (!isCurrentSocket()) {
        return;
      }
      this.connecting = false;
      this.stopHeartbeat();
      this.socket = null;
      if (!this.destroyed) {
        if (!opened) {
          this.scheduleReconnectOrFail(new Error("Realtime socket closed"));
          return;
        }
        this.scheduleReconnect();
      }
    });
  }

  private handleMessage(data: unknown): void {
    let payload: {
      type?: string;
      channel?: string;
      event?: string;
      data?: unknown;
    };

    try {
      payload = JSON.parse(localWebSocketDataToString(data));
    } catch (error) {
      console.warn("[electron] Failed to parse local chat realtime payload:", error);
      return;
    }

    if (payload.type === "pong") {
      this.clearHeartbeatTimeout();
      return;
    }

    if (payload.type === "subscription_error" && payload.channel) {
      this.fail(
        "channel-auth-failed",
        new Error(`Realtime subscription denied for ${payload.channel}`)
      );
      return;
    }

    if (payload.type === "event" && payload.channel && payload.event) {
      this.channels.get(payload.channel)?.emit(payload.event, payload.data);
    }
  }

  private sendSubscribe(channelName: string): void {
    this.send(
      buildLocalRealtimeClientMessage({
        type: "subscribe",
        channel: channelName,
      })
    );
  }

  private send(message: string): void {
    if (this.socket?.readyState === LOCAL_WEBSOCKET_OPEN) {
      try {
        this.socket.send(message);
      } catch (error) {
        console.warn("[electron] Failed to send local realtime payload:", error);
      }
      return;
    }

    this.connect();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendPing();
    }, LOCAL_REALTIME_HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.clearHeartbeatTimeout();
  }

  private sendPing(): void {
    if (this.socket?.readyState !== LOCAL_WEBSOCKET_OPEN) {
      return;
    }

    try {
      this.socket.send(buildLocalRealtimeClientMessage({ type: "ping" }));
    } catch (error) {
      console.warn("[electron] Failed to send local realtime heartbeat:", error);
      return;
    }

    this.clearHeartbeatTimeout();
    this.heartbeatTimeoutTimer = setTimeout(() => {
      this.heartbeatTimeoutTimer = null;
      if (this.socket?.readyState === LOCAL_WEBSOCKET_OPEN) {
        this.socket.close();
      }
    }, LOCAL_REALTIME_HEARTBEAT_TIMEOUT_MS);
  }

  private scheduleReconnectOrFail(error: unknown): void {
    this.reconnectFailures += 1;
    if (this.reconnectFailures >= LOCAL_REALTIME_MAX_RECONNECT_FAILURES) {
      this.fail("service-start-failed", error);
      return;
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.destroyed) {
      return;
    }

    this.clearReconnectTimer();
    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(
      delay * 2,
      LOCAL_REALTIME_MAX_RECONNECT_DELAY_MS
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private clearTimers(): void {
    this.clearReconnectTimer();
    this.stopHeartbeat();
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private clearHeartbeatTimeout(): void {
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }

  private fail(
    reason: DesktopChatNotificationManageFailureReason,
    error: unknown
  ): void {
    if (this.destroyed) {
      return;
    }
    this.destroy();
    this.options.onFatalError(reason, error);
  }
}

export class ElectronChatNotificationService {
  private config: DesktopChatNotificationConfig | null = null;
  private state: DesktopChatNotificationState =
    sanitizeDesktopChatNotificationState(null);
  private realtimeClient: RealtimeClient | null = null;
  private globalChannel: PusherChannel | null = null;
  private readonly roomChannels = new Map<string, PusherChannel>();
  private readonly roomHandlers = new Map<
    string,
    {
      onRoomMessage: ChannelEventHandler;
      onMessageDeleted: ChannelEventHandler;
    }
  >();
  private readonly seenMessageIds: string[] = [];
  private readonly seenMessageIdSet = new Set<string>();
  private managed = false;
  private realtimeReady = false;
  private starting = false;
  private generation = 0;

  constructor(private readonly options: RegisterChatNotificationOptions) {}

  configure(
    configInput: unknown,
    stateInput: unknown
  ): DesktopChatNotificationManageResult {
    let nextConfig = sanitizeDesktopChatNotificationConfig(configInput);
    if (nextConfig && !this.options.isAllowedAppUrl(nextConfig.appPublicOrigin)) {
      nextConfig = null;
    }
    if (JSON.stringify(this.config) !== JSON.stringify(nextConfig)) {
      this.generation += 1;
      this.unsubscribeAll();
    }
    this.config = nextConfig;
    this.state = sanitizeDesktopChatNotificationState(stateInput);
    return this.reconcile();
  }

  updateState(stateInput: unknown): DesktopChatNotificationManageResult {
    this.state = sanitizeDesktopChatNotificationState(stateInput);
    return this.reconcile();
  }

  stop(): void {
    this.stopManagedService();
  }

  private reconcile(): DesktopChatNotificationManageResult {
    const result = shouldUseMainChatNotificationService(this.config, this.state);
    if (!result.managed) {
      this.stop();
      return result;
    }

    this.managed = true;
    void this.ensureRealtimeStarted(this.generation);
    this.reconcileRoomSubscriptions();
    return { managed: true, ready: this.isManagedServiceReady() };
  }

  private async ensureRealtimeStarted(generation: number): Promise<void> {
    if (!this.config || this.realtimeClient || this.starting) {
      return;
    }

    if (this.config.realtimeProvider === "local") {
      await this.ensureLocalRealtimeStarted(generation);
      return;
    }

    await this.ensurePusherStarted(generation);
  }

  private async ensurePusherStarted(generation: number): Promise<void> {
    if (this.realtimeClient || this.starting || !this.config?.pusher) {
      return;
    }

    this.starting = true;
    try {
      const namespace = await import("pusher-js");
      if (
        !this.managed ||
        generation !== this.generation ||
        !this.config?.pusher
      ) {
        return;
      }

      const Pusher = asPusherConstructor(namespace);
      this.realtimeReady = false;
      this.realtimeClient = new Pusher(this.config.pusher.key, {
        cluster: this.config.pusher.cluster,
        forceTLS: this.config.pusher.forceTLS,
        authorizer: this.createChannelAuthorizer(generation),
      });
      this.subscribeGlobal();
      this.reconcileRoomSubscriptions();
      this.bindPusherReadyStatus(generation);
    } catch (error) {
      console.warn("[electron] Failed to start chat notification service:", error);
      this.failManagedService("service-start-failed", generation);
    } finally {
      this.starting = false;
      if (
        this.managed &&
        !this.realtimeClient &&
        this.config?.pusher &&
        generation !== this.generation
      ) {
        void this.ensureRealtimeStarted(this.generation);
      }
    }
  }

  private async ensureLocalRealtimeStarted(generation: number): Promise<void> {
    if (
      this.realtimeClient ||
      this.starting ||
      !this.config?.websocketUrl ||
      this.config.realtimeProvider !== "local"
    ) {
      return;
    }

    this.starting = true;
    try {
      const namespace = await import("ws");
      const WebSocketConstructor = (namespace.default ??
        namespace.WebSocket) as LocalWebSocketConstructor;
      if (
        !this.managed ||
        generation !== this.generation ||
        !this.config?.websocketUrl ||
        this.config.realtimeProvider !== "local"
      ) {
        return;
      }

      this.realtimeReady = false;
      this.realtimeClient = new LocalRealtimeClient({
        websocketUrl: this.config.websocketUrl,
        appPublicOrigin: this.config.appPublicOrigin,
        WebSocketConstructor,
        fetchTicket: () => this.fetchLocalRealtimeTicket(generation),
        onReady: () => this.markRealtimeReady(generation),
        onFatalError: (reason, error) => {
          console.warn("[electron] Local chat realtime service failed:", error);
          this.failManagedService(reason, generation);
        },
      });
      this.subscribeGlobal();
      this.reconcileRoomSubscriptions();
    } catch (error) {
      console.warn(
        "[electron] Failed to start local chat notification service:",
        error
      );
      this.failManagedService("service-start-failed", generation);
    } finally {
      this.starting = false;
      if (
        this.managed &&
        !this.realtimeClient &&
        this.config?.realtimeProvider === "local" &&
        generation !== this.generation
      ) {
        void this.ensureRealtimeStarted(this.generation);
      }
    }
  }

  private createChannelAuthorizer(generation: number): ChannelAuthorizer {
    return (channel) => ({
      authorize: (socketId, callback) => {
        void this.authorizeChannel(socketId, channel.name, generation).then(
          (authData) => callback(null, authData),
          (error) =>
            callback(
              error instanceof Error
                ? error
                : new Error("Failed to authorize chat notification channel"),
              null
            )
        );
      },
    });
  }

  private async authorizeChannel(
    socketId: string,
    channelName: string,
    generation: number
  ): Promise<unknown> {
    if (!this.config || generation !== this.generation || !this.managed) {
      throw new Error("Missing chat notification config");
    }

    const appPublicOrigin = this.config.appPublicOrigin;
    const authUrl = new URL("/api/pusher/auth", appPublicOrigin);
    const cookies = await this.options.session.cookies.get({
      url: authUrl.toString(),
    });
    const cookieHeader = cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");

    let response: Response;
    try {
      response = await fetch(authUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: appPublicOrigin,
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
        body: JSON.stringify({
          socket_id: socketId,
          channel_name: channelName,
        }),
      });
    } catch (error) {
      this.failManagedService("channel-auth-failed", generation);
      throw error instanceof Error
        ? error
        : new Error("Failed to authorize chat notification channel");
    }

    if (!response.ok) {
      this.failManagedService("channel-auth-failed", generation);
      throw new Error(
        `Chat notification channel authorization failed (${response.status})`
      );
    }

    return response.json();
  }

  private async fetchLocalRealtimeTicket(generation: number): Promise<string> {
    if (!this.config || generation !== this.generation || !this.managed) {
      throw new Error("Missing chat notification config");
    }

    const appPublicOrigin = this.config.appPublicOrigin;
    const ticketUrl = new URL("/api/realtime/ticket", appPublicOrigin);
    const cookies = await this.options.session.cookies.get({
      url: ticketUrl.toString(),
    });
    const cookieHeader = cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join("; ");

    let response: Response;
    try {
      response = await fetch(ticketUrl.toString(), {
        method: "POST",
        headers: {
          Origin: appPublicOrigin,
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        },
      });
    } catch (error) {
      this.failManagedService("channel-auth-failed", generation);
      throw error instanceof Error
        ? error
        : new Error("Failed to fetch realtime ticket");
    }

    if (!response.ok) {
      this.failManagedService("channel-auth-failed", generation);
      throw new Error(`Realtime ticket request failed (${response.status})`);
    }

    const data = (await response.json()) as { ticket?: unknown };
    if (typeof data.ticket !== "string" || !data.ticket.trim()) {
      this.failManagedService("channel-auth-failed", generation);
      throw new Error("Realtime ticket response was missing a ticket");
    }

    return data.ticket;
  }

  private subscribeGlobal(): void {
    if (!this.realtimeClient || !this.state.username) {
      return;
    }

    const channelName = getChatsGlobalChannelName(this.state.username);
    if (this.globalChannel?.name === channelName) {
      return;
    }

    if (this.globalChannel) {
      this.realtimeClient.unsubscribe(this.globalChannel.name);
      this.globalChannel = null;
    }

    const channel = this.realtimeClient.subscribe(channelName);
    channel.bind("room-created", (data) => this.handleRoomCreated(data));
    channel.bind("room-deleted", (data) => this.handleRoomDeleted(data));
    channel.bind("room-updated", (data) => this.handleRoomUpdated(data));
    channel.bind("rooms-updated", (data) => this.handleRoomsUpdated(data));
    this.globalChannel = channel;
  }

  private reconcileRoomSubscriptions(): void {
    if (!this.realtimeClient) {
      return;
    }

    this.subscribeGlobal();

    const desiredRooms = new Map(
      this.state.rooms
        .filter((room) => shouldSubscribeRoomInMain(room, this.state))
        .map((room) => [room.id, room])
    );

    for (const room of desiredRooms.values()) {
      if (this.roomChannels.has(room.id)) {
        continue;
      }

      const channel = this.realtimeClient.subscribe(
        getChatRoomChannelName(room.id, room.type)
      );
      const handlers = {
        onRoomMessage: (data: unknown) => this.handleRoomMessage(data),
        onMessageDeleted: (data: unknown) => this.handleMessageDeleted(data),
      };
      channel.bind("room-message", handlers.onRoomMessage);
      channel.bind("message-deleted", handlers.onMessageDeleted);
      this.roomChannels.set(room.id, channel);
      this.roomHandlers.set(room.id, handlers);
    }

    for (const [roomId, channel] of this.roomChannels) {
      if (desiredRooms.has(roomId)) {
        continue;
      }

      const handlers = this.roomHandlers.get(roomId);
      if (handlers) {
        channel.unbind("room-message", handlers.onRoomMessage);
        channel.unbind("message-deleted", handlers.onMessageDeleted);
      }
      this.realtimeClient.unsubscribe(channel.name);
      this.roomChannels.delete(roomId);
      this.roomHandlers.delete(roomId);
    }
  }

  private handleRoomCreated(data: unknown): void {
    if (!isRecord(data) || !isChatRoom(data.room)) {
      return;
    }
    this.state.rooms = upsertRoom(this.state.rooms as ChatRoom[], data.room);
    this.sendToRenderer({ type: "room-created", room: data.room });
    this.reconcileRoomSubscriptions();
  }

  private handleRoomDeleted(data: unknown): void {
    if (!isRecord(data) || typeof data.roomId !== "string") {
      return;
    }
    this.state.rooms = removeRoom(this.state.rooms as ChatRoom[], data.roomId);
    this.sendToRenderer({ type: "room-deleted", roomId: data.roomId });
    this.reconcileRoomSubscriptions();
  }

  private handleRoomUpdated(data: unknown): void {
    if (!isRecord(data) || !isChatRoom(data.room)) {
      return;
    }
    this.state.rooms = upsertRoom(this.state.rooms as ChatRoom[], data.room);
    this.sendToRenderer({ type: "room-updated", room: data.room });
    this.reconcileRoomSubscriptions();
  }

  private handleRoomsUpdated(data: unknown): void {
    if (!isRecord(data) || !Array.isArray(data.rooms)) {
      return;
    }
    const rooms = data.rooms.filter(isChatRoom);
    this.state.rooms = rooms;
    this.sendToRenderer({ type: "rooms-updated", rooms });
    this.reconcileRoomSubscriptions();
  }

  private handleRoomMessage(data: unknown): void {
    if (!isRecord(data) || !isChatMessage(data.message)) {
      return;
    }

    const message: ChatMessage = {
      ...data.message,
      timestamp: normalizeChatTimestamp(data.message.timestamp),
    };
    if (this.rememberMessage(message.id)) {
      return;
    }

    const decision = getMainChatNotificationDecision({
      chatsOpen: this.state.chatsOpen,
      currentRoomId: this.state.currentRoomId,
      messageRoomId: message.roomId,
      mainWindowForeground: this.options.isMainWindowForeground(),
    });

    this.sendToRenderer({
      type: "room-message",
      message,
      incrementUnread: decision.incrementUnread,
      showInMain: decision.showInMain,
      showInRenderer: decision.showInRenderer,
    });

    if (!decision.showInMain) {
      return;
    }

    const roomType = getRoomType(this.state.rooms, message.roomId);
    const channelName = getChatRoomChannelName(message.roomId, roomType);
    const body = toNotificationPreview(message.content);
    this.options.showNotification(
      {
        title: `@${message.username}`,
        body,
        tag: `chat-${channelName}`,
      },
      () => this.openChatRoom(message.roomId)
    );
  }

  private handleMessageDeleted(data: unknown): void {
    if (
      !isRecord(data) ||
      typeof data.roomId !== "string" ||
      typeof data.messageId !== "string"
    ) {
      return;
    }
    this.sendToRenderer({
      type: "message-deleted",
      roomId: data.roomId,
      messageId: data.messageId,
    });
  }

  private rememberMessage(messageId: string): boolean {
    if (this.seenMessageIdSet.has(messageId)) {
      return true;
    }

    this.seenMessageIdSet.add(messageId);
    this.seenMessageIds.push(messageId);

    while (this.seenMessageIds.length > MAX_SEEN_MESSAGE_IDS) {
      const expired = this.seenMessageIds.shift();
      if (expired) {
        this.seenMessageIdSet.delete(expired);
      }
    }

    return false;
  }

  private openChatRoom(roomId: string | null): void {
    this.options.focusMainWindow();
    this.sendToRenderer("ryos-desktop:open-chat-room-from-notification", roomId);
  }

  private failManagedService(
    reason: DesktopChatNotificationManageFailureReason,
    generation: number
  ): void {
    if (!this.managed || generation !== this.generation) {
      return;
    }

    this.stopManagedService();
    this.sendStatus({ managed: false, reason });
  }

  private bindPusherReadyStatus(generation: number): void {
    const connection = this.realtimeClient?.connection;
    if (!connection?.bind) {
      this.markRealtimeReady(generation);
      return;
    }

    connection.bind("connected", () => this.markRealtimeReady(generation));
    if (connection.state === "connected") {
      this.markRealtimeReady(generation);
    }
  }

  private markRealtimeReady(generation: number): void {
    if (!this.managed || generation !== this.generation) {
      return;
    }

    this.realtimeReady = true;
    this.reconcileRoomSubscriptions();
    this.sendStatus({ managed: true, ready: true });
  }

  private isManagedServiceReady(): boolean {
    return Boolean(this.managed && this.realtimeReady && this.realtimeClient);
  }

  private stopManagedService(): void {
    this.managed = false;
    this.generation += 1;
    this.unsubscribeAll();
  }

  private sendStatus(status: DesktopChatNotificationManageResult): void {
    this.sendToRenderer("ryos-desktop:chat-notification-status", status);
  }

  private sendToRenderer(event: ChatNotificationEvent): void;
  private sendToRenderer(channel: string, payload: unknown): void;
  private sendToRenderer(
    eventOrChannel: ChatNotificationEvent | string,
    payload?: unknown
  ): void {
    const win = this.options.getMainWindow();
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) {
      return;
    }

    if (typeof eventOrChannel === "string") {
      win.webContents.send(eventOrChannel, payload);
      return;
    }

    win.webContents.send("ryos-desktop:chat-notification-event", eventOrChannel);
  }

  private unsubscribeAll(): void {
    if (this.realtimeClient) {
      if (this.globalChannel) {
        this.realtimeClient.unsubscribe(this.globalChannel.name);
      }

      for (const channel of this.roomChannels.values()) {
        this.realtimeClient.unsubscribe(channel.name);
      }

      this.realtimeClient.disconnect?.();
      this.realtimeClient.destroy?.();
    }

    this.realtimeClient = null;
    this.realtimeReady = false;
    this.globalChannel = null;
    this.roomChannels.clear();
    this.roomHandlers.clear();
  }
}

export function registerChatNotificationIpcHandlers(
  options: RegisterChatNotificationOptions
): ElectronChatNotificationService {
  const service = new ElectronChatNotificationService(options);

  options.ipcMain.handle(
    "ryos-desktop:chat-notifications-configure",
    (event, config: unknown, state: unknown) => {
      if (!options.isTrustedWebContents(event.sender)) {
        return { managed: false, reason: "invalid-config" };
      }
      return service.configure(config, state);
    }
  );

  options.ipcMain.handle(
    "ryos-desktop:chat-notifications-update-state",
    (event, state: unknown) => {
      if (!options.isTrustedWebContents(event.sender)) {
        return { managed: false, reason: "invalid-config" };
      }
      return service.updateState(state);
    }
  );

  options.ipcMain.handle("ryos-desktop:chat-notifications-stop", (event) => {
    if (options.isTrustedWebContents(event.sender)) {
      service.stop();
    }
  });

  return service;
}
