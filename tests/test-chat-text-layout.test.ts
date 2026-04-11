import { describe, expect, test } from "bun:test";
import {
  buildChatTextLineEnds,
  getChatTextFont,
  getChatTextLineHeight,
  shouldUseDetailedAssistantTokens,
} from "../src/apps/chats/utils/chatTextLayout";

describe("chat text layout heuristics", () => {
  test("returns the Geneva chat font shorthand", () => {
    expect(getChatTextFont(12)).toBe('12px "Geneva-12"');
  });

  test("returns a stable chat line height", () => {
    expect(getChatTextLineHeight(12)).toBe(17);
    expect(getChatTextLineHeight(16)).toBe(22);
  });

  test("keeps per-token animation for short replies", () => {
    expect(
      shouldUseDetailedAssistantTokens({
        tokenCount: 24,
        textLength: 120,
        lineCount: 4,
      })
    ).toBe(true);
  });

  test("disables per-token animation for long replies", () => {
    expect(
      shouldUseDetailedAssistantTokens({
        tokenCount: 120,
        textLength: 480,
        lineCount: 10,
      })
    ).toBe(false);
  });

  test("disables per-token animation when line count is high", () => {
    expect(
      shouldUseDetailedAssistantTokens({
        tokenCount: 40,
        textLength: 180,
        lineCount: 8,
      })
    ).toBe(false);
  });

  test("builds reveal line ends from pretext line text", () => {
    expect(buildChatTextLineEnds(["hello", " world"], 11)).toEqual([5, 11]);
    expect(buildChatTextLineEnds([], 4)).toEqual([4]);
  });
});
