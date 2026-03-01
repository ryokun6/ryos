import { describe, test, expect, beforeAll } from "bun:test";

/**
 * Regression tests for shared Pusher channel reference counting.
 *
 * Why this exists:
 * Chat listeners can overlap briefly during open/close transitions.
 * We must not unsubscribe a shared channel until all consumers release it.
 */

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

describe("Pusher Client Refcount", () => {
  describe("Shared subscribe lifecycle", () => {
    test("subscribes only once for repeated acquire", async () => {
    const { pusher, calls } = createFakePusher();
    resetGlobalPusherState(pusher);

    subscribePusherChannel("room-a");
    subscribePusherChannel("room-a");

    expect(calls.length).toBe(1);
    expect(calls[0].type).toBe("subscribe");
    expect(calls[0].channel).toBe("room-a");
  });
    test("unsubscribes only after final release", async () => {
    const { pusher, calls } = createFakePusher();
    resetGlobalPusherState(pusher);

    subscribePusherChannel("room-b");
    subscribePusherChannel("room-b");
    unsubscribePusherChannel("room-b");
    unsubscribePusherChannel("room-b");

    expect(calls.length).toBe(2);
    expect(calls[0].type).toBe("subscribe");
    expect(calls[0].channel).toBe("room-b");
    expect(calls[1].type).toBe("unsubscribe");
    expect(calls[1].channel).toBe("room-b");
  });
  });

  describe("Independent channel accounting", () => {
    test("tracks channel counts independently", async () => {
    const { pusher, calls } = createFakePusher();
    resetGlobalPusherState(pusher);

    subscribePusherChannel("room-c");
    subscribePusherChannel("room-d");
    subscribePusherChannel("room-c");
    unsubscribePusherChannel("room-c");
    unsubscribePusherChannel("room-d");
    unsubscribePusherChannel("room-c");

    expect(calls.length).toBe(4);
    expect(calls[0].type).toBe("subscribe");
    expect(calls[0].channel).toBe("room-c");
    expect(calls[1].type).toBe("subscribe");
    expect(calls[1].channel).toBe("room-d");
    expect(calls[2].type).toBe("unsubscribe");
    expect(calls[2].channel).toBe("room-d");
    expect(calls[3].type).toBe("unsubscribe");
    expect(calls[3].channel).toBe("room-c");
  });
    test("allows re-subscribe after full release", async () => {
    const { pusher, calls } = createFakePusher();
    resetGlobalPusherState(pusher);

    subscribePusherChannel("room-e");
    unsubscribePusherChannel("room-e");
    subscribePusherChannel("room-e");

    expect(calls.length).toBe(3);
    expect(calls[0].type).toBe("subscribe");
    expect(calls[0].channel).toBe("room-e");
    expect(calls[1].type).toBe("unsubscribe");
    expect(calls[1].channel).toBe("room-e");
    expect(calls[2].type).toBe("subscribe");
    expect(calls[2].channel).toBe("room-e");
  });
    test("ignores extra releases after zero refs", async () => {
    const { pusher, calls } = createFakePusher();
    resetGlobalPusherState(pusher);

    const originalWarn = console.warn;
    console.warn = () => undefined;
    try {
      subscribePusherChannel("room-f");
      unsubscribePusherChannel("room-f");
      unsubscribePusherChannel("room-f");
      unsubscribePusherChannel("room-f");
    } finally {
      console.warn = originalWarn;
    }

    expect(calls.length).toBe(2);
    expect(calls[0].type).toBe("subscribe");
    expect(calls[0].channel).toBe("room-f");
    expect(calls[1].type).toBe("unsubscribe");
    expect(calls[1].channel).toBe("room-f");
  });
    test("re-subscribes if channel lookup is missing", async () => {
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
    globalWithPusherState.__pusherChannelRecoveryWarnings = {};

    const originalWarn = console.warn;
    console.warn = () => undefined;
    try {
      subscribePusherChannel("room-g");
      unsubscribePusherChannel("room-g");
    } finally {
      console.warn = originalWarn;
    }

    expect(calls.length).toBe(2);
    expect(calls[0].type).toBe("subscribe");
    expect(calls[0].channel).toBe("room-g");
    expect(calls[1].type).toBe("unsubscribe");
    expect(calls[1].channel).toBe("room-g");
  });
    test("subscribes when count starts at zero even with channel object", async () => {
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

    expect(calls.length).toBe(2);
    expect(calls[0].type).toBe("subscribe");
    expect(calls[0].channel).toBe("room-h");
    expect(calls[1].type).toBe("unsubscribe");
    expect(calls[1].channel).toBe("room-h");
  });
  });

  describe("Recovery warning dedupe", () => {
    test("warns once for repeated unsubscribe underflow", async () => {
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

    expect(calls.length).toBe(0);
    expect(warnings.length).toBe(1);
    const warningContainsUnderflow = warnings[0]?.includes("underflow");
    expect(warningContainsUnderflow).toBeTruthy();
  });
    test("warns once for repeated missing-channel recovery", async () => {
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

    expect(calls.length).toBe(2);
    expect(warnings.length).toBe(1);
    const warningContainsRecovery = warnings[0]?.includes("Recovered missing channel");
    expect(warningContainsRecovery).toBeTruthy();
  });
    test("re-allows underflow warning after full release reset", async () => {
    const { pusher, calls } = createFakePusher();
    resetGlobalPusherState(pusher);

    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };

    try {
      // First underflow warning should emit once.
      unsubscribePusherChannel("room-k-reset");
      // Acquire/release clears warning key for this channel.
      subscribePusherChannel("room-k-reset");
      unsubscribePusherChannel("room-k-reset");
      // Underflow again should emit a second warning after reset.
      unsubscribePusherChannel("room-k-reset");
    } finally {
      console.warn = originalWarn;
    }

    expect(calls.length).toBe(2);
    expect(calls[0].type).toBe("subscribe");
    expect(calls[0].channel).toBe("room-k-reset");
    expect(calls[1].type).toBe("unsubscribe");
    expect(calls[1].channel).toBe("room-k-reset");
    expect(warnings.length).toBe(2);
  });
  });

  describe("Channel name normalization", () => {
    test("normalizes channel names for subscribe/unsubscribe", async () => {
    const { pusher, calls } = createFakePusher();
    resetGlobalPusherState(pusher);

    subscribePusherChannel(" room-k ");
    unsubscribePusherChannel("room-k");

    expect(calls.length).toBe(2);
    expect(calls[0].type).toBe("subscribe");
    expect(calls[0].channel).toBe("room-k");
    expect(calls[1].type).toBe("unsubscribe");
    expect(calls[1].channel).toBe("room-k");
  });
    test("ignores whitespace-only channel release", async () => {
    const { pusher, calls } = createFakePusher();
    resetGlobalPusherState(pusher);

    unsubscribePusherChannel("   ");
    expect(calls.length).toBe(0);
  });
    test("ignores undefined channel release", async () => {
    const { pusher, calls } = createFakePusher();
    resetGlobalPusherState(pusher);

    unsubscribePusherChannel(undefined as unknown as string);
    expect(calls.length).toBe(0);
  });
    test("throws when subscribing with whitespace-only channel", async () => {
    const { pusher } = createFakePusher();
    resetGlobalPusherState(pusher);

    let threw = false;
    try {
      subscribePusherChannel("   ");
    } catch (error) {
      threw =
        error instanceof Error &&
        error.message.includes("channelName is required");
    }

    expect(threw).toBeTruthy();
  });
    test("throws clear error for undefined subscribe channel", async () => {
    const { pusher } = createFakePusher();
    resetGlobalPusherState(pusher);

    let threw = false;
    try {
      subscribePusherChannel(undefined as unknown as string);
    } catch (error) {
      threw =
        error instanceof Error &&
        error.message.includes("channelName is required");
    }

    expect(threw).toBeTruthy();
  });
  });
});
