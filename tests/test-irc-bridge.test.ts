#!/usr/bin/env bun
/**
 * Unit tests for the IRC bridge.
 *
 * The bridge is tested against a fake IRC client (injected via the
 * `createClient` dependency) so the tests run fully offline without
 * touching `irc-framework` or any real network.
 *
 * We exercise:
 *   - bindRoom() opening a connection and joining the channel on `registered`
 *   - sendMessage() forwarding to `client.say(channel, text)`
 *   - incoming `message` events being persisted via the supplied callback
 *   - unbindRoom() parting the channel once the last room releases it
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import EventEmitter from "node:events";
import {
  IrcBridge,
  setIrcBridgeForTesting,
  type IrcClientLike,
} from "../api/_utils/irc/_bridge";
import {
  normalizeIrcChannel,
  DEFAULT_IRC_HOST,
  DEFAULT_IRC_PORT,
} from "../api/_utils/irc/_types";
import type { Message, Room } from "../api/rooms/_helpers/_types";

interface FakeCall {
  type: "connect" | "join" | "say" | "part" | "quit";
  args: unknown[];
}

class FakeIrcClient extends EventEmitter implements IrcClientLike {
  calls: FakeCall[] = [];
  connected = false;

  connect(_options?: Record<string, unknown>): void {
    this.calls.push({ type: "connect", args: [_options] });
    // Simulate async registration shortly after connect
    queueMicrotask(() => {
      this.connected = true;
      this.emit("registered", {});
    });
  }

  join(channel: string, key?: string): void {
    this.calls.push({ type: "join", args: [channel, key] });
    // Simulate the server echoing our JOIN event back so the bridge can
    // clear its pending-join set. `target` carries the channel for JOIN
    // events in irc-framework.
    queueMicrotask(() => {
      this.emit("join", { nick: this.nick, target: channel });
    });
  }

  part(channel: string, message?: string): void {
    this.calls.push({ type: "part", args: [channel, message] });
  }

  say(target: string, message: string): void {
    this.calls.push({ type: "say", args: [target, message] });
  }

  changeNick(nick: string): void {
    this.nick = nick;
  }

  quit(message?: string): void {
    this.calls.push({ type: "quit", args: [message] });
  }

  nick: string = "";
}

function makeIrcRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: "testroom1",
    name: "pieter",
    type: "irc",
    createdAt: Date.now(),
    userCount: 0,
    ircHost: DEFAULT_IRC_HOST,
    ircPort: DEFAULT_IRC_PORT,
    ircTls: false,
    ircChannel: "#pieter",
    ...overrides,
  };
}

describe("IRC Bridge", () => {
  let persisted: Array<{ roomId: string; message: Message; room: Room | null }> = [];
  let fakeClients: FakeIrcClient[] = [];
  let bridge: IrcBridge;

  beforeEach(() => {
    persisted = [];
    fakeClients = [];
    bridge = new IrcBridge({
      createClient: (options) => {
        const client = new FakeIrcClient();
        client.nick = String(options.nick ?? "test-bot");
        fakeClients.push(client);
        return client;
      },
      persistIncomingMessage: async (roomId, message, room) => {
        persisted.push({ roomId, message, room });
      },
    });
    setIrcBridgeForTesting(bridge);
  });

  afterEach(async () => {
    await bridge.shutdown();
    setIrcBridgeForTesting(null);
  });

  test("normalizeIrcChannel prefixes channels with '#'", () => {
    expect(normalizeIrcChannel("pieter")).toBe("#pieter");
    expect(normalizeIrcChannel("#pieter")).toBe("#pieter");
    expect(normalizeIrcChannel("&chan")).toBe("&chan");
    expect(normalizeIrcChannel("")).toBe("");
  });

  test("bindRoom connects and joins channel on registered", async () => {
    const room = makeIrcRoom();
    await bridge.bindRoom(room);

    // Wait a microtask tick for the fake `registered` event to fire.
    await Promise.resolve();
    await Promise.resolve();

    expect(fakeClients.length).toBe(1);
    const client = fakeClients[0];
    expect(client.calls.some((c) => c.type === "connect")).toBe(true);
    expect(client.calls.some((c) => c.type === "join" && c.args[0] === "#pieter")).toBe(true);

    const bindings = bridge.getBindings();
    expect(bindings.length).toBe(1);
    expect(bindings[0].channel).toBe("#pieter");
    expect(bindings[0].roomIds).toContain("testroom1");
  });

  test("sendMessage forwards to client.say with prefixed username", async () => {
    const room = makeIrcRoom();
    await bridge.bindRoom(room);

    // Let the fake client register so server.ready becomes true.
    await new Promise((r) => setTimeout(r, 5));

    await bridge.sendMessage(room, "alice", "hello world");

    const client = fakeClients[0];
    const sayCalls = client.calls.filter((c) => c.type === "say");
    expect(sayCalls.length).toBe(1);
    expect(sayCalls[0].args[0]).toBe("#pieter");
    expect(sayCalls[0].args[1]).toBe("<alice> hello world");
  });

  test("incoming IRC messages are persisted via the callback", async () => {
    const room = makeIrcRoom();
    await bridge.bindRoom(room);
    await new Promise((r) => setTimeout(r, 5));

    const client = fakeClients[0];
    client.emit("message", {
      type: "privmsg",
      target: "#pieter",
      nick: "bob",
      message: "hi there",
    });

    // Allow the async handler (which also calls getRoom) to settle.
    await new Promise((r) => setTimeout(r, 200));

    expect(persisted.length).toBe(1);
    const persistedItem = persisted[0];
    expect(persistedItem.roomId).toBe("testroom1");
    expect(persistedItem.message.username).toBe("irc:bob");
    expect(persistedItem.message.content).toBe("hi there");
  });

  test("incoming IRC 'action' events are prefixed with '*'", async () => {
    const room = makeIrcRoom();
    await bridge.bindRoom(room);
    await new Promise((r) => setTimeout(r, 5));

    const client = fakeClients[0];
    client.emit("message", {
      type: "action",
      target: "#pieter",
      nick: "carol",
      message: "waves",
    });

    await new Promise((r) => setTimeout(r, 200));

    expect(persisted.length).toBe(1);
    expect(persisted[0].message.content).toBe("* waves");
  });

  test("incoming messages from unbound channels are ignored", async () => {
    const room = makeIrcRoom();
    await bridge.bindRoom(room);
    await new Promise((r) => setTimeout(r, 5));

    const client = fakeClients[0];
    client.emit("message", {
      type: "privmsg",
      target: "#unbound",
      nick: "bob",
      message: "hi",
    });

    await new Promise((r) => setTimeout(r, 5));
    expect(persisted.length).toBe(0);
  });

  test("bot's own messages (by nick match) are not persisted back", async () => {
    const room = makeIrcRoom();
    await bridge.bindRoom(room);
    await new Promise((r) => setTimeout(r, 5));

    const client = fakeClients[0];
    client.emit("message", {
      type: "privmsg",
      target: "#pieter",
      nick: client.nick,
      message: "<alice> hello",
    });

    await new Promise((r) => setTimeout(r, 5));
    expect(persisted.length).toBe(0);
  });

  test("unbindRoom parts channel and drops the binding", async () => {
    const room = makeIrcRoom();
    await bridge.bindRoom(room);
    await new Promise((r) => setTimeout(r, 5));

    await bridge.unbindRoom(room);

    expect(bridge.getBindings().length).toBe(0);
    const client = fakeClients[0];
    expect(client.calls.some((c) => c.type === "part" && c.args[0] === "#pieter")).toBe(true);
  });

  test("multiple rooms bound to the same channel share one connection", async () => {
    const roomA = makeIrcRoom({ id: "rA" });
    const roomB = makeIrcRoom({ id: "rB" });

    await bridge.bindRoom(roomA);
    await bridge.bindRoom(roomB);
    await new Promise((r) => setTimeout(r, 5));

    // Still only a single IRC connection.
    expect(fakeClients.length).toBe(1);
    const bindings = bridge.getBindings();
    expect(bindings.length).toBe(1);
    expect(bindings[0].roomIds.sort()).toEqual(["rA", "rB"]);
  });

  test("different servers get separate connections", async () => {
    await bridge.bindRoom(makeIrcRoom({ id: "rA", ircHost: "irc.example.com" }));
    await bridge.bindRoom(makeIrcRoom({ id: "rB", ircHost: "irc.pieter.com" }));
    await new Promise((r) => setTimeout(r, 5));

    expect(fakeClients.length).toBe(2);
    const bindings = bridge.getBindings().map((b) => b.host).sort();
    expect(bindings).toEqual(["irc.example.com", "irc.pieter.com"]);
  });

  test("sendMessage on unconnected server falls back to bindRoom", async () => {
    // Simulate a race: sendMessage called before any bind.
    const room = makeIrcRoom({ id: "rLazy" });
    await bridge.sendMessage(room, "alice", "hi");
    await new Promise((r) => setTimeout(r, 5));

    // A client should now exist because sendMessage triggered bindRoom.
    expect(fakeClients.length).toBe(1);
    const bindings = bridge.getBindings();
    expect(bindings.length).toBe(1);
    expect(bindings[0].roomIds).toContain("rLazy");
  });
});

describe("IRC Bridge wiring", () => {
  test("rooms/index.ts wires notifyRoomBindingChange on create", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("api/rooms/index.ts", "utf-8");
    expect(src).toContain("notifyRoomBindingChange");
    expect(/notifyRoomBindingChange\s*\(\s*"bind"/.test(src)).toBe(true);
    // The create route must honour the opt-out flag so IRC_BRIDGE_DISABLED=1
    // never accidentally opens a socket.
    expect(src).toContain("isIrcBridgeEnabled");
  });

  test("rooms/[id].ts wires notifyRoomBindingChange on delete", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("api/rooms/[id].ts", "utf-8");
    expect(src).toContain("notifyRoomBindingChange");
    expect(/notifyRoomBindingChange\s*\(\s*"unbind"/.test(src)).toBe(true);
    expect(src).toContain("isIrcBridgeEnabled");
  });

  test("rooms/[id]/messages.ts forwards outbound to IRC bridge", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("api/rooms/[id]/messages.ts", "utf-8");
    expect(src).toContain("getIrcBridge");
    expect(/roomData\.type === "irc"/.test(src)).toBe(true);
    expect(src).toContain("isIrcBridgeEnabled");
  });

  test("standalone server initialises the IRC bridge on startup", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("scripts/api-standalone-server.ts", "utf-8");
    expect(src).toContain("getIrcBridge");
    expect(/getIrcBridge\(\)\.initialize\(\)/.test(src)).toBe(true);
    expect(src).toContain("isIrcBridgeEnabled");
  });
});
