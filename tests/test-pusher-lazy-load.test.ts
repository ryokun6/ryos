/**
 * Behavioral tests for the lazily-loaded pusher client facade.
 *
 * pusher-js is dynamically imported inside the pusher provider branch of
 * `getPusherClient()` (see #1455), which stays synchronous by returning a
 * `DeferredPusherRealtimeClient`. These tests cover the queue/replay contract:
 * subscriptions and bindings made before the real client resolves must be
 * replayed onto it, and calls made afterwards must delegate directly.
 *
 * (Source-level wiring guards against reintroducing a static pusher-js import
 * live in tests/test-pusher-client-constructor-wiring.test.ts.)
 */

import { describe, test, expect } from "bun:test";

import {
  DeferredPusherRealtimeClient,
  type RealtimeChannel,
  type RealtimeClient,
  type RealtimeConnection,
} from "../src/lib/pusherClient";

type Call =
  | { type: "subscribe" | "unsubscribe"; channel: string }
  | { type: "bind" | "unbind"; channel: string; eventName?: string };

const createFakeRealClient = () => {
  const calls: Call[] = [];
  const channels = new Map<string, RealtimeChannel>();

  const makeChannel = (name: string): RealtimeChannel => ({
    name,
    bind: (eventName: string) =>
      calls.push({ type: "bind", channel: name, eventName }),
    unbind: (eventName?: string) =>
      calls.push({ type: "unbind", channel: name, eventName }),
  });

  const connection: RealtimeConnection & { state: string } = {
    state: "connected",
    bind: (eventName: string) =>
      calls.push({ type: "bind", channel: "<connection>", eventName }),
    unbind: (eventName?: string) =>
      calls.push({ type: "unbind", channel: "<connection>", eventName }),
  };

  const client: RealtimeClient = {
    connection,
    subscribe: (channelName: string) => {
      calls.push({ type: "subscribe", channel: channelName });
      const existing = channels.get(channelName);
      if (existing) return existing;
      const channel = makeChannel(channelName);
      channels.set(channelName, channel);
      return channel;
    },
    unsubscribe: (channelName: string) => {
      calls.push({ type: "unsubscribe", channel: channelName });
      channels.delete(channelName);
    },
    channel: (channelName: string) => channels.get(channelName),
  };

  return { client, calls };
};

/** Deferred promise helper so tests control when the "module load" finishes. */
const createDeferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const flushMicrotasks = () => new Promise<void>((res) => setTimeout(res, 0));

describe("DeferredPusherRealtimeClient", () => {
  test("replays pre-load subscriptions and channel binds once the client resolves", async () => {
    const deferred = createDeferred<RealtimeClient>();
    const facade = new DeferredPusherRealtimeClient(deferred.promise);

    const channel = facade.subscribe("rooms");
    channel.bind("room-message", () => {});
    channel.bind("rooms-updated", () => {});
    expect(facade.channel("rooms")).toBe(channel);

    const { client, calls } = createFakeRealClient();
    deferred.resolve(client);
    await flushMicrotasks();

    expect(calls.filter((c) => c.type === "subscribe")).toEqual([
      { type: "subscribe", channel: "rooms" },
    ]);
    expect(
      calls.filter((c) => c.type === "bind" && c.channel === "rooms")
    ).toEqual([
      { type: "bind", channel: "rooms", eventName: "room-message" },
      { type: "bind", channel: "rooms", eventName: "rooms-updated" },
    ]);
  });

  test("unbinding before load removes the queued handler", async () => {
    const deferred = createDeferred<RealtimeClient>();
    const facade = new DeferredPusherRealtimeClient(deferred.promise);

    const kept = () => {};
    const removed = () => {};
    const channel = facade.subscribe("rooms");
    channel.bind("room-message", kept);
    channel.bind("room-message", removed);
    channel.unbind("room-message", removed);

    const { client, calls } = createFakeRealClient();
    deferred.resolve(client);
    await flushMicrotasks();

    expect(
      calls.filter((c) => c.type === "bind" && c.channel === "rooms")
    ).toHaveLength(1);
  });

  test("post-load calls delegate directly to the real client", async () => {
    const deferred = createDeferred<RealtimeClient>();
    const facade = new DeferredPusherRealtimeClient(deferred.promise);
    const { client, calls } = createFakeRealClient();
    deferred.resolve(client);
    await flushMicrotasks();

    const channel = facade.subscribe("presence");
    channel.bind("presence-update", () => {});
    facade.unsubscribe("presence");

    expect(calls.filter((c) => c.channel === "presence")).toEqual([
      { type: "subscribe", channel: "presence" },
      { type: "bind", channel: "presence", eventName: "presence-update" },
      { type: "unsubscribe", channel: "presence" },
    ]);
    expect(facade.channel("presence")).toBeUndefined();
  });

  test("connection reports 'connecting' before load and the real state after", async () => {
    const deferred = createDeferred<RealtimeClient>();
    const facade = new DeferredPusherRealtimeClient(deferred.promise);
    expect(facade.connection.state).toBe("connecting");

    const handler = () => {};
    facade.connection.bind("connected", handler);

    const { client, calls } = createFakeRealClient();
    deferred.resolve(client);
    await flushMicrotasks();

    expect(facade.connection.state).toBe("connected");
    // Queued consumer bind replayed onto the real connection (plus the
    // facade's own state-tracking binds).
    expect(
      calls.filter(
        (c) =>
          c.type === "bind" &&
          c.channel === "<connection>" &&
          c.eventName === "connected"
      ).length
    ).toBeGreaterThanOrEqual(1);
  });

  test("load failure flips connection state to disconnected", async () => {
    const deferred = createDeferred<RealtimeClient>();
    const facade = new DeferredPusherRealtimeClient(deferred.promise);

    deferred.reject(new Error("network down"));
    await flushMicrotasks();

    expect(facade.connection.state).toBe("disconnected");
  });
});
