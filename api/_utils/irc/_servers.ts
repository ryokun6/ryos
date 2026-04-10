/**
 * IRC server registry
 *
 * Stores user-configured IRC servers in Redis so the Chats app can
 * present a server picker in the IRC tab. The default `irc.pieter.com`
 * is auto-seeded on first read so users always have at least one option
 * to select.
 *
 * Storage layout:
 *   chat:irc:server:<id>      → JSON-encoded `IrcServer`
 *   chat:irc:servers          → SET of server ids
 */

import { createRedis } from "../redis.js";
import {
  DEFAULT_IRC_HOST,
  DEFAULT_IRC_PORT,
  DEFAULT_IRC_TLS,
} from "./_types.js";

export const IRC_SERVER_PREFIX = "chat:irc:server:";
export const IRC_SERVERS_SET = "chat:irc:servers";

export interface IrcServer {
  id: string;
  label: string;
  host: string;
  port: number;
  tls: boolean;
  isDefault?: boolean;
  createdAt: number;
}

const DEFAULT_SERVER_ID = "default-pieter";

const DEFAULT_SERVER: IrcServer = {
  id: DEFAULT_SERVER_ID,
  label: "irc.pieter.com",
  host: DEFAULT_IRC_HOST,
  port: DEFAULT_IRC_PORT,
  tls: DEFAULT_IRC_TLS,
  isDefault: true,
  createdAt: 0,
};

function getRedis() {
  return createRedis();
}

export function generateIrcServerId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function parseServerData(raw: unknown): IrcServer | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as IrcServer;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as IrcServer;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Persist a server record + add it to the registry set.
 */
export async function setIrcServer(server: IrcServer): Promise<void> {
  const redis = getRedis();
  await redis.set(`${IRC_SERVER_PREFIX}${server.id}`, JSON.stringify(server));
  await redis.sadd(IRC_SERVERS_SET, server.id);
}

export async function getIrcServer(id: string): Promise<IrcServer | null> {
  const redis = getRedis();
  const raw = await redis.get(`${IRC_SERVER_PREFIX}${id}`);
  return parseServerData(raw);
}

export async function deleteIrcServer(id: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`${IRC_SERVER_PREFIX}${id}`);
  await redis.srem(IRC_SERVERS_SET, id);
}

/**
 * List all stored IRC servers, auto-seeding the default `irc.pieter.com`
 * record on first call so the UI always has at least one entry to select.
 */
export async function listIrcServers(): Promise<IrcServer[]> {
  const redis = getRedis();
  let ids = (await redis.smembers<string[]>(IRC_SERVERS_SET)) || [];

  if (!ids.includes(DEFAULT_SERVER_ID)) {
    const seed: IrcServer = { ...DEFAULT_SERVER, createdAt: Date.now() };
    await setIrcServer(seed);
    ids = await redis.smembers<string[]>(IRC_SERVERS_SET);
  }

  if (ids.length === 0) return [];

  const keys = ids.map((id) => `${IRC_SERVER_PREFIX}${id}`);
  const raws = await redis.mget<(IrcServer | string | null)[]>(
    ...(keys as [string, ...string[]])
  );

  const servers: IrcServer[] = [];
  for (let i = 0; i < raws.length; i++) {
    const parsed = parseServerData(raws[i]);
    if (parsed) servers.push(parsed);
  }

  // Stable sort: default first, then label asc.
  servers.sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return a.label.localeCompare(b.label);
  });

  return servers;
}

/**
 * Validate user-supplied server fields. Returns a normalized server (no id /
 * createdAt yet) on success, or an error message.
 */
export function normalizeIrcServerInput(input: {
  label?: unknown;
  host?: unknown;
  port?: unknown;
  tls?: unknown;
}): { ok: true; value: Omit<IrcServer, "id" | "createdAt"> } | { ok: false; error: string } {
  const label = typeof input.label === "string" ? input.label.trim() : "";
  const host = typeof input.host === "string" ? input.host.trim().toLowerCase() : "";
  const portRaw = input.port;
  const port =
    typeof portRaw === "number"
      ? portRaw
      : typeof portRaw === "string"
        ? parseInt(portRaw, 10)
        : NaN;
  const tls = Boolean(input.tls);

  if (!host) {
    return { ok: false, error: "Server host is required" };
  }
  if (host.length > 253) {
    return { ok: false, error: "Server host is too long" };
  }
  // Conservative hostname/IP validation: alnum + dots + dashes only.
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/i.test(host) && !/^\[?[0-9a-f:.]+\]?$/i.test(host)) {
    return { ok: false, error: "Invalid server host" };
  }
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return { ok: false, error: "Server port must be between 1 and 65535" };
  }

  return {
    ok: true,
    value: {
      label: label || host,
      host,
      port,
      tls,
    },
  };
}

export const __DEFAULT_IRC_SERVER_ID = DEFAULT_SERVER_ID;
