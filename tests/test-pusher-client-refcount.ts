#!/usr/bin/env bun
/**
 * Regression tests for shared Pusher channel reference counting.
 *
 * Why this exists:
 * Chat listeners can overlap briefly during open/close transitions.
 * We must not unsubscribe a shared channel until all consumers release it.
 */

import {
  header,
  section,
  runTest,
  printSummary,
  clearResults,
  assertEq,
} from "./test-utils";
import {
  subscribePusherChannel,
  unsubscribePusherChannel,
} from "../src/lib/pusherClient";

type FakeCall = { type: "subscribe" | "unsubscribe"; channel: string };

interface FakeChannel {
  name: string;
  bind: () => void;
  unbind: () => void;
}

interface FakePusher {
  subscribe: (channel: string) => FakeChannel;
  unsubscribe: (channel: string) => void;
  channel: (channel: string) => FakeChannel;
}

const globalWithPusherState = globalThis as typeof globalThis & {
  __pusherClient?: FakePusher;
  __pusherChannelRefCounts?: Record<string, number>;
};

const createFakePusher = (): {
  pusher: FakePusher;
  calls: FakeCall[];
  channels: Record<string, FakeChannel>;
} => {
  const calls: FakeCall[] = [];
  const channels: Record<string, FakeChannel> = {};

  const ensureChannel = (channel: string): FakeChannel => {
    if (!channels[channel]) {
      channels[channel] = {
        name: channel,
        bind: () => undefined,
        unbind: () => undefined,
      };
    }
    return channels[channel];
  };

  return {
    pusher: {
      subscribe: (channel) => {
        calls.push({ type: "subscribe", channel });
        return ensureChannel(channel);
      },
      unsubscribe: (channel) => {
        calls.push({ type: "unsubscribe", channel });
      },
      channel: (channel) => ensureChannel(channel),
    },
    calls,
    channels,
  };
};

const resetGlobalPusherState = (pusher: FakePusher) => {
  globalWithPusherState.__pusherClient = pusher;
  globalWithPusherState.__pusherChannelRefCounts = {};
};

async function main() {
  clearResults();
  console.log(header("Pusher Channel Refcount Tests"));

  console.log(section("Shared subscribe lifecycle"));
  await runTest("subscribes only once for repeated acquire", async () => {
    const { pusher, calls } = createFakePusher();
    resetGlobalPusherState(pusher);

    subscribePusherChannel("room-a");
    subscribePusherChannel("room-a");

    assertEq(calls.length, 1, "Expected exactly one underlying subscribe");
    assertEq(calls[0].type, "subscribe");
    assertEq(calls[0].channel, "room-a");
  });

  await runTest("unsubscribes only after final release", async () => {
    const { pusher, calls } = createFakePusher();
    resetGlobalPusherState(pusher);

    subscribePusherChannel("room-b");
    subscribePusherChannel("room-b");
    unsubscribePusherChannel("room-b");
    unsubscribePusherChannel("room-b");

    assertEq(calls.length, 2, "Expected one subscribe and one unsubscribe");
    assertEq(calls[0].type, "subscribe");
    assertEq(calls[0].channel, "room-b");
    assertEq(calls[1].type, "unsubscribe");
    assertEq(calls[1].channel, "room-b");
  });

  console.log(section("Independent channel accounting"));
  await runTest("tracks channel counts independently", async () => {
    const { pusher, calls } = createFakePusher();
    resetGlobalPusherState(pusher);

    subscribePusherChannel("room-c");
    subscribePusherChannel("room-d");
    subscribePusherChannel("room-c");
    unsubscribePusherChannel("room-c");
    unsubscribePusherChannel("room-d");
    unsubscribePusherChannel("room-c");

    assertEq(calls.length, 4, "Expected 2 subscribes and 2 unsubscribes");
    assertEq(calls[0].type, "subscribe");
    assertEq(calls[0].channel, "room-c");
    assertEq(calls[1].type, "subscribe");
    assertEq(calls[1].channel, "room-d");
    assertEq(calls[2].type, "unsubscribe");
    assertEq(calls[2].channel, "room-d");
    assertEq(calls[3].type, "unsubscribe");
    assertEq(calls[3].channel, "room-c");
  });

  await runTest("allows re-subscribe after full release", async () => {
    const { pusher, calls } = createFakePusher();
    resetGlobalPusherState(pusher);

    subscribePusherChannel("room-e");
    unsubscribePusherChannel("room-e");
    subscribePusherChannel("room-e");

    assertEq(calls.length, 3, "Expected subscribe/unsubscribe/subscribe");
    assertEq(calls[0].type, "subscribe");
    assertEq(calls[0].channel, "room-e");
    assertEq(calls[1].type, "unsubscribe");
    assertEq(calls[1].channel, "room-e");
    assertEq(calls[2].type, "subscribe");
    assertEq(calls[2].channel, "room-e");
  });

  await runTest("ignores extra releases after zero refs", async () => {
    const { pusher, calls } = createFakePusher();
    resetGlobalPusherState(pusher);

    subscribePusherChannel("room-f");
    unsubscribePusherChannel("room-f");
    unsubscribePusherChannel("room-f");
    unsubscribePusherChannel("room-f");

    assertEq(
      calls.length,
      2,
      "Expected one subscribe and one unsubscribe with extra releases ignored"
    );
    assertEq(calls[0].type, "subscribe");
    assertEq(calls[0].channel, "room-f");
    assertEq(calls[1].type, "unsubscribe");
    assertEq(calls[1].channel, "room-f");
  });

  const { failed } = printSummary();
  process.exit(failed > 0 ? 1 : 0);
}

void main();
