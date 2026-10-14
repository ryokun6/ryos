import { describe, expect, test } from "bun:test";
import { ASSISTANT_SUMMON_MESSAGE } from "../../../src/shared/assistantGreeting";
import {
  CHAT_NUDGE_MESSAGE,
  isChatNudgeText,
  shouldChargeAiChatTurn,
} from "../../../src/shared/aiChatQuota";

const nudge = (text: string) => [{ role: "user", content: text }];

describe("isChatNudgeText", () => {
  test("matches the English nudge and localized 👋 *...* nudges", () => {
    expect(isChatNudgeText(CHAT_NUDGE_MESSAGE)).toBe(true);
    expect(isChatNudgeText("👋 *つつき送信済み*")).toBe(true);
    expect(isChatNudgeText("  👋 *toque enviado*  ")).toBe(true);
  });

  test("does not treat the assistant summon or a normal message as a nudge", () => {
    expect(isChatNudgeText(ASSISTANT_SUMMON_MESSAGE)).toBe(false);
    expect(isChatNudgeText("hello")).toBe(false);
    expect(isChatNudgeText(null)).toBe(false);
  });
});

describe("shouldChargeAiChatTurn", () => {
  test("charges nudges for anonymous and signed-in users", () => {
    for (const isAuthenticated of [false, true]) {
      expect(
        shouldChargeAiChatTurn({
          trigger: "submit-message",
          isAuthenticated,
          channel: "chat",
          messages: nudge(CHAT_NUDGE_MESSAGE),
        })
      ).toBe(true);
      expect(
        shouldChargeAiChatTurn({
          trigger: "submit-message",
          isAuthenticated,
          channel: "chat",
          messages: nudge("👋 *Stupser gesendet*"),
        })
      ).toBe(true);
    }
  });

  test("charges the desktop-assistant summon", () => {
    for (const isAuthenticated of [false, true]) {
      expect(
        shouldChargeAiChatTurn({
          trigger: "submit-message",
          isAuthenticated,
          channel: "assistant",
          messages: [
            {
              role: "user",
              parts: [{ type: "text", text: ASSISTANT_SUMMON_MESSAGE }],
            },
          ],
        })
      ).toBe(true);
    }
  });

  test("charges anonymous generations and signed-in user turns and regenerations", () => {
    expect(
      shouldChargeAiChatTurn({
        trigger: "submit-message",
        isAuthenticated: false,
        channel: "chat",
        messages: [{ role: "assistant", content: "hi" }],
      })
    ).toBe(true);
    expect(
      shouldChargeAiChatTurn({
        trigger: "submit-message",
        isAuthenticated: true,
        channel: "chat",
        messages: nudge("what time is it?"),
      })
    ).toBe(true);
    expect(
      shouldChargeAiChatTurn({
        trigger: "regenerate-message",
        isAuthenticated: true,
        channel: "chat",
        messages: [],
      })
    ).toBe(true);
  });

  test("does not charge a signed-in client-tool continuation", () => {
    expect(
      shouldChargeAiChatTurn({
        trigger: "submit-message",
        isAuthenticated: true,
        channel: "chat",
        messages: [
          {
            role: "assistant",
            parts: [{ type: "dynamic-tool", text: undefined }],
          },
        ],
      })
    ).toBe(false);
  });
});
