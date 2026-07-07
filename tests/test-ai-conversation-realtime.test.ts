import { describe, expect, test } from "bun:test";
import {
  AI_CONVERSATION_REALTIME_EVENT,
  AI_CONVERSATION_REALTIME_MAX_DELTA_CODE_POINTS,
  parseAIConversationRealtimeEvent,
  type AIConversationRealtimeEvent,
  type AIConversationRealtimeTurn,
} from "../src/shared/contracts/aiConversationRealtime";
import {
  applyRemoteAIConversationStreamEvent,
  createRemoteAIConversationStream,
} from "../src/services/ai/aiConversationRealtimeReducer";
import {
  AIConversationRealtimeService,
  type AIConversationRealtimeController,
} from "../src/services/ai/AIConversationRealtimeService";
import {
  clearAIConversationSessionCache,
  getAIConversationRequestContext,
} from "../src/api/aiConversations";
import { forwardAIConversationRealtimeStream } from "../api/ai/conversations/_helpers/realtime";
import type { AIChatMessage } from "../src/types/chat";
import type {
  RealtimeChannel,
  RealtimeClient,
  RealtimeConnection,
} from "../src/lib/pusherClient";

const turn: AIConversationRealtimeTurn = {
  channel: "chat",
  conversationId: "11111111-1111-4111-8111-111111111111",
  revision: 3,
  operationId: "op-remote",
  trigger: "submit-message",
  startedAt: "2026-07-07T00:00:00.000Z",
};

function textMessage(
  id: string,
  role: "user" | "assistant",
  text: string
): AIChatMessage {
  return {
    id,
    role,
    parts: [{ type: "text", text }],
    metadata: { createdAt: new Date("2026-07-07T00:00:00.000Z") },
  };
}

describe("AI conversation realtime contract", () => {
  test("parses bounded lifecycle and stream events", () => {
    expect(
      parseAIConversationRealtimeEvent({
        kind: "turn-started",
        ...turn,
      })
    ).toEqual({ kind: "turn-started", ...turn });

    expect(
      parseAIConversationRealtimeEvent({
        kind: "stream-chunks",
        ...turn,
        sequence: 0,
        chunks: [
          { kind: "start", messageId: "assistant-1" },
          { kind: "text-start", id: "text-1" },
          { kind: "text-delta", id: "text-1", delta: "hello" },
        ],
      })
    ).not.toBeNull();
  });

  test("rejects malformed and oversized events at the client boundary", () => {
    expect(
      parseAIConversationRealtimeEvent({
        kind: "stream-chunks",
        ...turn,
        sequence: -1,
        chunks: [{ kind: "start", messageId: "assistant-1" }],
      })
    ).toBeNull();
    expect(
      parseAIConversationRealtimeEvent({
        kind: "stream-chunks",
        ...turn,
        sequence: 0,
        chunks: [
          {
            kind: "text-delta",
            id: "text-1",
            delta: "x".repeat(
              AI_CONVERSATION_REALTIME_MAX_DELTA_CODE_POINTS + 1
            ),
          },
        ],
      })
    ).toBeNull();
    expect(
      parseAIConversationRealtimeEvent({
        kind: "conversation-updated",
        reason: "reset",
        channel: "private",
        conversationId: turn.conversationId,
        revision: 0,
        operationId: "op",
      })
    ).toBeNull();
    expect(
      parseAIConversationRealtimeEvent({
        kind: "turn-started",
        ...turn,
        trigger: "regenerate-message",
      })
    ).toBeNull();
  });
});

describe("remote AI conversation stream reducer", () => {
  test("builds the assistant text incrementally and detects sequence gaps", () => {
    const base = [textMessage("user-1", "user", "hello")];
    const first = applyRemoteAIConversationStreamEvent({
      stream: createRemoteAIConversationStream(turn),
      messages: base,
      event: {
        kind: "stream-chunks",
        ...turn,
        sequence: 0,
        chunks: [
          { kind: "start", messageId: "assistant-1" },
          { kind: "text-start", id: "text-1" },
          { kind: "text-delta", id: "text-1", delta: "live " },
        ],
      },
    });
    expect(first.kind).toBe("applied");
    if (first.kind !== "applied") return;
    expect(first.messages.at(-1)?.parts).toEqual([
      { type: "text", text: "live " },
    ]);

    const second = applyRemoteAIConversationStreamEvent({
      stream: first.stream,
      messages: first.messages,
      event: {
        kind: "stream-chunks",
        ...turn,
        sequence: 1,
        chunks: [
          { kind: "text-delta", id: "text-1", delta: "reply" },
          { kind: "text-end", id: "text-1" },
        ],
      },
    });
    expect(second.kind).toBe("applied");
    if (second.kind !== "applied") return;
    expect(second.messages.at(-1)?.parts).toEqual([
      { type: "text", text: "live reply" },
    ]);

    expect(
      applyRemoteAIConversationStreamEvent({
        stream: second.stream,
        messages: second.messages,
        event: {
          kind: "stream-chunks",
          ...turn,
          sequence: 3,
          chunks: [{ kind: "text-delta", id: "text-1", delta: "lost" }],
        },
      })
    ).toEqual({ kind: "gap" });
  });

  test("removes the regenerated assistant suffix before streaming replacement text", () => {
    const regenerateTurn: AIConversationRealtimeTurn = {
      ...turn,
      operationId: "op-regenerate",
      trigger: "regenerate-message",
      targetMessageId: "assistant-old",
    };
    const result = applyRemoteAIConversationStreamEvent({
      stream: createRemoteAIConversationStream(regenerateTurn),
      messages: [
        textMessage("user-1", "user", "question"),
        textMessage("assistant-old", "assistant", "old answer"),
      ],
      event: {
        kind: "stream-chunks",
        ...regenerateTurn,
        sequence: 0,
        chunks: [
          { kind: "start", messageId: "assistant-new" },
          { kind: "text-start", id: "text-new" },
          { kind: "text-delta", id: "text-new", delta: "new answer" },
        ],
      },
    });
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") return;
    expect(result.messages.map((message) => message.id)).toEqual([
      "user-1",
      "assistant-new",
    ]);
  });

  test("reports a gap when the streamed assistant text part was replaced", () => {
    const first = applyRemoteAIConversationStreamEvent({
      stream: createRemoteAIConversationStream(turn),
      messages: [textMessage("user-1", "user", "hello")],
      event: {
        kind: "stream-chunks",
        ...turn,
        sequence: 0,
        chunks: [
          { kind: "start", messageId: "assistant-1" },
          { kind: "text-start", id: "text-1" },
          { kind: "text-delta", id: "text-1", delta: "live" },
        ],
      },
    });
    expect(first.kind).toBe("applied");
    if (first.kind !== "applied") return;

    const replaced = first.messages.map((message) =>
      message.id === "assistant-1" ? { ...message, parts: [] } : message
    );
    expect(
      applyRemoteAIConversationStreamEvent({
        stream: first.stream,
        messages: replaced,
        event: {
          kind: "stream-chunks",
          ...turn,
          sequence: 1,
          chunks: [{ kind: "text-delta", id: "text-1", delta: " reply" }],
        },
      })
    ).toEqual({ kind: "gap" });
  });
});

describe("server AI conversation stream forwarding", () => {
  test("forwards only bounded visible-text chunks and publishes terminal state last", async () => {
    const published: AIConversationRealtimeEvent[] = [];
    const source = new ReadableStream<string>({
      start(controller) {
        controller.enqueue(
          'data: {"type":"start","messageId":"assistant-1"}\n\n'
        );
        controller.enqueue('data: {"type":"text-start","id":"text-1"}\n\n');
        controller.enqueue(
          'data: {"type":"text-delta","id":"text-1","delta":"streamed "}\n\n'
        );
        controller.enqueue(
          'data: {"type":"tool-output-available","toolCallId":"tool-1","output":{"secret":"not-forwarded"}}\n\n'
        );
        controller.enqueue(
          'data: {"type":"text-delta","id":"text-1","delta":"live"}\n\n'
        );
        controller.enqueue('data: {"type":"text-end","id":"text-1"}\n\n');
        controller.enqueue("data: [DONE]\n\n");
        controller.close();
      },
    });
    const terminal: AIConversationRealtimeEvent = {
      kind: "turn-finished",
      ...turn,
      revision: 4,
      outcome: "completed",
    };

    await forwardAIConversationRealtimeStream({
      stream: source,
      turn,
      getTerminalEvent: () => terminal,
      publish: async (event) => {
        published.push(event);
      },
    });

    expect(published.at(-1)).toEqual(terminal);
    const streamEvents = published.filter(
      (
        event
      ): event is Extract<
        AIConversationRealtimeEvent,
        { kind: "stream-chunks" }
      > => event.kind === "stream-chunks"
    );
    expect(streamEvents.map((event) => event.sequence)).toEqual(
      streamEvents.map((_, index) => index)
    );
    const chunks = streamEvents.flatMap((event) => event.chunks);
    expect(
      chunks
        .filter((chunk) => chunk.kind === "text-delta")
        .map((chunk) => chunk.delta)
        .join("")
    ).toBe("streamed live");
    expect(JSON.stringify(published)).not.toContain("not-forwarded");
  });

  test("flushes paused text promptly and keeps escaped payloads bounded", async () => {
    const published: Array<{
      event: AIConversationRealtimeEvent;
      at: number;
    }> = [];
    let sourceClosedAt = 0;
    const source = new ReadableStream<string>({
      start(controller) {
        controller.enqueue(
          'data: {"type":"start","messageId":"assistant-escaped"}\n\n'
        );
        controller.enqueue(
          'data: {"type":"text-start","id":"text-escaped"}\n\n'
        );
        controller.enqueue(
          `data: ${JSON.stringify({
            type: "text-delta",
            id: "text-escaped",
            delta: "\u0000".repeat(
              AI_CONVERSATION_REALTIME_MAX_DELTA_CODE_POINTS
            ),
          })}\n\n`
        );
        setTimeout(() => {
          sourceClosedAt = Date.now();
          controller.close();
        }, 500);
      },
    });

    await forwardAIConversationRealtimeStream({
      stream: source,
      turn,
      getTerminalEvent: () => null,
      publish: async (event) => {
        published.push({ event, at: Date.now() });
      },
    });

    const textEvent = published.find(
      ({ event }) =>
        event.kind === "stream-chunks" &&
        event.chunks.some((chunk) => chunk.kind === "text-delta")
    );
    expect(textEvent).toBeDefined();
    expect(textEvent?.at).toBeLessThan(sourceClosedAt);
    const encoder = new TextEncoder();
    for (const { event } of published) {
      expect(encoder.encode(JSON.stringify(event)).byteLength).toBeLessThanOrEqual(
        7 * 1024
      );
    }
  }, 2_000);
});

class FakeRealtimeConnection implements RealtimeConnection {
  private readonly handlers = new Map<string, Set<() => void>>();
  state = "connected";

  bind(eventName: string, handler: () => void): void {
    const handlers = this.handlers.get(eventName) ?? new Set();
    handlers.add(handler);
    this.handlers.set(eventName, handlers);
  }

  unbind(eventName?: string, handler?: () => void): void {
    if (!eventName) {
      this.handlers.clear();
      return;
    }
    if (!handler) {
      this.handlers.delete(eventName);
      return;
    }
    this.handlers.get(eventName)?.delete(handler);
  }
}

class FakeRealtimeChannel implements RealtimeChannel {
  private readonly handlers = new Map<
    string,
    Set<(payload: unknown) => void>
  >();

  constructor(readonly name: string) {}

  bind(eventName: string, handler: (payload: unknown) => void): void {
    const handlers = this.handlers.get(eventName) ?? new Set();
    handlers.add(handler);
    this.handlers.set(eventName, handlers);
  }

  unbind(eventName?: string, handler?: (payload: unknown) => void): void {
    if (!eventName) {
      this.handlers.clear();
      return;
    }
    if (!handler) {
      this.handlers.delete(eventName);
      return;
    }
    this.handlers.get(eventName)?.delete(handler);
  }

  emit(eventName: string, payload: unknown): void {
    this.handlers
      .get(eventName)
      ?.forEach((handler) => handler(payload));
  }
}

class FakeRealtimeClient implements RealtimeClient {
  readonly connection = new FakeRealtimeConnection();
  readonly channels = new Map<string, FakeRealtimeChannel>();
  subscribeCount = 0;
  unsubscribeCount = 0;

  subscribe(channelName: string): FakeRealtimeChannel {
    this.subscribeCount += 1;
    const channel = new FakeRealtimeChannel(channelName);
    this.channels.set(channelName, channel);
    return channel;
  }

  unsubscribe(channelName: string): void {
    this.unsubscribeCount += 1;
    this.channels.delete(channelName);
  }

  channel(channelName: string): FakeRealtimeChannel | undefined {
    return this.channels.get(channelName);
  }
}

function installFakeRealtimeClient(fakeClient: FakeRealtimeClient): () => void {
  const globalRealtime = globalThis as typeof globalThis & {
    __pusherClient?: RealtimeClient;
    __pusherChannelRefCounts?: Record<string, number>;
    __pusherConnectionObservable?: unknown;
  };
  const previousClient = globalRealtime.__pusherClient;
  const previousCounts = globalRealtime.__pusherChannelRefCounts;
  const previousObservable = globalRealtime.__pusherConnectionObservable;
  globalRealtime.__pusherClient = fakeClient;
  globalRealtime.__pusherChannelRefCounts = {};
  globalRealtime.__pusherConnectionObservable = undefined;
  return () => {
    globalRealtime.__pusherClient = previousClient;
    globalRealtime.__pusherChannelRefCounts = previousCounts;
    globalRealtime.__pusherConnectionObservable = previousObservable;
  };
}

describe("AI conversation realtime client service", () => {
  test("uses one subscription and replaces partial text with the committed snapshot", async () => {
    const fakeClient = new FakeRealtimeClient();
    const restoreRealtime = installFakeRealtimeClient(fakeClient);

    const service = new AIConversationRealtimeService("chat");
    let liveMessages = [textMessage("user-1", "user", "hello")];
    let canonicalMessages = [...liveMessages];
    let canonicalRevision = turn.revision;
    const controller: AIConversationRealtimeController = {
      getStatus: () => "ready",
      getMessages: () => liveMessages,
      setMessages: (messages) => {
        liveMessages = messages;
      },
      load: async () => ({
          owner: "alice",
          conversation: {
            id: turn.conversationId,
            channel: "chat",
            revision: canonicalRevision,
            createdAt: turn.startedAt,
            updatedAt: turn.startedAt,
            messageCount: canonicalMessages.length,
            oldestSeq: canonicalMessages.length > 0 ? 1 : null,
            newestSeq:
              canonicalMessages.length > 0 ? canonicalMessages.length : null,
            historyTruncated: false,
            canImportLegacy: false,
          },
          messages: canonicalMessages,
          stale: false,
        }),
      commit: (loaded) => {
        liveMessages = loaded.messages;
        return true;
      },
      stop: () => undefined,
    };

    try {
      const unregisterSecondary = service.register({
        owner: "alice",
        priority: 0,
        controller,
      });
      const unregisterPrimary = service.register({
        owner: "alice",
        priority: 1,
        controller,
      });
      expect(fakeClient.subscribeCount).toBe(1);

      const channel = fakeClient.channels.get("private-chats-alice");
      expect(channel).toBeDefined();
      channel?.emit(AI_CONVERSATION_REALTIME_EVENT, {
        kind: "turn-started",
        ...turn,
      });
      await Promise.resolve();
      channel?.emit(AI_CONVERSATION_REALTIME_EVENT, {
        kind: "stream-chunks",
        ...turn,
        sequence: 0,
        chunks: [
          { kind: "start", messageId: "assistant-live" },
          { kind: "text-start", id: "text-live" },
          { kind: "text-delta", id: "text-live", delta: "partial" },
        ],
      });
      expect(service.getSnapshot()).toBe(true);
      expect(liveMessages.at(-1)?.parts).toEqual([
        { type: "text", text: "partial" },
      ]);

      canonicalRevision += 1;
      canonicalMessages = [
        textMessage("user-1", "user", "hello"),
        textMessage("assistant-live", "assistant", "committed"),
      ];
      channel?.emit(AI_CONVERSATION_REALTIME_EVENT, {
        kind: "turn-finished",
        ...turn,
        revision: canonicalRevision,
        outcome: "completed",
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(service.getSnapshot()).toBe(false);
      expect(liveMessages.at(-1)?.parts).toEqual([
        { type: "text", text: "committed" },
      ]);

      channel?.emit(AI_CONVERSATION_REALTIME_EVENT, {
        kind: "stream-chunks",
        ...turn,
        sequence: 1,
        chunks: [{ kind: "text-delta", id: "text-live", delta: " stale" }],
      });
      expect(service.getSnapshot()).toBe(false);
      expect(liveMessages.at(-1)?.parts).toEqual([
        { type: "text", text: "committed" },
      ]);

      unregisterPrimary();
      unregisterSecondary();
      expect(fakeClient.unsubscribeCount).toBe(1);
    } finally {
      service.destroy();
      restoreRealtime();
    }
  });

  test("reloads canonical state after a missing sequence deadline", async () => {
    const fakeClient = new FakeRealtimeClient();
    const restoreRealtime = installFakeRealtimeClient(fakeClient);
    const service = new AIConversationRealtimeService("chat");
    let liveMessages = [textMessage("user-1", "user", "hello")];
    let canonicalMessages = [...liveMessages];
    let canonicalRevision = turn.revision;
    let loadCount = 0;
    const controller: AIConversationRealtimeController = {
      getStatus: () => "ready",
      getMessages: () => liveMessages,
      setMessages: (messages) => {
        liveMessages = messages;
      },
      load: async () => {
        loadCount += 1;
        return {
          owner: "alice",
          conversation: {
            id: turn.conversationId,
            channel: "chat",
            revision: canonicalRevision,
            createdAt: turn.startedAt,
            updatedAt: turn.startedAt,
            messageCount: canonicalMessages.length,
            oldestSeq: canonicalMessages.length > 0 ? 1 : null,
            newestSeq:
              canonicalMessages.length > 0 ? canonicalMessages.length : null,
            historyTruncated: false,
            canImportLegacy: false,
          },
          messages: canonicalMessages,
          stale: false,
        };
      },
      commit: (loaded) => {
        liveMessages = loaded.messages;
        return true;
      },
      stop: () => undefined,
    };

    try {
      const unregister = service.register({
        owner: "alice",
        priority: 1,
        controller,
      });
      const channel = fakeClient.channels.get("private-chats-alice");
      channel?.emit(AI_CONVERSATION_REALTIME_EVENT, {
        kind: "turn-started",
        ...turn,
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(loadCount).toBe(1);

      channel?.emit(AI_CONVERSATION_REALTIME_EVENT, {
        kind: "stream-chunks",
        ...turn,
        sequence: 1,
        chunks: [{ kind: "text-delta", id: "text-live", delta: "late" }],
      });
      await new Promise((resolve) => setTimeout(resolve, 1_100));
      expect(loadCount).toBeGreaterThanOrEqual(2);
      expect(service.getSnapshot()).toBe(true);

      canonicalRevision += 1;
      canonicalMessages = [
        textMessage("user-1", "user", "hello"),
        textMessage("assistant-live", "assistant", "canonical"),
      ];
      channel?.emit(AI_CONVERSATION_REALTIME_EVENT, {
        kind: "turn-finished",
        ...turn,
        revision: canonicalRevision,
        outcome: "completed",
      });
      await Promise.resolve();
      await Promise.resolve();
      expect(service.getSnapshot()).toBe(false);
      expect(liveMessages.at(-1)?.parts).toEqual([
        { type: "text", text: "canonical" },
      ]);

      unregister();
    } finally {
      service.destroy();
      restoreRealtime();
    }
  }, 3_000);

  test("applies reset updates even when the operation originated locally", async () => {
    const previousFetch = globalThis.fetch;
    const fakeClient = new FakeRealtimeClient();
    const restoreRealtime = installFakeRealtimeClient(fakeClient);
    const service = new AIConversationRealtimeService("chat");
    const replacementConversationId = "22222222-2222-4222-8222-222222222222";
    let stopCount = 0;
    let liveMessages = [textMessage("user-1", "user", "old")];
    clearAIConversationSessionCache();
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          owner: "alice",
          conversation: {
            id: turn.conversationId,
            channel: "chat",
            revision: turn.revision,
            createdAt: turn.startedAt,
            updatedAt: turn.startedAt,
            messageCount: 0,
            oldestSeq: null,
            newestSeq: null,
            historyTruncated: false,
            canImportLegacy: false,
          },
          messages: [],
          page: { nextCursor: null, hasMore: false },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );

    try {
      const requestContext = await getAIConversationRequestContext({
        channel: "chat",
        username: "alice",
        localMessages: [],
      });
      expect(requestContext).toBeDefined();
      if (!requestContext) throw new Error("Missing local request context");
      const controller: AIConversationRealtimeController = {
        getStatus: () => "ready",
        getMessages: () => liveMessages,
        setMessages: (messages) => {
          liveMessages = messages;
        },
        load: async () => ({
          owner: "alice",
          conversation: {
            id: replacementConversationId,
            channel: "chat",
            revision: 0,
            createdAt: turn.startedAt,
            updatedAt: turn.startedAt,
            messageCount: 0,
            oldestSeq: null,
            newestSeq: null,
            historyTruncated: false,
            canImportLegacy: false,
          },
          messages: [],
          stale: false,
        }),
        commit: (loaded) => {
          liveMessages = loaded.messages;
          return true;
        },
        stop: () => {
          stopCount += 1;
        },
      };
      const unregister = service.register({
        owner: "alice",
        priority: 1,
        controller,
      });
      fakeClient.channels.get("private-chats-alice")?.emit(
        AI_CONVERSATION_REALTIME_EVENT,
        {
          kind: "conversation-updated",
          reason: "reset",
          channel: "chat",
          conversationId: replacementConversationId,
          revision: 0,
          operationId: requestContext.operationId,
        }
      );
      await Promise.resolve();
      await Promise.resolve();
      expect(stopCount).toBe(1);
      expect(liveMessages).toEqual([]);
      unregister();
    } finally {
      service.destroy();
      restoreRealtime();
      globalThis.fetch = previousFetch;
      clearAIConversationSessionCache();
    }
  });

  test("retries a failed base hydration without waiting for focus", async () => {
    const fakeClient = new FakeRealtimeClient();
    const restoreRealtime = installFakeRealtimeClient(fakeClient);
    const service = new AIConversationRealtimeService("chat");
    let liveMessages = [textMessage("user-1", "user", "hello")];
    let loadCount = 0;
    const controller: AIConversationRealtimeController = {
      getStatus: () => "ready",
      getMessages: () => liveMessages,
      setMessages: (messages) => {
        liveMessages = messages;
      },
      load: async () => {
        loadCount += 1;
        if (loadCount === 1) throw new Error("temporary load failure");
        return {
          owner: "alice",
          conversation: {
            id: turn.conversationId,
            channel: "chat",
            revision: turn.revision,
            createdAt: turn.startedAt,
            updatedAt: turn.startedAt,
            messageCount: 1,
            oldestSeq: 1,
            newestSeq: 1,
            historyTruncated: false,
            canImportLegacy: false,
          },
          messages: [textMessage("user-1", "user", "hello")],
          stale: false,
        };
      },
      commit: (loaded) => {
        liveMessages = loaded.messages;
        return true;
      },
      stop: () => undefined,
    };

    try {
      const unregister = service.register({
        owner: "alice",
        priority: 1,
        controller,
      });
      const channel = fakeClient.channels.get("private-chats-alice");
      channel?.emit(AI_CONVERSATION_REALTIME_EVENT, {
        kind: "turn-started",
        ...turn,
      });
      channel?.emit(AI_CONVERSATION_REALTIME_EVENT, {
        kind: "stream-chunks",
        ...turn,
        sequence: 0,
        chunks: [
          { kind: "start", messageId: "assistant-retried" },
          { kind: "text-start", id: "text-retried" },
          { kind: "text-delta", id: "text-retried", delta: "recovered" },
        ],
      });
      await new Promise((resolve) => setTimeout(resolve, 600));

      expect(loadCount).toBeGreaterThanOrEqual(2);
      expect(liveMessages.at(-1)?.parts).toEqual([
        { type: "text", text: "recovered" },
      ]);
      unregister();
    } finally {
      service.destroy();
      restoreRealtime();
    }
  }, 2_000);
});
