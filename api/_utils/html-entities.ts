const NAMED_HTML_ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

/**
 * Decode common named and numeric HTML entities exactly once.
 *
 * This intentionally avoids recursive decoding so `&amp;lt;` becomes `&lt;`,
 * not `<`.
 */
export function decodeHtmlEntitiesOnce(text: string): string {
  return text.replace(
    /&(?:#x([0-9a-fA-F]+);|#(\d+);|[a-zA-Z]+;)/g,
    (match, hex, dec) => {
      if (hex) return String.fromCharCode(parseInt(hex, 16));
      if (dec) return String.fromCharCode(parseInt(dec, 10));
      return NAMED_HTML_ENTITIES[match.toLowerCase()] ?? match;
    }
  );
}
