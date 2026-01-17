import { randomUUID } from "node:crypto";
import { IrcConnection } from "./_client.js";
import type {
  IrcChannel,
  IrcConnectResponse,
  IrcStreamEvent,
} from "../../src/types/irc.js";

const DEFAULT_CHANNELS = ["#ryos"];
const SESSION_TTL_MS = 30 * 60 * 1000;

interface IrcSession {
  id: string;
  nick: string;
  connection: IrcConnection;
  createdAt: number;
  lastActive: number;
  listeners: Set<(event: IrcStreamEvent) => void>;
}

const globalWithSessions = globalThis as typeof globalThis & {
  __ircSessions?: Map<string, IrcSession>;
};

const getSessionStore = () => {
  if (!globalWithSessions.__ircSessions) {
    globalWithSessions.__ircSessions = new Map<string, IrcSession>();
  }
  return globalWithSessions.__ircSessions;
};

const touchSession = (session: IrcSession) => {
  session.lastActive = Date.now();
};

export const cleanupSessions = () => {
  const store = getSessionStore();
  const now = Date.now();
  for (const [id, session] of store.entries()) {
    const isExpired = now - session.lastActive > SESSION_TTL_MS;
    if (isExpired && session.listeners.size === 0) {
      session.connection.disconnect();
      store.delete(id);
    }
  }
};

export const createSession = (
  nick: string,
  channels?: string[]
): IrcConnectResponse => {
  cleanupSessions();
  const store = getSessionStore();
  const sessionId = randomUUID();
  const connection = new IrcConnection(nick);

  const session: IrcSession = {
    id: sessionId,
    nick,
    connection,
    createdAt: Date.now(),
    lastActive: Date.now(),
    listeners: new Set(),
  };

  connection.onEvent((event) => {
    touchSession(session);
    session.listeners.forEach((listener) => listener(event));
  });

  store.set(sessionId, session);

  const joinChannels = channels && channels.length > 0 ? channels : DEFAULT_CHANNELS;
  connection.connect();
  joinChannels.forEach((channel) => connection.joinChannel(channel));

  return {
    sessionId,
    nick,
    channels: joinChannels,
  };
};

export const getSession = (sessionId: string): IrcSession | null => {
  cleanupSessions();
  const store = getSessionStore();
  return store.get(sessionId) || null;
};

export const registerSessionListener = (
  sessionId: string,
  listener: (event: IrcStreamEvent) => void
): (() => void) => {
  const session = getSession(sessionId);
  if (!session) {
    throw new Error("Session not found");
  }
  session.listeners.add(listener);
  touchSession(session);
  listener({
    type: "state",
    payload: { state: session.connection.getState() },
  });
  return () => {
    session.listeners.delete(listener);
  };
};

export const sendSessionMessage = (
  sessionId: string,
  channel: string,
  content: string
) => {
  const session = getSession(sessionId);
  if (!session) {
    return { ok: false, error: "Session not found" };
  }
  session.connection.sendMessage(channel, content);
  touchSession(session);
  return { ok: true };
};

export const joinSessionChannel = (sessionId: string, channel: string) => {
  const session = getSession(sessionId);
  if (!session) {
    return { ok: false, error: "Session not found" };
  }
  session.connection.joinChannel(channel);
  touchSession(session);
  return { ok: true };
};

export const partSessionChannel = (sessionId: string, channel: string) => {
  const session = getSession(sessionId);
  if (!session) {
    return { ok: false, error: "Session not found" };
  }
  session.connection.partChannel(channel);
  touchSession(session);
  return { ok: true };
};

export const listSessionChannels = (sessionId: string): IrcChannel[] => {
  const session = getSession(sessionId);
  if (!session) return [];
  touchSession(session);
  return session.connection.getChannels();
};
