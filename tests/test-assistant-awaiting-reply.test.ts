import { describe, expect, test } from "bun:test";
import { resolveAssistantAwaitingReply } from "../src/components/assistant/assistantReplyState";
import type { AIChatMessage } from "../src/types/chat";

function userMessage(text: string): AIChatMessage {
  return {
    id: `user-${text}`,
    role: "user",
    parts: [{ type: "text", text }],
  } as AIChatMessage;
}

function assistantMessage(
  parts: Array<Record<string, unknown>>
): AIChatMessage {
  return {
    id: "assistant-1",
    role: "assistant",
    parts,
  } as unknown as AIChatMessage;
}

const completedToolPart = {
  type: "tool-launchApp",
  toolCallId: "call-1",
  state: "output-available",
  input: { id: "textedit" },
  output: { success: true },
};

const runningToolPart = {
  type: "tool-launchApp",
  toolCallId: "call-1",
  state: "input-available",
  input: { id: "textedit" },
};

describe("resolveAssistantAwaitingReply", () => {
  test("awaits right after the user message is sent", () => {
    expect(
      resolveAssistantAwaitingReply({
        messages: [userMessage("hi")],
        isLoading: true,
        hasError: false,
      })
    ).toBe(true);
  });

  test("awaits while a streaming turn has no visible text yet", () => {
    expect(
      resolveAssistantAwaitingReply({
        messages: [userMessage("hi"), assistantMessage([completedToolPart])],
        isLoading: true,
        hasError: false,
      })
    ).toBe(true);
  });

  test("settles once the streaming turn produces text", () => {
    expect(
      resolveAssistantAwaitingReply({
        messages: [
          userMessage("hi"),
          assistantMessage([
            completedToolPart,
            { type: "text", text: "Opening TextEdit…" },
          ]),
        ],
        isLoading: true,
        hasError: false,
      })
    ).toBe(false);
  });

  test("bridges the auto-resend gap after a completed tool-only step", () => {
    // The SDK reports "ready" for a beat between tool steps before it
    // auto-resends; the bubble must keep showing the ticker instead of
    // flashing (and collapsing to) its empty state.
    expect(
      resolveAssistantAwaitingReply({
        messages: [userMessage("hi"), assistantMessage([completedToolPart])],
        isLoading: false,
        hasError: false,
      })
    ).toBe(true);
  });

  test("bridges while a client tool is still executing after the stream closed", () => {
    // The SDK sets "ready" as soon as the stream ends even though the
    // client tool handler is still running; its output (and the follow-up
    // request) arrive moments later.
    expect(
      resolveAssistantAwaitingReply({
        messages: [userMessage("hi"), assistantMessage([runningToolPart])],
        isLoading: false,
        hasError: false,
      })
    ).toBe(true);
  });

  test("does not bridge after an error", () => {
    expect(
      resolveAssistantAwaitingReply({
        messages: [userMessage("hi"), assistantMessage([completedToolPart])],
        isLoading: false,
        hasError: true,
      })
    ).toBe(false);
  });

  test("idle with a finished reply is settled", () => {
    expect(
      resolveAssistantAwaitingReply({
        messages: [
          userMessage("hi"),
          assistantMessage([{ type: "text", text: "Done!" }]),
        ],
        isLoading: false,
        hasError: false,
      })
    ).toBe(false);
  });

  test("empty conversation is settled unless loading", () => {
    expect(
      resolveAssistantAwaitingReply({
        messages: [],
        isLoading: false,
        hasError: false,
      })
    ).toBe(false);
    expect(
      resolveAssistantAwaitingReply({
        messages: [],
        isLoading: true,
        hasError: false,
      })
    ).toBe(true);
  });
});
