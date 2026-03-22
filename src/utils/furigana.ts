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

export function normalizeFuriganaSegments<T extends FuriganaSegmentLike>(segments: T[]): T[] {
  return segments.flatMap((segment) => normalizeFuriganaSegment(segment) as T[]);
}
