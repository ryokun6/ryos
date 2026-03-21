import { describe, expect, test } from "bun:test";

/** Mirror of LyricsDisplay.tsx logic for regression testing */
function needsSpaceBetweenTimedWordChunks(prevTrimmed: string, nextTrimmed: string): boolean {
  if (!prevTrimmed || !nextTrimmed) return false;
  const prevChars = [...prevTrimmed];
  const nextChars = [...nextTrimmed];
  const last = prevChars[prevChars.length - 1];
  const first = nextChars[0];
  return /[A-Za-z0-9]/.test(last) && /[A-Za-z0-9]/.test(first);
}

function combineTimedWordParts(parts: string[]): string {
  let combined = "";
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    if (i > 0) {
      const prev = combined.trimEnd();
      if (needsSpaceBetweenTimedWordChunks(prev, part)) {
        combined += " ";
      }
    }
    combined += part;
  }
  return combined;
}

describe("furigana multi-word combine preserves Latin spaces", () => {
  test("English words from separate timings", () => {
    expect(combineTimedWordParts(["Oh", "no", "loving", "you"])).toBe("Oh no loving you");
  });

  test("no space between CJK chunks", () => {
    expect(combineTimedWordParts(["走", "る"])).toBe("走る");
  });

  test("no space between Latin and kanji boundary", () => {
    expect(combineTimedWordParts(["Hello", "世界"])).toBe("Hello世界");
  });
});
