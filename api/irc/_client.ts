import { createConnection, type Socket } from "node:net";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type {
  IrcChannel,
  IrcConnectionState,
  IrcMessage,
  IrcMessageType,
} from "../../src/types/irc.js";

type IrcEvent =
  | { type: "message"; payload: IrcMessage }
  | { type: "system"; payload: { text: string } }
  | { type: "state"; payload: { state: IrcConnectionState } };

interface ParsedIrcLine {
  prefix?: string;
  command: string;
  params: string[];
  trailing?: string;
  raw: string;
}

const IRC_HOST = "irc.pieter.com";
const IRC_PORT = 6667;

const MAX_NICK_ATTEMPTS = 5;
const SYSTEM_NICK = "irc";

const normalizeChannelName = (name: string) =>
  name.startsWith("#") ? name : `#${name}`;

const parsePrefixNick = (prefix?: string) => {
  if (!prefix) return null;
  const exclamationIndex = prefix.indexOf("!");
  if (exclamationIndex === -1) return prefix;
  return prefix.slice(0, exclamationIndex);
};

const parseIrcLine = (line: string): ParsedIrcLine => {
  let rest = line.trim();
  let prefix: string | undefined;

  if (rest.startsWith(":")) {
    const spaceIndex = rest.indexOf(" ");
    prefix = rest.slice(1, spaceIndex);
    rest = rest.slice(spaceIndex + 1);
  }

  const parts = rest.split(" ");
  const command = parts.shift() || "";
  const params: string[] = [];
  let trailing = "";
  let foundTrailing = false;

  for (const part of parts) {
    if (foundTrailing) {
      trailing += ` ${part}`;
    } else if (part.startsWith(":")) {
      foundTrailing = true;
      trailing = part.slice(1);
    } else {
      params.push(part);
    }
  }

  if (foundTrailing) {
    trailing = trailing.trimEnd();
  } else {
    trailing = undefined;
  }

  return {
    prefix,
    command,
    params,
    trailing,
    raw: line,
  };
};

export class IrcConnection extends EventEmitter {
  private socket: Socket | null = null;
  private buffer = "";
  private nick: string;
  private requestedNick: string;
  private connected = false;
  private registered = false;
  private nickAttempts = 0;
  private channels = new Set<string>();
  private channelTopics = new Map<string, string>();
  private usersByChannel = new Map<string, Set<string>>();

  constructor(initialNick: string) {
    super();
    this.nick = initialNick;
    this.requestedNick = initialNick;
  }

  connect() {
    if (this.socket) return;
    this.socket = createConnection({ host: IRC_HOST, port: IRC_PORT });
    this.socket.setEncoding("utf8");

    this.socket.on("connect", () => {
      this.emitSystem(`Connected to ${IRC_HOST}:${IRC_PORT}`);
      this.sendRaw(`NICK ${this.requestedNick}`);
      this.sendRaw(`USER ${this.requestedNick} 0 * :ryOS Chat`);
    });

    this.socket.on("data", (data) => {
      this.buffer += data;
      let lineEndIndex = this.buffer.indexOf("\r\n");
      while (lineEndIndex !== -1) {
        const line = this.buffer.slice(0, lineEndIndex);
        this.buffer = this.buffer.slice(lineEndIndex + 2);
        this.handleLine(line);
        lineEndIndex = this.buffer.indexOf("\r\n");
      }
    });

    this.socket.on("error", (error) => {
      this.emitSystem(`Connection error: ${error.message}`);
      this.connected = false;
      this.emitState();
    });

    this.socket.on("close", () => {
      this.emitSystem("Connection closed");
      this.connected = false;
      this.registered = false;
      this.emitState();
    });
  }

  disconnect() {
    if (!this.socket) return;
    this.sendRaw("QUIT :ryOS disconnect");
    this.socket.end();
    this.socket.destroy();
    this.socket = null;
  }

  joinChannel(channel: string) {
    const normalized = normalizeChannelName(channel);
    this.channels.add(normalized);
    if (!this.usersByChannel.has(normalized)) {
      this.usersByChannel.set(normalized, new Set());
    }
    this.sendRaw(`JOIN ${normalized}`);
    this.emitState();
  }

  partChannel(channel: string) {
    const normalized = normalizeChannelName(channel);
    this.channels.delete(normalized);
    this.usersByChannel.delete(normalized);
    this.channelTopics.delete(normalized);
    this.sendRaw(`PART ${normalized}`);
    this.emitState();
  }

  sendMessage(channel: string, content: string) {
    const normalized = normalizeChannelName(channel);
    this.sendRaw(`PRIVMSG ${normalized} :${content}`);
  }

  getNick() {
    return this.nick;
  }

  getState(): IrcConnectionState {
    return {
      connected: this.connected,
      nick: this.nick,
      channels: Array.from(this.channels),
      serverInfo: this.connected
        ? {
            name: IRC_HOST,
          }
        : undefined,
    };
  }

  getChannels(): IrcChannel[] {
    return Array.from(this.channels).map((channel) => {
      const users = Array.from(this.usersByChannel.get(channel) || []);
      return {
        name: channel,
        topic: this.channelTopics.get(channel),
        users,
        userCount: users.length,
      };
    });
  }

  onEvent(listener: (event: IrcEvent) => void) {
    this.on("event", listener);
  }

  removeEventListener(listener: (event: IrcEvent) => void) {
    this.off("event", listener);
  }

  private emitEvent(event: IrcEvent) {
    this.emit("event", event);
  }

  private emitSystem(text: string) {
    this.emitEvent({ type: "system", payload: { text } });
  }

  private emitState() {
    this.emitEvent({ type: "state", payload: { state: this.getState() } });
  }

  private emitMessage(
    channel: string,
    nick: string,
    content: string,
    type: IrcMessageType
  ) {
    const message: IrcMessage = {
      id: randomUUID(),
      channel,
      nick,
      content,
      timestamp: Date.now(),
      type,
    };
    this.emitEvent({ type: "message", payload: message });
  }

  private sendRaw(line: string) {
    if (!this.socket) return;
    this.socket.write(`${line}\r\n`);
  }

  private handleLine(line: string) {
    if (!line) return;
    const parsed = parseIrcLine(line);

    if (parsed.command === "PING") {
      const payload = parsed.trailing || parsed.params[0] || "";
      this.sendRaw(`PONG :${payload}`);
      return;
    }

    if (parsed.command === "001") {
      this.connected = true;
      this.registered = true;
      this.emitSystem("IRC registration successful");
      this.emitState();
      return;
    }

    if (parsed.command === "433") {
      this.handleNickInUse();
      return;
    }

    if (parsed.command === "PRIVMSG") {
      const channel = parsed.params[0];
      const nick = parsePrefixNick(parsed.prefix) || SYSTEM_NICK;
      if (!channel || !parsed.trailing) return;
      this.emitMessage(channel, nick, parsed.trailing, "message");
      return;
    }

    if (parsed.command === "NOTICE") {
      const channel = parsed.params[0] || SYSTEM_NICK;
      const nick = parsePrefixNick(parsed.prefix) || SYSTEM_NICK;
      if (!parsed.trailing) return;
      this.emitMessage(channel, nick, parsed.trailing, "notice");
      return;
    }

    if (parsed.command === "JOIN") {
      const channel = normalizeChannelName(parsed.trailing || parsed.params[0]);
      const nick = parsePrefixNick(parsed.prefix) || SYSTEM_NICK;
      if (!channel) return;
      this.addUserToChannel(channel, nick);
      if (nick === this.nick) {
        this.channels.add(channel);
      }
      this.emitMessage(channel, nick, `joined ${channel}`, "join");
      this.emitState();
      return;
    }

    if (parsed.command === "PART" || parsed.command === "QUIT") {
      const channel = normalizeChannelName(parsed.params[0] || "");
      const nick = parsePrefixNick(parsed.prefix) || SYSTEM_NICK;
      if (channel) {
        this.removeUserFromChannel(channel, nick);
        if (nick === this.nick) {
          this.channels.delete(channel);
        }
        this.emitMessage(
          channel,
          nick,
          `left ${channel}`,
          parsed.command === "QUIT" ? "part" : "part"
        );
      }
      this.emitState();
      return;
    }

    if (parsed.command === "TOPIC") {
      const channel = normalizeChannelName(parsed.params[0] || "");
      const topic = parsed.trailing || "";
      const nick = parsePrefixNick(parsed.prefix) || SYSTEM_NICK;
      if (channel) {
        this.channelTopics.set(channel, topic);
        this.emitMessage(channel, nick, `topic: ${topic}`, "topic");
        this.emitState();
      }
      return;
    }

    if (parsed.command === "NICK") {
      const newNick = parsed.trailing || parsed.params[0];
      const oldNick = parsePrefixNick(parsed.prefix);
      if (!newNick || !oldNick) return;
      if (oldNick === this.nick) {
        this.nick = newNick;
        this.emitSystem(`Nick changed to ${newNick}`);
      }
      this.updateNickInChannels(oldNick, newNick);
      this.emitMessage(
        this.channels.values().next().value || SYSTEM_NICK,
        oldNick,
        `is now known as ${newNick}`,
        "nick"
      );
      this.emitState();
      return;
    }

    if (parsed.command === "353") {
      const channel = normalizeChannelName(parsed.params[2] || "");
      const names = parsed.trailing?.split(" ") || [];
      if (channel) {
        const channelUsers = this.usersByChannel.get(channel) || new Set();
        names.forEach((name) => {
          const cleanName = name.replace(/^[@+~&%]/, "");
          if (cleanName) channelUsers.add(cleanName);
        });
        this.usersByChannel.set(channel, channelUsers);
        this.emitState();
      }
      return;
    }

    if (parsed.command === "366") {
      this.emitState();
      return;
    }
  }

  private handleNickInUse() {
    if (this.nickAttempts >= MAX_NICK_ATTEMPTS) {
      this.emitSystem("Nickname in use; unable to find available nick");
      return;
    }
    this.nickAttempts += 1;
    const suffix = Math.floor(Math.random() * 1000);
    this.requestedNick = `${this.requestedNick}_${suffix}`;
    this.sendRaw(`NICK ${this.requestedNick}`);
    this.emitSystem(`Nickname in use, trying ${this.requestedNick}`);
  }

  private addUserToChannel(channel: string, nick: string) {
    const channelUsers = this.usersByChannel.get(channel) || new Set<string>();
    channelUsers.add(nick);
    this.usersByChannel.set(channel, channelUsers);
  }

  private removeUserFromChannel(channel: string, nick: string) {
    const channelUsers = this.usersByChannel.get(channel);
    if (!channelUsers) return;
    channelUsers.delete(nick);
    this.usersByChannel.set(channel, channelUsers);
  }

  private updateNickInChannels(oldNick: string, newNick: string) {
    this.usersByChannel.forEach((users) => {
      if (users.has(oldNick)) {
        users.delete(oldNick);
        users.add(newNick);
      }
    });
  }
}
