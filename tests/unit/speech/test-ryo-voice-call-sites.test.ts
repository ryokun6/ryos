import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readSrc(relativeFromTests: string): string {
  return readFileSync(resolve(import.meta.dir, relativeFromTests), "utf8");
}

describe("Ryo ElevenLabs voice call-site audit", () => {
  test("Ryo chat is the only in-OS useTtsQueue caller and sends ryo-chat", () => {
    const chat = readSrc("../../../src/apps/chats/hooks/useChatSpeechSync.ts");
    expect(chat).toContain("useTtsQueue");
    expect(chat).toContain("RYO_CHAT_SPEECH_SOURCE");
    expect(chat).toContain("source: RYO_CHAT_SPEECH_SOURCE");

    const queue = readSrc("../../../src/hooks/useTtsQueue.ts");
    expect(queue).toContain("buildSpeechApiRequestBody");
    expect(queue).toContain("mintRyoSpeechPermit");
    expect(queue).toContain("source: SpeechSource");
    expect(queue).toContain("/api/speech");
    expect(chat).toContain("messageId");
  });

  test("non-chat speak paths use browser speechSynthesis, not useTtsQueue", () => {
    const files = [
      "../../../src/apps/textedit/components/SpeechManager.tsx",
      "../../../src/apps/maps/hooks/useYouBikeNavigationSpeech.ts",
      "../../../src/apps/maps/youbike/navigationSpeech.ts",
      "../../../src/apps/books/hooks/useBooksSpeech.ts",
      "../../../src/apps/books/components/BooksReaderPane.tsx",
      "../../../src/apps/calculator/utils/calculatorSpeech.ts",
      "../../../src/components/assistant/assistantSpeech.ts",
    ];

    const speakFiles = [
      "../../../src/apps/textedit/components/SpeechManager.tsx",
      "../../../src/apps/maps/hooks/useYouBikeNavigationSpeech.ts",
      "../../../src/apps/books/hooks/useBooksSpeech.ts",
      "../../../src/apps/books/components/BooksReaderPane.tsx",
      "../../../src/apps/calculator/utils/calculatorSpeech.ts",
      "../../../src/components/assistant/assistantSpeech.ts",
    ];

    for (const file of files) {
      const source = readSrc(file);
      expect(source).not.toMatch(/from ["']@\/hooks\/useTtsQueue["']/);
      expect(source).not.toMatch(/["']\/api\/speech["']/);
      expect(source).toContain("browserSpeech");
    }

    for (const file of speakFiles) {
      const source = readSrc(file);
      expect(source).toContain("createSpeechUtterance");
      expect(source).toContain("getBrowserSpeechSynthesis");
      expect(source).not.toContain("new SpeechSynthesisUtterance");
    }

    const assistantHook = readSrc(
      "../../../src/components/assistant/useAssistantSpeech.ts"
    );
    expect(assistantHook).not.toContain("useTtsQueue");
    expect(assistantHook).not.toContain("/api/speech");
    expect(assistantHook).toContain("speakAssistantText");
  });

  test("TextEdit read-aloud speaks via createSpeechUtterance", () => {
    const speech = readSrc("../../../src/apps/textedit/components/SpeechManager.tsx");
    expect(speech).toContain("createSpeechUtterance");
    expect(speech).toContain("getBrowserSpeechSynthesis");
    expect(speech).toContain("synth.speak(utterance)");
    expect(speech).toContain("isTtsLoading: false");
  });

  test("server ElevenLabs synthesis stays on /api/speech and Telegram Ryo AI replies", () => {
    const speechApi = readSrc("../../../api/speech.ts");
    expect(speechApi).toContain("evaluateRyoVoiceGate");
    expect(speechApi).toContain("consumeSpeechPermit");
    expect(speechApi).toContain("generateElevenLabsSpeech");
    expect(speechApi).toContain("ryoVoiceGate.error");
    expect(speechApi).toContain('status(403)');

    const permits = readSrc("../../../api/speech/permits.ts");
    expect(permits).toContain("mintSpeechPermit");

    const telegram = readSrc("../../../api/webhooks/telegram.ts");
    expect(telegram).toContain("generateElevenLabsSpeech");
    expect(telegram).toContain("Server-side Ryo AI voice reply");
  });
});
