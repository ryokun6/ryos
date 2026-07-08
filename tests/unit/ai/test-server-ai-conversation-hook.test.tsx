/**
 * Regression tests for `useServerAIConversation` request efficiency.
 *
 * The Ryo (`chat`) and desktop-assistant (`assistant`) threads each mount
 * this hook, and its callers pass inline closures for `isChatReady` /
 * `applyMessages` / `onError`. A previous version keyed its hydration
 * effect on those closures, so every re-render of a chat component fired a
 * forced `GET /api/ai/conversations/:channel` — hundreds of thousands of
 * requests per day in production. These tests pin the fixed behavior:
 *
 * - exactly one hydration per identity, regardless of re-renders
 * - focus/visibility refreshes throttled to FOCUS_REFRESH_MIN_INTERVAL_MS
 *   (`focus` + `visibilitychange` fire together on tab activation)
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  setSystemTime,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import {
  FOCUS_REFRESH_MIN_INTERVAL_MS,
  useServerAIConversation,
} from "../../../src/hooks/useServerAIConversation";
import { clearAIConversationSessionCache } from "../../../src/api/aiConversations";
import { useChatsStore } from "../../../src/stores/useChatsStore";

let registeredDomForSuite = false;
let host: HTMLDivElement | null = null;
let root: Root | null = null;

const originalFetch = globalThis.fetch;

interface FakeRealtimeChannel {
  name: string;
  bind: () => void;
  unbind: () => void;
}

const globalWithPusher = globalThis as typeof globalThis & {
  __pusherClient?: unknown;
  __pusherChannelRefCounts?: Record<string, number>;
};

function installFakePusherClient(): void {
  const channels = new Map<string, FakeRealtimeChannel>();
  const ensure = (name: string): FakeRealtimeChannel => {
    let channel = channels.get(name);
    if (!channel) {
      channel = { name, bind: () => undefined, unbind: () => undefined };
      channels.set(name, channel);
    }
    return channel;
  };
  globalWithPusher.__pusherClient = {
    connection: { bind: () => undefined, unbind: () => undefined },
    subscribe: (name: string) => ensure(name),
    unsubscribe: () => undefined,
    channel: (name: string) => channels.get(name),
  };
  globalWithPusher.__pusherChannelRefCounts = {};
}

let conversationRequestCount = 0;

function installConversationFetchMock(owner: () => string): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (!url.includes("/api/ai/conversations/")) {
      throw new Error(`Unexpected fetch in test: ${url}`);
    }
    conversationRequestCount += 1;
    return Response.json({
      owner: owner(),
      conversation: {
        id: "11111111-1111-4111-8111-111111111111",
        channel: "chat",
        revision: 0,
        createdAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z",
        messageCount: 0,
        oldestSeq: null,
        newestSeq: null,
        historyTruncated: false,
      },
      messages: [],
    });
  }) as typeof fetch;
}

function ConversationProbe({
  username,
  tick,
}: {
  username: string;
  tick: number;
}) {
  // Inline closures on purpose: this mirrors the real callers (useAiChat,
  // useAssistantChat) and is exactly what made hydration re-run per render.
  useServerAIConversation({
    channel: "chat",
    username,
    isAuthenticated: true,
    isChatReady: () => true,
    applyMessages: () => undefined,
    onError: () => undefined,
  });
  return <span data-tick={tick} />;
}

async function renderProbe(username: string, tick: number): Promise<void> {
  await act(async () => {
    root?.render(<ConversationProbe username={username} tick={tick} />);
  });
}

async function dispatchWindowEvent(type: string): Promise<void> {
  await act(async () => {
    if (type === "visibilitychange") {
      document.dispatchEvent(new Event(type));
    } else {
      window.dispatchEvent(new Event(type));
    }
  });
}

beforeAll(() => {
  if (typeof document === "undefined") {
    GlobalRegistrator.register();
    registeredDomForSuite = true;
  }
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    configurable: true,
    writable: true,
    value: true,
  });
});

beforeEach(() => {
  clearAIConversationSessionCache();
  installFakePusherClient();
  conversationRequestCount = 0;
  useChatsStore.setState({ username: "alice", isAuthenticated: true });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  root = null;
  host?.remove();
  host = null;
  globalThis.fetch = originalFetch;
  setSystemTime();
  delete globalWithPusher.__pusherClient;
  delete globalWithPusher.__pusherChannelRefCounts;
  clearAIConversationSessionCache();
  useChatsStore.setState({ username: null, isAuthenticated: false });
});

afterAll(() => {
  Reflect.deleteProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT");
  if (registeredDomForSuite && GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
});

describe("useServerAIConversation request efficiency", () => {
  test("hydrates once per identity even when the caller re-renders", async () => {
    installConversationFetchMock(() => "alice");

    await renderProbe("alice", 0);
    expect(conversationRequestCount).toBe(1);

    // Re-render repeatedly with fresh inline closures (the worst case that
    // previously re-fetched on every render).
    for (let tick = 1; tick <= 5; tick += 1) {
      await renderProbe("alice", tick);
    }
    expect(conversationRequestCount).toBe(1);
  });

  test("throttles focus/visibility refreshes to the minimum interval", async () => {
    installConversationFetchMock(() => "alice");
    const baseTime = new Date("2026-07-07T12:00:00.000Z");
    setSystemTime(baseTime);

    await renderProbe("alice", 0);
    expect(conversationRequestCount).toBe(1);

    // Tab activation fires both events; within the interval neither should
    // trigger a request.
    await dispatchWindowEvent("focus");
    await dispatchWindowEvent("visibilitychange");
    expect(conversationRequestCount).toBe(1);

    // Past the interval a single refresh goes through, and the paired
    // visibilitychange from the same activation is still deduplicated.
    setSystemTime(
      new Date(baseTime.getTime() + FOCUS_REFRESH_MIN_INTERVAL_MS + 1_000)
    );
    await dispatchWindowEvent("focus");
    await dispatchWindowEvent("visibilitychange");
    expect(conversationRequestCount).toBe(2);
  });

  test("re-hydrates when the authenticated identity changes", async () => {
    let owner = "alice";
    installConversationFetchMock(() => owner);

    await renderProbe("alice", 0);
    expect(conversationRequestCount).toBe(1);

    owner = "bob";
    useChatsStore.setState({ username: "bob", isAuthenticated: true });
    await renderProbe("bob", 1);
    expect(conversationRequestCount).toBe(2);
  });
});
