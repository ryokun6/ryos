/** Shared webFetch size caps. Kept separate so feed parsing can truncate without an import cycle. */

/** ~30k tokens. Long enough for a full journal feed or a long article. */
export const WEB_FETCH_MAX_CONTENT_CHARS = 120_000;

/** Hard stop on bytes read from an untrusted response. */
export const WEB_FETCH_MAX_DOWNLOAD_BYTES = 2_000_000;

/**
 * Visible letters/digits below this means the HTML body is a shell.
 * The fetcher may then read a same-site alternate feed.
 */
export const WEB_FETCH_THIN_PAGE_CHARS = 400;

export const WEB_FETCH_TRUNCATION_NOTE = "\n\n[truncated – showing the first part]";

export function capContent(
  text: string,
  maxChars: number,
  note = WEB_FETCH_TRUNCATION_NOTE
): { content: string; truncated: boolean; contentLength: number } {
  if (text.length <= maxChars) {
    return { content: text, truncated: false, contentLength: text.length };
  }
  const room = Math.max(0, maxChars - note.length);
  return {
    content: text.slice(0, room).trimEnd() + note,
    truncated: true,
    contentLength: text.length,
  };
}
