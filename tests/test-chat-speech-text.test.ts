import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getAssistantVisibleText,
  getChatMessageText,
  getDisplayTextPart,
} from "../src/apps/chats/utils/messageText";
import { cleanTextForSpeech } from "../src/apps/chats/utils/textForSpeech";

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

describe("chat speech text helpers", () => {
  test("normalizes urgent assistant text into the visible display coordinate space", () => {
    const message = {
      parts: [{ type: "text", text: "!!!! Hello &amp; goodbye" }],
    };

    expect(getChatMessageText(message)).toBe("!!!! Hello &amp; goodbye");
    expect(getAssistantVisibleText(message)).toBe("Hello & goodbye");
    expect(getDisplayTextPart("!!!! Hello &amp; goodbye")).toBe("Hello & goodbye");
  });

  test("cleans markdown, URLs, code, and urgent prefixes before speech", () => {
    expect(
      cleanTextForSpeech(
        "!!!! Read [the docs](https://example.com).\n```ts\nalert('x')\n```\nhttps://example.com/raw"
      )
    ).toBe("Read the docs.");
  });
});

describe("chat speech wiring", () => {
  test("ChatMessages uses the parent speech queue and forwards highlight state", () => {
    const source = readSource("src/apps/chats/components/ChatMessages.tsx");

    expect(source.includes("useTtsQueue")).toBe(false);
    expect(
      source.match(/highlightSegment=\{highlightSegment\}/g)?.length
    ).toBeGreaterThanOrEqual(2);
    expect(
      source.match(/speakText=\{speakText\}/g)?.length
    ).toBeGreaterThanOrEqual(2);
    expect(
      source.match(/stopSpeech=\{stopSpeech\}/g)?.length
    ).toBeGreaterThanOrEqual(2);
    expect(source.includes("messageId: message.id || messageKey")).toBe(true);
    expect(source.includes("ryos-chat-tts-bubble-active")).toBe(true);
    expect(source.includes("latestAssistantMessageKey === messageKey")).toBe(true);
  });

  test("chat TTS active bubble outline survives macOS chat bubble shadows", () => {
    const source = readSource("src/index.css");

    expect(source.includes(".ryos-chat-tts-bubble-active")).toBe(true);
    expect(
      source.includes("outline: 2px solid rgba(255, 218, 48, 0.95)")
    ).toBe(true);
    expect(
      source.includes(
        ':root[data-os-theme="macosx"] .chat-bubble.ryos-chat-tts-bubble-active'
      )
    ).toBe(true);
  });

  test("useAiChat delegates speech and highlight orchestration to useChatSpeech", () => {
    const source = readSource("src/apps/chats/hooks/useAiChat.ts");

    expect(source.includes("useChatSpeech({")).toBe(true);
    expect(source.includes("chatSpeechRef.current?.speakFinalMessage")).toBe(true);
    expect(source.includes("speechProgressRef")).toBe(false);
  });
});
