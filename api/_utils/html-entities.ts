const NAMED_HTML_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&hellip;": "…",
  "&mdash;": "—",
  "&ndash;": "–",
  "&lsquo;": "‘",
  "&rsquo;": "’",
  "&ldquo;": "“",
  "&rdquo;": "”",
  "&sbquo;": "‚",
  "&bdquo;": "„",
  "&bull;": "•",
  "&middot;": "·",
  "&laquo;": "«",
  "&raquo;": "»",
  "&copy;": "©",
  "&reg;": "®",
  "&trade;": "™",
};

function decodeNumericCodePoint(codePoint: number): string | null {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return null;
  }
  // Lone surrogates are not valid Unicode scalar values.
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) return null;
  return String.fromCodePoint(codePoint);
}

/**
 * Decode common named and numeric HTML entities exactly once.
 *
 * This intentionally avoids recursive decoding so `&amp;lt;` becomes `&lt;`,
 * not `<`, and `&amp;amp;` becomes `&amp;`, not `&`. For chat/UI strings that
 * may include tags and need full decoding, use the client
 * `decodeHtmlEntities()` helper instead.
 */
export function decodeHtmlEntitiesOnce(text: string): string {
  return text.replace(
    /&(?:#[xX]([0-9a-fA-F]+);|#(\d+);|[a-zA-Z]+;)/g,
    (match, hex: string | undefined, dec: string | undefined) => {
      if (hex) return decodeNumericCodePoint(parseInt(hex, 16)) ?? match;
      if (dec) return decodeNumericCodePoint(parseInt(dec, 10)) ?? match;
      return NAMED_HTML_ENTITIES[match.toLowerCase()] ?? match;
    }
  );
}

/**
 * Decode lyric/metadata text once. Strings with no `&` are returned as-is
 * so a second pass over already-decoded apostrophes is a no-op.
 */
export function decodeLyricText(text: string): string {
  if (!text || !text.includes("&")) return text;
  return decodeHtmlEntitiesOnce(text);
}

export function decodeAnnotatedSegments<
  T extends { text: string; reading?: string },
>(segments: readonly T[]): T[] {
  let changed = false;
  const next = segments.map((segment) => {
    const text = decodeLyricText(segment.text);
    const reading =
      segment.reading === undefined
        ? undefined
        : decodeLyricText(segment.reading);
    if (text === segment.text && reading === segment.reading) return segment;
    changed = true;
    if (reading === undefined) return { ...segment, text };
    return { ...segment, text, reading };
  });
  return changed ? next : (segments as T[]);
}
