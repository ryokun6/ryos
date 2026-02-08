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
  channel: (channel: string) => FakeChannel | undefined;
}

const globalWithPusherState = globalThis as typeof globalThis & {
  __pusherClient?: FakePusher;
  __pusherChannelRefCounts?: Record<string, number>;
  __pusherChannelRecoveryWarnings?: Record<string, true>;
};

const createFakePusher = (): {
  pusher: FakePusher;
  calls: FakeCall[];
  channels: Record<string, FakeChannel>;
} => {
  const calls: FakeCall[] = [];
  const channels: Record<string, FakeChannel> = {};
  const subscribed = new Set<string>();

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
        subscribed.add(channel);
        return ensureChannel(channel);
      },
      unsubscribe: (channel) => {
        calls.push({ type: "unsubscribe", channel });
        subscribed.delete(channel);
      },
      channel: (channel) =>
        subscribed.has(channel) ? ensureChannel(channel) : undefined,
    },
    calls,
    channels,
  };
};

const resetGlobalPusherState = (pusher: FakePusher) => {
  globalWithPusherState.__pusherClient = pusher;
  globalWithPusherState.__pusherChannelRefCounts = {};
  globalWithPusherState.__pusherChannelRecoveryWarnings = {};
};

export async function runPusherClientRefcountTests(): Promise<{
  passed: number;
  failed: number;
}> {
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

  await runTest("re-subscribes if channel lookup is missing", async () => {
    const calls: FakeCall[] = [];
    const fakePusher: FakePusher = {
      subscribe: (channel) => {
        calls.push({ type: "subscribe", channel });
        return { name: channel, bind: () => undefined, unbind: () => undefined };
      },
      unsubscribe: (channel) => {
        calls.push({ type: "unsubscribe", channel });
      },
      channel: () => undefined,
    };

    globalWithPusherState.__pusherClient = fakePusher;
    globalWithPusherState.__pusherChannelRefCounts = { "room-g": 5 };

    subscribePusherChannel("room-g");
    unsubscribePusherChannel("room-g");

    assertEq(
      calls.length,
      2,
      "Expected recovery to reset stale count and unsubscribe on first release"
    );
    assertEq(calls[0].type, "subscribe");
    assertEq(calls[0].channel, "room-g");
    assertEq(calls[1].type, "unsubscribe");
    assertEq(calls[1].channel, "room-g");
  });

  await runTest("subscribes when count starts at zero even with channel object", async () => {
    const calls: FakeCall[] = [];
    const existingChannel: FakeChannel = {
      name: "room-h",
      bind: () => undefined,
      unbind: () => undefined,
    };
    const fakePusher: FakePusher = {
      subscribe: (channel) => {
        calls.push({ type: "subscribe", channel });
        return existingChannel;
      },
      unsubscribe: (channel) => {
        calls.push({ type: "unsubscribe", channel });
      },
      channel: () => existingChannel,
    };

    globalWithPusherState.__pusherClient = fakePusher;
    globalWithPusherState.__pusherChannelRefCounts = {};

    subscribePusherChannel("room-h");
    unsubscribePusherChannel("room-h");

    assertEq(
      calls.length,
      2,
      "Expected explicit subscribe then unsubscribe for zero-count acquisition"
    );
    assertEq(calls[0].type, "subscribe");
    assertEq(calls[0].channel, "room-h");
    assertEq(calls[1].type, "unsubscribe");
    assertEq(calls[1].channel, "room-h");
  });

  console.log(section("Recovery warning dedupe"));
  await runTest("warns once for repeated unsubscribe underflow", async () => {
    const { pusher, calls } = createFakePusher();
    resetGlobalPusherState(pusher);

    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };

    try {
      unsubscribePusherChannel("room-i");
      unsubscribePusherChannel("room-i");
      unsubscribePusherChannel("room-i");
    } finally {
      console.warn = originalWarn;
    }

    assertEq(calls.length, 0, "Expected no underlying unsubscribe on underflow");
    assertEq(warnings.length, 1, "Expected one deduplicated underflow warning");
    const warningContainsUnderflow = warnings[0]?.includes("underflow");
    assertEq(warningContainsUnderflow, true, "Expected underflow warning message");
  });

  await runTest("warns once for repeated missing-channel recovery", async () => {
    const calls: FakeCall[] = [];
    const fakePusher: FakePusher = {
      subscribe: (channel) => {
        calls.push({ type: "subscribe", channel });
        return { name: channel, bind: () => undefined, unbind: () => undefined };
      },
      unsubscribe: (channel) => {
        calls.push({ type: "unsubscribe", channel });
      },
      channel: () => undefined,
    };

    globalWithPusherState.__pusherClient = fakePusher;
    globalWithPusherState.__pusherChannelRefCounts = { "room-j": 3 };
    globalWithPusherState.__pusherChannelRecoveryWarnings = {};

    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };

    try {
      subscribePusherChannel("room-j");
      subscribePusherChannel("room-j");
    } finally {
      console.warn = originalWarn;
    }

    assertEq(calls.length, 2, "Expected two subscribe recovery attempts");
    assertEq(warnings.length, 1, "Expected one deduplicated missing-channel warning");
    const warningContainsRecovery = warnings[0]?.includes("Recovered missing channel");
    assertEq(
      warningContainsRecovery,
      true,
      "Expected missing-channel recovery warning message"
    );
  });

  return printSummary();
}

if (import.meta.main) {
  runPusherClientRefcountTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
