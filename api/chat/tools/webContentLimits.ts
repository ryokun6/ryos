/** Shared webFetch size caps. Kept separate so feed parsing can truncate without an import cycle. */

/** Total extracted text kept for paging. Pages are smaller than this. */
export const WEB_FETCH_MAX_CONTENT_CHARS = 120_000;

/** Default characters returned in one webFetch page. */
export const WEB_FETCH_PAGE_CHARS = 12_000;

/** Highest `maxChars` a call may request. */
export const WEB_FETCH_PAGE_HARD_MAX = 32_000;

/** Lowest `maxChars` a call may request. */
export const WEB_FETCH_PAGE_MIN = 1_000;

/** Whole feed items per page, before the character budget cuts the page short. */
export const WEB_FETCH_PAGE_ITEMS = 8;

/** Hard stop on bytes read from an untrusted response. */
export const WEB_FETCH_MAX_DOWNLOAD_BYTES = 2_000_000;

/**
 * Visible letters/digits below this means the HTML body is a shell.
 * The fetcher may then read a same-site alternate feed.
 */
export const WEB_FETCH_THIN_PAGE_CHARS = 400;

/** How long a fetched extract can be reused for later pages. */
export const WEB_FETCH_CACHE_TTL_MS = 3 * 60 * 1000;

export const WEB_FETCH_CACHE_MAX_ENTRIES = 24;

/** Bound on cached extract text. One entry is at most WEB_FETCH_MAX_CONTENT_CHARS. */
export const WEB_FETCH_CACHE_MAX_CHARS = 2_000_000;

/** Cut stored text to maxChars on a late paragraph boundary. No paging note here. */
export function capContent(
  text: string,
  maxChars: number
): { content: string; truncated: boolean; contentLength: number } {
  if (text.length <= maxChars) {
    return { content: text, truncated: false, contentLength: text.length };
  }
  const window = text.slice(0, maxChars);
  const min = Math.floor(maxChars * 0.85);
  const para = window.lastIndexOf("\n\n");
  const end = para >= min ? para : maxChars;
  return {
    content: text.slice(0, end).trimEnd(),
    truncated: true,
    contentLength: text.length,
  };
}
