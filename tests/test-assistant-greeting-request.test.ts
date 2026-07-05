import { describe, expect, test } from "bun:test";
import {
  ASSISTANT_SUMMON_MESSAGE,
  getUserMessageText,
  isAssistantGreetingRequest,
} from "../src/shared/assistantGreeting";

describe("assistant greeting request detection", () => {
  test("matches the summon message in parts format", () => {
    expect(
      isAssistantGreetingRequest(
        [
          {
            role: "user",
            parts: [{ type: "text", text: ASSISTANT_SUMMON_MESSAGE }],
          },
        ],
        { persona: "assistant" }
      )
    ).toBe(true);
  });

  test("matches the summon message in legacy content format", () => {
    expect(
      isAssistantGreetingRequest(
        [{ role: "user", content: ASSISTANT_SUMMON_MESSAGE }],
        { persona: "assistant" }
      )
    ).toBe(true);
  });

  test("rejects when persona is not assistant", () => {
    expect(
      isAssistantGreetingRequest(
        [{ role: "user", content: ASSISTANT_SUMMON_MESSAGE }],
        { persona: "chat" }
      )
    ).toBe(false);
  });

  test("rejects real user messages", () => {
    expect(
      isAssistantGreetingRequest(
        [{ role: "user", content: "open textedit" }],
        { persona: "assistant" }
      )
    ).toBe(false);
  });

  test("rejects when extra user messages are present", () => {
    expect(
      isAssistantGreetingRequest(
        [
          { role: "user", content: ASSISTANT_SUMMON_MESSAGE },
          { role: "user", content: "also hi" },
        ],
        { persona: "assistant" }
      )
    ).toBe(false);
  });

  test("extractUserMessageText prefers parts over content", () => {
    expect(
      getUserMessageText({
        role: "user",
        content: "legacy",
        parts: [{ type: "text", text: "from parts" }],
      })
    ).toBe("from parts");
  });
});
