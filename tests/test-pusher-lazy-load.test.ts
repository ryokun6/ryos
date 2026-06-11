/**
 * Tests for lazy pusher-js loading.
 *
 * pusher-js is dynamically imported so the entry chunk doesn't pay for it at
 * boot (and the local WebSocket provider never loads it at all). Because
 * `getPusherClient()` stays synchronous, a facade queues channel/connection
 * bindings made before the module resolves and replays them once the real
 * client attaches. These tests cover that queue/replay contract plus source
 * wiring guards against reintroducing a static import.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, test, expect } from "bun:test";

import {
  DeferredRealtimeChannel,
  DeferredRealtimeConnection,
  type RealtimeChannel,
  type RealtimeConnection,
} from "../src/lib/pusherClient";

type Call = { method: "bind" | "unbind"; eventName?: string };

const createRecordingChannel = (): RealtimeChannel & { calls: Call[] } => {
  const calls: Call[] = [];
  return {
    name: "test-channel",
    calls,
    bind: (eventName: string) => {
      calls.push({ method: "bind", eventName });
    },
    unbind: (eventName?: string) => {
      calls.push({ method: "unbind", eventName });
    },
  };
};

describe("DeferredRealtimeChannel", () => {
  test("replays queued binds on attach, then delegates directly", () => {
    const facade = new DeferredRealtimeChannel("rooms");
    const handlerA = () => {};
    const handlerB = () => {};
    facade.bind("room-message", handlerA);
    facade.bind("rooms-updated", handlerB);

    const real = createRecordingChannel();
    facade.attach(real);
    expect(real.calls).toEqual([
      { method: "bind", eventName: "room-message" },
      { method: "bind", eventName: "rooms-updated" },
    ]);

    facade.bind("presence-update", () => {});
    expect(real.calls[2]).toEqual({
      method: "bind",
      eventName: "presence-update",
    });
  });

  test("unbind before attach removes the queued handler", () => {
    const facade = new DeferredRealtimeChannel("rooms");
    const kept = () => {};
    const removed = () => {};
    facade.bind("room-message", kept);
    facade.bind("room-message", removed);
    facade.unbind("room-message", removed);

    const real = createRecordingChannel();
    facade.attach(real);
    expect(real.calls).toEqual([
      { method: "bind", eventName: "room-message" },
    ]);
  });

  test("unbind without args clears all queued binds", () => {
    const facade = new DeferredRealtimeChannel("rooms");
    facade.bind("a", () => {});
    facade.bind("b", () => {});
    facade.unbind();

    const real = createRecordingChannel();
    facade.attach(real);
    expect(real.calls).toEqual([]);
  });
});

describe("DeferredRealtimeConnection", () => {
  test("reports 'connecting' before attach and the real state after", () => {
    const facade = new DeferredRealtimeConnection();
    expect(facade.state).toBe("connecting");

    const calls: Call[] = [];
    const real: RealtimeConnection & { state: string } = {
      state: "connected",
      bind: (eventName: string) => calls.push({ method: "bind", eventName }),
      unbind: (eventName?: string) =>
        calls.push({ method: "unbind", eventName }),
    };

    const handler = () => {};
    facade.bind("connected", handler);
    facade.attach(real);
    expect(facade.state).toBe("connected");
    expect(calls).toEqual([{ method: "bind", eventName: "connected" }]);
  });
});

describe("source wiring", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/lib/pusherClient.ts"),
    "utf-8"
  );

  test("pusher-js is only imported dynamically (or as types)", () => {
    const staticValueImport = /^import\s+(?!type\b)[^;]*from\s+"pusher-js";/m;
    expect(staticValueImport.test(source)).toBe(false);
    expect(source).toContain('import("pusher-js")');
  });

  test("the pusher provider path uses the deferred facade", () => {
    expect(source).toContain("new DeferredPusherClient()");
  });
});
