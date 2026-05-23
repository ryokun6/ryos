import { describe, expect, test } from "bun:test";
import {
  getAssistantVisibleText,
  getVisibleTextPartText,
} from "../src/apps/chats/utils/aiMessageText";
import { parseRyoMention } from "../src/apps/chats/utils/ryoMention";
import { cleanTextForSpeech } from "../src/apps/chats/utils/textForSpeech";

describe("chat speech utilities", () => {
  test("extracts visible assistant text across text parts only", () => {
    expect(
      getAssistantVisibleText({
        parts: [
          { type: "text", text: "!!!! urgent" },
          { type: "tool-aquarium" },
          { type: "text", text: " reply" },
        ],
      })
    ).toBe("urgent reply");
  });

  test("normalizes urgent prefixes for display/highlight offsets", () => {
    expect(getVisibleTextPartText("!!!! hello")).toBe("hello");
    expect(getVisibleTextPartText("hello")).toBe("hello");
  });

  test("cleans markdown and links before speech", () => {
    expect(
      cleanTextForSpeech(
        "!!!! read [the docs](https://example.com) and ```ts\nconst x = 1\n``` visit https://noise.test"
      )
    ).toBe("read the docs and visit");
  });

  test("parses room Ryo mentions", () => {
    expect(parseRyoMention("@ryo hello", "nudge")).toEqual({
      isMention: true,
      messageContent: "hello",
    });
    expect(parseRyoMention("@ryo", "nudge")).toEqual({
      isMention: true,
      messageContent: "nudge",
    });
    expect(parseRyoMention("hey @ryo", "nudge")).toEqual({
      isMention: false,
      messageContent: "",
    });
  });
});
