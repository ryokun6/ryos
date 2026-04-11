import {
  layoutWithLines,
  prepareWithSegments,
  type PreparedTextWithSegments,
} from "@chenglou/pretext";

const PREPARED_TEXT_CACHE_LIMIT = 200;
const preparedTextCache = new Map<string, PreparedTextWithSegments>();
const CHAT_TEXT_LINE_HEIGHT_RATIO = 1.375;

export interface AssistantTextAnimationInput {
  tokenCount: number;
  textLength: number;
  lineCount?: number | null;
}

export interface ChatTextLayoutInfo {
  lineCount: number;
  lineEnds: number[];
  totalChars: number;
}

function setPreparedTextCache(
  key: string,
  prepared: PreparedTextWithSegments
): PreparedTextWithSegments {
  preparedTextCache.set(key, prepared);
  if (preparedTextCache.size > PREPARED_TEXT_CACHE_LIMIT) {
    const oldestKey = preparedTextCache.keys().next().value;
    if (oldestKey !== undefined) {
      preparedTextCache.delete(oldestKey);
    }
  }
  return prepared;
}

export function getChatTextFont(fontSize: number): string {
  return `${fontSize}px "Geneva-12"`;
}

export function getChatTextLineHeight(fontSize: number): number {
  return Math.max(fontSize + 2, Math.round(fontSize * CHAT_TEXT_LINE_HEIGHT_RATIO));
}

export function buildChatTextLineEnds(
  lineTexts: string[],
  totalChars: number
): number[] {
  let charPos = 0;
  const lineEnds: number[] = [];

  for (const lineText of lineTexts) {
    charPos += lineText.length;
    lineEnds.push(Math.min(totalChars, charPos));
  }

  if (lineEnds.length === 0 && totalChars > 0) {
    return [totalChars];
  }

  const lastLineEnd = lineEnds.at(-1) ?? 0;
  if (lastLineEnd < totalChars) {
    lineEnds.push(totalChars);
  }

  return lineEnds;
}

export function getChatTextLayoutInfo(
  text: string,
  fontSize: number,
  maxWidth: number
): ChatTextLayoutInfo | null {
  if (!text || maxWidth <= 0 || typeof window === "undefined") {
    return null;
  }

  const font = getChatTextFont(fontSize);
  const cacheKey = `${font}\u0000${text}`;
  const prepared =
    preparedTextCache.get(cacheKey) ??
    setPreparedTextCache(
      cacheKey,
      prepareWithSegments(text, font, {
        whiteSpace: "pre-wrap",
      })
    );

  const { lineCount, lines } = layoutWithLines(
    prepared,
    maxWidth,
    getChatTextLineHeight(fontSize)
  );

  return {
    lineCount,
    lineEnds: buildChatTextLineEnds(
      lines.map((line) => line.text),
      text.length
    ),
    totalChars: text.length,
  };
}

export function getChatTextRevealDurationMs(
  charDelta: number,
  crossedLineCount: number
): number {
  if (charDelta <= 0) {
    return 0;
  }

  return Math.max(120, Math.min(700, charDelta * 8 + crossedLineCount * 70));
}

export function shouldUseDetailedAssistantTokens({
  tokenCount,
  textLength,
  lineCount,
}: AssistantTextAnimationInput): boolean {
  if (tokenCount === 0 || textLength === 0) {
    return false;
  }

  // Per-token motion looks best on short replies, but long streaming replies
  // create too many motion nodes and animation timelines.
  if (textLength > 320 || tokenCount > 90) {
    return false;
  }

  if (lineCount !== null && lineCount !== undefined && lineCount > 7) {
    return false;
  }

  return true;
}
