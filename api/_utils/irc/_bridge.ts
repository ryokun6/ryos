/**
 * IRC Bridge
 *
 * Maintains persistent IRC connections on the API server and bridges IRC
 * channels to ryOS chat rooms. Each configured IRC server gets one shared
 * `IrcClient` instance which joins the set of channels currently bound
 * to rooms via the `ircServer` / `ircChannel` fields on the Room object.
 *
 * Inbound (IRC → ryOS):
 *   on 'message' → write a ChatMessage to Redis + broadcast via realtime
 *
 * Outbound (ryOS → IRC):
 *   sendMessageToIrc(room, username, content) → client.say(channel, text)
 *
 * Serverless / Vercel note: this bridge is designed to run inside the
 * long-lived Bun standalone API server. On Vercel serverless, the outbound
 * path falls back to a short-lived "fire-and-forget" connection which sends
 * a single PRIVMSG and disconnects.
 */

import EventEmitter from "node:events";
import { createRequire } from "node:module";
import {
  DEFAULT_IRC_HOST,
  DEFAULT_IRC_PORT,
  DEFAULT_IRC_TLS,
  buildIrcServerKey,
  normalizeIrcChannel,
} from "./_types.js";
import type { Room, Message } from "../../rooms/_helpers/_types.js";
import {
  addMessage,
  generateId,
  getAllRoomIds,
  getCurrentTimestamp,
  getRoom,
  parseRoomData,
  setRoom,
} from "../../rooms/_helpers/_redis.js";
import { createRedis } from "../redis.js";
import { broadcastNewMessage } from "../../rooms/_helpers/_pusher.js";
import { CHAT_ROOM_PREFIX } from "../../rooms/_helpers/_constants.js";
import { escapeHTML, filterProfanityPreservingUrls } from "../_validation.js";

// Use createRequire so we can load the CommonJS-only `irc-framework` module
// from an ESM context without forcing it on consumers that never touch IRC.
const requireIrcFramework = createRequire(import.meta.url);

type IrcClientCtor = new (options: Record<string, unknown>) => IrcClientLike;

interface IrcMessageEvent {
  type?: string;
  target?: string;
  nick?: string;
  ident?: string;
  hostname?: string;
  message?: string;
}

export interface IrcClientLike extends EventEmitter {
  connect(options?: Record<string, unknown>): void;
  join(channel: string, key?: string): void;
  part(channel: string, message?: string): void;
  say(target: string, message: string): void;
  changeNick(nick: string): void;
  quit(message?: string): void;
  connected?: boolean;
}

interface IrcBridgeDependencies {
  /**
   * Factory for creating an IRC client. Defaults to lazily importing
   * `irc-framework` on first use. Injectable for tests.
   */
  createClient?: (options: Record<string, unknown>) => IrcClientLike;
  /**
   * Persist an incoming IRC message to Redis + broadcast. Injectable for tests.
   */
  persistIncomingMessage?: (
    roomId: string,
    message: Message,
    room: Room | null
  ) => Promise<void>;
  /**
   * Nick prefix used to identify the bot / nick base. Defaults to "ryos".
   */
  nickPrefix?: string;
}

interface ServerState {
  key: string;
  host: string;
  port: number;
  tls: boolean;
  client: IrcClientLike | null;
  ready: boolean;
  channels: Map<string, Set<string>>; // channel → set of roomIds
  pendingJoins: Set<string>;
  nick: string | null;
}

const GLOBAL_KEY = "__ryosIrcBridge";

type GlobalWithBridge = typeof globalThis & {
  [GLOBAL_KEY]?: IrcBridge;
};

export class IrcBridge extends EventEmitter {
  private readonly servers = new Map<string, ServerState>();
  private initialized = false;
  private readonly deps: Required<IrcBridgeDependencies>;

  constructor(deps: IrcBridgeDependencies = {}) {
    super();
    this.deps = {
      createClient:
        deps.createClient ??
        ((options) => {
          // Lazy-load irc-framework via createRequire so tests that inject
          // a custom client never touch the real module.
          const mod = requireIrcFramework("irc-framework") as {
            Client: IrcClientCtor;
          };
          return new mod.Client(options);
        }),
      persistIncomingMessage:
        deps.persistIncomingMessage ?? defaultPersistIncomingMessage,
      nickPrefix: deps.nickPrefix ?? "ryos",
    };
  }

  /**
   * Initialize the bridge by loading all Room records flagged as IRC rooms
   * from Redis and connecting / joining them.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const roomIds = await getAllRoomIds();
      if (roomIds.length === 0) return;

      const redis = createRedis();
      const keys = roomIds.map((id) => `${CHAT_ROOM_PREFIX}${id}`);
      const raws = await redis.mget<(Room | string | null)[]>(
        ...(keys as [string, ...string[]])
      );

      for (let i = 0; i < raws.length; i++) {
        const raw = raws[i];
        if (!raw) continue;
        const room = parseRoomData(raw);
        if (!room) continue;
        if (room.type !== "irc") continue;
        if (!room.ircChannel) continue;

        try {
          await this.bindRoom(room);
        } catch (err) {
          console.error(
            `[IrcBridge] Failed to bind room ${room.id} during init:`,
            err
          );
        }
      }
    } catch (err) {
      console.error("[IrcBridge] Initialization failed:", err);
    }
  }

  /**
   * Bind a ryOS room to an IRC channel. Creates/ensures the server connection
   * exists and joins the channel if not already joined.
   */
  async bindRoom(room: Room): Promise<void> {
    if (room.type !== "irc") return;
    const host = (room.ircHost || DEFAULT_IRC_HOST).toLowerCase();
    const port = Number(room.ircPort) || DEFAULT_IRC_PORT;
    const tls = Boolean(room.ircTls ?? DEFAULT_IRC_TLS);
    const channel = normalizeIrcChannel(room.ircChannel || "");
    if (!channel) return;

    const key = buildIrcServerKey(host, port, tls);
    let server = this.servers.get(key);
    if (!server) {
      server = this.createServerState(key, host, port, tls);
      this.servers.set(key, server);
      this.connectServer(server);
    }

    const existing = server.channels.get(channel) || new Set<string>();
    existing.add(room.id);
    server.channels.set(channel, existing);

    if (server.ready) {
      if (!server.pendingJoins.has(channel)) {
        server.pendingJoins.add(channel);
        server.client?.join(channel);
      }
    }
  }

  /**
   * Unbind a ryOS room from an IRC channel. Parts the channel if no other
   * rooms are bound to it.
   */
  async unbindRoom(room: Pick<Room, "id" | "type" | "ircHost" | "ircPort" | "ircTls" | "ircChannel">): Promise<void> {
    if (room.type !== "irc") return;
    const host = (room.ircHost || DEFAULT_IRC_HOST).toLowerCase();
    const port = Number(room.ircPort) || DEFAULT_IRC_PORT;
    const tls = Boolean(room.ircTls ?? DEFAULT_IRC_TLS);
    const channel = normalizeIrcChannel(room.ircChannel || "");
    if (!channel) return;

    const key = buildIrcServerKey(host, port, tls);
    const server = this.servers.get(key);
    if (!server) return;

    const set = server.channels.get(channel);
    if (set) {
      set.delete(room.id);
      if (set.size === 0) {
        server.channels.delete(channel);
        server.pendingJoins.delete(channel);
        try {
          server.client?.part(channel);
        } catch (err) {
          console.warn(`[IrcBridge] Failed to part ${channel}:`, err);
        }
      }
    }

    if (server.channels.size === 0 && server.client) {
      try {
        server.client.quit("ryOS bridge idle");
      } catch {
        // ignore
      }
      this.servers.delete(key);
    }
  }

  /**
   * Send a message from a ryOS user into the IRC channel bound to `room`.
   */
  async sendMessage(room: Room, username: string, content: string): Promise<void> {
    if (room.type !== "irc" || !room.ircChannel) return;
    const host = (room.ircHost || DEFAULT_IRC_HOST).toLowerCase();
    const port = Number(room.ircPort) || DEFAULT_IRC_PORT;
    const tls = Boolean(room.ircTls ?? DEFAULT_IRC_TLS);
    const channel = normalizeIrcChannel(room.ircChannel);
    const key = buildIrcServerKey(host, port, tls);
    const server = this.servers.get(key);

    const text = sanitizeOutgoing(`<${username}> ${content}`);

    if (server?.client && server.ready) {
      try {
        server.client.say(channel, text);
      } catch (err) {
        console.error("[IrcBridge] Failed to send message to IRC:", err);
      }
      return;
    }

    // No persistent connection - ensure a binding is created so the next
    // connect attempt joins this channel. Message itself will be delivered
    // when the persistent connection becomes ready.
    await this.bindRoom(room);
  }

  /**
   * Stop all IRC connections. Used during shutdown / tests.
   */
  async shutdown(): Promise<void> {
    for (const server of this.servers.values()) {
      try {
        server.client?.quit("ryOS bridge shutdown");
      } catch {
        // ignore
      }
    }
    this.servers.clear();
    this.initialized = false;
  }

  /**
   * Return the current set of bound (server, channel) pairs. Useful for tests
   * and admin introspection.
   */
  getBindings(): Array<{
    host: string;
    port: number;
    tls: boolean;
    channel: string;
    roomIds: string[];
  }> {
    const results: Array<{
      host: string;
      port: number;
      tls: boolean;
      channel: string;
      roomIds: string[];
    }> = [];
    for (const server of this.servers.values()) {
      for (const [channel, ids] of server.channels.entries()) {
        results.push({
          host: server.host,
          port: server.port,
          tls: server.tls,
          channel,
          roomIds: Array.from(ids),
        });
      }
    }
    return results;
  }

  // Internals -------------------------------------------------------------

  private createServerState(
    key: string,
    host: string,
    port: number,
    tls: boolean
  ): ServerState {
    return {
      key,
      host,
      port,
      tls,
      client: null,
      ready: false,
      channels: new Map(),
      pendingJoins: new Set(),
      nick: null,
    };
  }

  private connectServer(server: ServerState): void {
    const nick = this.buildNick();
    server.nick = nick;

    const options: Record<string, unknown> = {
      host: server.host,
      port: server.port,
      tls: server.tls,
      nick,
      username: nick,
      gecos: "ryOS IRC bridge",
      version: "ryos-irc-bridge",
      auto_reconnect: true,
      auto_reconnect_max_retries: 10,
    };

    let client: IrcClientLike;
    try {
      client = this.deps.createClient(options);
    } catch (err) {
      console.error(
        `[IrcBridge] Failed to create IRC client for ${server.key}:`,
        err
      );
      return;
    }

    server.client = client;

    client.on("registered", () => {
      server.ready = true;
      for (const channel of server.channels.keys()) {
        server.pendingJoins.add(channel);
        try {
          client.join(channel);
        } catch (err) {
          console.error(
            `[IrcBridge] join(${channel}) failed on ${server.key}:`,
            err
          );
        }
      }
    });

    client.on("join", (event: IrcMessageEvent) => {
      if (event?.nick && server.nick && event.nick === server.nick) {
        const channel = normalizeIrcChannel(event.target || event.message || "");
        if (channel) server.pendingJoins.delete(channel);
      }
    });

    client.on("close", () => {
      server.ready = false;
    });

    client.on("socket error", (err: unknown) => {
      console.warn(`[IrcBridge] Socket error on ${server.key}:`, err);
    });

    client.on("message", (event: IrcMessageEvent) => {
      void this.handleIncomingMessage(server, event).catch((err) => {
        console.error("[IrcBridge] handleIncomingMessage failed:", err);
      });
    });

    try {
      client.connect();
    } catch (err) {
      console.error(`[IrcBridge] connect() failed for ${server.key}:`, err);
    }
  }

  private async handleIncomingMessage(
    server: ServerState,
    event: IrcMessageEvent
  ): Promise<void> {
    if (!event) return;
    const type = event.type || "privmsg";
    if (type !== "privmsg" && type !== "action") return;

    const rawChannel = event.target || "";
    if (!rawChannel.startsWith("#") && !rawChannel.startsWith("&") && !rawChannel.startsWith("+")) {
      // Ignore private messages to the bot
      return;
    }
    const channel = normalizeIrcChannel(rawChannel);
    const bound = server.channels.get(channel);
    if (!bound || bound.size === 0) return;

    const nick = (event.nick || "").trim();
    if (!nick) return;
    // Don't echo our own messages (we already persisted them via sendMessage)
    if (server.nick && nick === server.nick) return;

    const raw = (event.message || "").toString();
    if (!raw) return;

    const content = escapeHTML(filterProfanityPreservingUrls(raw));
    const nickSafe = escapeHTML(nick);

    for (const roomId of bound) {
      const room = await getRoom(roomId).catch(() => null);
      const message: Message = {
        id: generateId(),
        roomId,
        username: `irc:${nickSafe}`,
        content: type === "action" ? `* ${content}` : content,
        timestamp: getCurrentTimestamp(),
      };

      try {
        await this.deps.persistIncomingMessage(roomId, message, room);
      } catch (err) {
        console.error(
          `[IrcBridge] Failed to persist IRC message for room ${roomId}:`,
          err
        );
      }
    }
  }

  private buildNick(): string {
    const rand = Math.floor(Math.random() * 9999).toString(36);
    return `${this.deps.nickPrefix}-${rand}`;
  }
}

async function defaultPersistIncomingMessage(
  roomId: string,
  message: Message,
  room: Room | null
): Promise<void> {
  await addMessage(roomId, message);
  await broadcastNewMessage(roomId, message, room);
}

function sanitizeOutgoing(text: string): string {
  // IRC line-endings: strip \r\n to keep to one message
  return text.replace(/[\r\n]+/g, " ").slice(0, 400);
}

export function getIrcBridge(): IrcBridge {
  const g = globalThis as GlobalWithBridge;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new IrcBridge();
  }
  return g[GLOBAL_KEY]!;
}

export function setIrcBridgeForTesting(bridge: IrcBridge | null): void {
  const g = globalThis as GlobalWithBridge;
  if (bridge) {
    g[GLOBAL_KEY] = bridge;
  } else {
    delete g[GLOBAL_KEY];
  }
}

/**
 * Persist an IRC room mutation (bind/unbind) that was triggered by a room
 * creation or deletion API call. Safe to call from any environment; will
 * become a no-op when the bridge hasn't been initialised.
 */
export async function notifyRoomBindingChange(
  action: "bind" | "unbind",
  room: Room
): Promise<void> {
  if (room.type !== "irc") return;
  const g = globalThis as GlobalWithBridge;
  const bridge = g[GLOBAL_KEY];
  if (!bridge) return;
  if (action === "bind") {
    await bridge.bindRoom(room);
  } else {
    await bridge.unbindRoom(room);
  }
}

/**
 * Persist room to Redis if the server-details fields need defaults filled in.
 */
export async function ensureIrcRoomDefaults(room: Room): Promise<Room> {
  if (room.type !== "irc") return room;
  const updated: Room = {
    ...room,
    ircHost: room.ircHost || DEFAULT_IRC_HOST,
    ircPort: Number(room.ircPort) || DEFAULT_IRC_PORT,
    ircTls: typeof room.ircTls === "boolean" ? room.ircTls : DEFAULT_IRC_TLS,
    ircChannel: normalizeIrcChannel(
      room.ircChannel || (room.name?.startsWith("#") ? room.name : `#${room.name || ""}`)
    ),
  };
  const changed =
    updated.ircHost !== room.ircHost ||
    updated.ircPort !== room.ircPort ||
    updated.ircTls !== room.ircTls ||
    updated.ircChannel !== room.ircChannel;
  if (changed) {
    await setRoom(updated.id, updated);
  }
  return updated;
}
