import { layout, prepare, type PreparedText } from "@chenglou/pretext";

const PREPARED_TEXT_CACHE_LIMIT = 200;
const preparedTextCache = new Map<string, PreparedText>();
const CHAT_TEXT_LINE_HEIGHT_RATIO = 1.375;

export interface AssistantTokenAnimationInput {
  tokenCount: number;
  textLength: number;
  lineCount?: number | null;
}

function setPreparedTextCache(key: string, prepared: PreparedText): PreparedText {
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

export function estimateChatTextLineCount(
  text: string,
  fontSize: number,
  maxWidth: number
): number | null {
  if (!text || maxWidth <= 0) {
    return null;
  }

  if (typeof window === "undefined") {
    return null;
  }

  const font = getChatTextFont(fontSize);
  const cacheKey = `${font}\u0000${text}`;
  const prepared =
    preparedTextCache.get(cacheKey) ??
    setPreparedTextCache(
      cacheKey,
      prepare(text, font, {
        whiteSpace: "pre-wrap",
      })
    );

  return layout(prepared, maxWidth, getChatTextLineHeight(fontSize)).lineCount;
}

export function shouldAnimateAssistantTokens({
  tokenCount,
  textLength,
  lineCount,
}: AssistantTokenAnimationInput): boolean {
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
