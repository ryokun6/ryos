import { describe, expect, test } from "bun:test";
import { splitAssistantVisibleIntoLineSpeechSegments } from "@/apps/chats/utils/assistantVisibleText";

describe("splitAssistantVisibleIntoLineSpeechSegments", () => {
  test("splits LF lines and skips empty rows", () => {
    const s = splitAssistantVisibleIntoLineSpeechSegments("Hello\n\nWorld");
    expect(s).toEqual([
      { utterance: "Hello", highlightStart: 0, highlightEnd: 5 },
      { utterance: "World", highlightStart: 7, highlightEnd: 12 },
    ]);
  });

  test("tail without trailing newline becomes one segment", () => {
    const s = splitAssistantVisibleIntoLineSpeechSegments("only");
    expect(s).toEqual([{ utterance: "only", highlightStart: 0, highlightEnd: 4 }]);
  });
});
