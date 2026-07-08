/**
 * Unit + wiring tests for realtime cross-device AI conversation updates.
 *
 * Covers:
 * - the `ai-conversation-updated` event contract parser
 * - guardrail wiring checks that server write sites broadcast the event and
 *   client hooks subscribe to it (same style as test-chat-broadcast-wiring)
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  AI_CONVERSATION_UPDATED_REALTIME_EVENT,
  parseAIConversationUpdatedRealtimeEvent,
} from "../../../src/shared/contracts/aiConversation";

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

const assertHasCall = (source: string, fnName: string): void => {
  const callPattern = new RegExp(`\\b${fnName}\\s*\\(`);
  expect(source).toMatch(callPattern);
};

const countCalls = (source: string, fnName: string): number => {
  const callPattern = new RegExp(`\\b${fnName}\\s*\\(`, "g");
  return source.match(callPattern)?.length || 0;
};

describe("ai-conversation-updated event contract", () => {
  const validEvent = {
    channel: "chat",
    conversationId: "11111111-1111-4111-8111-111111111111",
    revision: 3,
    reason: "turn-complete",
    operationId: "op-1",
  };

  test("event name is stable", () => {
    expect(AI_CONVERSATION_UPDATED_REALTIME_EVENT).toBe(
      "ai-conversation-updated"
    );
  });

  test("parses a valid event", () => {
    expect(parseAIConversationUpdatedRealtimeEvent(validEvent)).toEqual(
      validEvent
    );
  });

  test("accepts every documented reason", () => {
    for (const reason of [
      "turn-begin",
      "turn-complete",
      "greeting",
      "reset",
    ]) {
      expect(
        parseAIConversationUpdatedRealtimeEvent({ ...validEvent, reason })
      ).not.toBeNull();
    }
  });

  test("rejects malformed payloads", () => {
    expect(parseAIConversationUpdatedRealtimeEvent(null)).toBeNull();
    expect(parseAIConversationUpdatedRealtimeEvent("event")).toBeNull();
    expect(parseAIConversationUpdatedRealtimeEvent([])).toBeNull();
    expect(
      parseAIConversationUpdatedRealtimeEvent({
        ...validEvent,
        channel: "rooms",
      })
    ).toBeNull();
    expect(
      parseAIConversationUpdatedRealtimeEvent({
        ...validEvent,
        conversationId: "",
      })
    ).toBeNull();
    expect(
      parseAIConversationUpdatedRealtimeEvent({ ...validEvent, revision: -1 })
    ).toBeNull();
    expect(
      parseAIConversationUpdatedRealtimeEvent({
        ...validEvent,
        revision: 1.5,
      })
    ).toBeNull();
    expect(
      parseAIConversationUpdatedRealtimeEvent({
        ...validEvent,
        reason: "unknown",
      })
    ).toBeNull();
    expect(
      parseAIConversationUpdatedRealtimeEvent({
        ...validEvent,
        operationId: "",
      })
    ).toBeNull();
  });
});

describe("AI conversation realtime broadcast wiring", () => {
  test("chat route broadcasts turn begin/complete updates", () => {
    const source = readSource("api/chat.ts");
    assertHasCall(source, "broadcastAIConversationUpdate");
    // turn-begin, turn-complete
    expect(
      countCalls(source, "broadcastAIConversationUpdate")
    ).toBeGreaterThanOrEqual(2);
    expect(source).toContain('reason: "turn-begin"');
    expect(source).toContain('reason: "turn-complete"');
  });

  test("greeting route broadcasts a greeting update", () => {
    const source = readSource("api/ai/conversations/[channel]/greeting.ts");
    assertHasCall(source, "broadcastAIConversationUpdate");
    expect(source).toContain('reason: "greeting"');
  });

  test("reset route broadcasts a reset update", () => {
    const source = readSource("api/ai/conversations/[channel]/reset.ts");
    assertHasCall(source, "broadcastAIConversationUpdate");
    expect(source).toContain('reason: "reset"');
  });

  test("broadcast helper targets the per-user private-ai channel", () => {
    const source = readSource("api/ai/conversations/_helpers/realtime.ts");
    assertHasCall(source, "getAIConversationRealtimeChannelName");
    assertHasCall(source, "triggerRealtimeEvent");
    expect(source).toContain("AI_CONVERSATION_UPDATED_REALTIME_EVENT");
  });
});

describe("AI conversation realtime client wiring", () => {
  test("shared realtime hook subscribes and filters echoes", () => {
    const source = readSource("src/hooks/useAIConversationRealtime.ts");
    assertHasCall(source, "subscribePusherChannel");
    assertHasCall(source, "unsubscribePusherChannel");
    assertHasCall(source, "parseAIConversationUpdatedRealtimeEvent");
    assertHasCall(source, "isLocalAIConversationOperation");
    assertHasCall(source, "invalidateAIConversationSession");
    expect(source).toContain("AI_CONVERSATION_UPDATED_REALTIME_EVENT");
  });

  test("shared server-conversation hook drives realtime re-hydration", () => {
    const source = readSource("src/hooks/useServerAIConversation.ts");
    assertHasCall(source, "useAIConversationRealtime");
    assertHasCall(source, "loadAIConversation");
  });

  test("Chats AI hook reacts to remote conversation updates", () => {
    const source = readSource("src/apps/chats/hooks/useAiChat.ts");
    assertHasCall(source, "useServerAIConversation");
    expect(source).toContain('channel: "chat"');
  });

  test("desktop assistant hook reacts to remote conversation updates", () => {
    const source = readSource("src/components/assistant/useAssistantChat.ts");
    assertHasCall(source, "useServerAIConversation");
    expect(source).toContain('channel: "assistant"');
  });

  test("client session tracks locally minted operation ids", () => {
    const source = readSource("src/api/aiConversations.ts");
    assertHasCall(source, "trackLocalAIConversationOperation");
    // Sends and resets each mint (and track) an operation id.
    expect(
      countCalls(source, "trackLocalAIConversationOperation")
    ).toBeGreaterThanOrEqual(2);
  });
});
