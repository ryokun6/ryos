import { toHiragana } from "wanakana";

export interface FuriganaSegmentLike {
  text: string;
  reading?: string;
}

const KATAKANA_ONLY_REGEX = /^[\u30A0-\u30FF]+$/u;

function stripWhitespace(text: string): string {
  return text.replace(/\s+/gu, "");
}

function normalizeKanaForComparison(text: string): string {
  return stripWhitespace(toHiragana(text));
}

export function hasRedundantKatakanaReading(text: string, reading?: string): boolean {
  if (!reading) {
    return false;
  }

  const condensedText = stripWhitespace(text);
  if (!condensedText || !KATAKANA_ONLY_REGEX.test(condensedText)) {
    return false;
  }

  return normalizeKanaForComparison(text) === normalizeKanaForComparison(reading);
}

export function getDisplayReading(segment: FuriganaSegmentLike): string | undefined {
  if (!segment.reading) {
    return undefined;
  }

  if (hasRedundantKatakanaReading(segment.text, segment.reading)) {
    return undefined;
  }

  return segment.reading;
}

export function normalizeFuriganaSegment(segment: FuriganaSegmentLike): FuriganaSegmentLike[] {
  const reading = getDisplayReading(segment);
  if (!reading) {
    return [{ text: segment.text }];
  }

  const textParts = segment.text.match(/\s+|\S+/gu);
  const readingParts = reading.match(/\s+|\S+/gu);

  if (!textParts || textParts.length <= 1 || !readingParts || textParts.length !== readingParts.length) {
    return [{ text: segment.text, reading }];
  }

  const normalized: FuriganaSegmentLike[] = [];
  for (let i = 0; i < textParts.length; i++) {
    const textPart = textParts[i];
    const readingPart = readingParts[i];

    if (/^\s+$/u.test(textPart)) {
      if (!/^\s+$/u.test(readingPart)) {
        return [{ text: segment.text, reading }];
      }
      normalized.push({ text: textPart });
      continue;
    }

    if (/^\s+$/u.test(readingPart)) {
      return [{ text: segment.text, reading }];
    }

    const normalizedReading = getDisplayReading({ text: textPart, reading: readingPart });
    if (normalizedReading) {
      normalized.push({ text: textPart, reading: normalizedReading });
      continue;
    }

    normalized.push({ text: textPart });
  }

  return normalized;
}

const KANA_CHAR_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u31F0-\u31FF\uFF66-\uFF9F]/u;

function katakanaToHiragana(text: string): string {
  return text.replace(/[\u30A1-\u30F6]/gu, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0x60)
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Align a whole-word kana reading (e.g. JMdict `kana`) onto its written form,
 * so only the kanji runs carry furigana: 食べ物 + たべもの →
 * [{食, た}, {べ}, {物, もの}]. Falls back to one segment covering the whole
 * word when the kana in the text cannot be matched against the reading.
 */
export function alignFuriganaReading(text: string, reading: string): FuriganaSegmentLike[] {
  if (!text) return [];
  if (!reading || text === reading) return [{ text }];

  const runs: { text: string; isKana: boolean }[] = [];
  for (const char of text) {
    const isKana = KANA_CHAR_REGEX.test(char);
    const last = runs[runs.length - 1];
    if (last && last.isKana === isKana) {
      last.text += char;
    } else {
      runs.push({ text: char, isKana });
    }
  }

  if (runs.every((run) => run.isKana)) {
    return [{ text }];
  }

  const pattern = runs
    .map((run) => (run.isKana ? escapeRegExp(katakanaToHiragana(run.text)) : "(.+?)"))
    .join("");
  const match = new RegExp(`^${pattern}$`, "u").exec(katakanaToHiragana(reading));
  if (!match) {
    return [{ text, reading }];
  }

  let group = 1;
  return runs.map((run) =>
    run.isKana ? { text: run.text } : { text: run.text, reading: match[group++] }
  );
}

const INLINE_FURIGANA_REGEX =
  /([\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3005\u3006\u30F6]+)[(（]([\u3040-\u30FF]+)[)）]/gu;

/**
 * Parse Wiktionary-style inline readings — 学校(がっこう)で英語(えいご) —
 * into furigana segments plus the plain text.
 */
export function parseInlineFurigana(input: string): {
  text: string;
  segments: FuriganaSegmentLike[];
} {
  const segments: FuriganaSegmentLike[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  INLINE_FURIGANA_REGEX.lastIndex = 0;
  while ((match = INLINE_FURIGANA_REGEX.exec(input)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: input.slice(lastIndex, match.index) });
    }
    segments.push({ text: match[1], reading: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < input.length) {
    segments.push({ text: input.slice(lastIndex) });
  }
  return { text: segments.map((segment) => segment.text).join(""), segments };
}

export function normalizeFuriganaSegments<T extends FuriganaSegmentLike>(segments: T[]): T[] {
  return segments.flatMap((segment) => normalizeFuriganaSegment(segment) as T[]);
}
