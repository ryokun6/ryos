/**
 * Offset/limit paging shared by AI chat list tools (`list` on `/Music` and
 * `/Applets Store`, `songLibraryControl` list/search) so the model can walk
 * libraries larger than one page.
 */

export interface PageRequest {
  offset?: number;
  limit?: number;
}

export interface PageOptions {
  defaultLimit: number;
  maxLimit: number;
}

export const MUSIC_LIST_PAGE: PageOptions = { defaultLimit: 50, maxLimit: 100 };
export const APPLETS_STORE_LIST_PAGE: PageOptions = {
  defaultLimit: 50,
  maxLimit: 100,
};
export const SONG_LIBRARY_PAGE: PageOptions = { defaultLimit: 5, maxLimit: 25 };

export interface PageInfo {
  /** Total matching items before paging. */
  total: number;
  /** Zero-based index of the first returned item. */
  offset: number;
  /** Page size that was applied (after clamping). */
  limit: number;
  /** Number of items in this page. */
  returned: number;
  hasMore: boolean;
  /** Offset to pass for the next page, or null when this is the last page. */
  nextOffset: number | null;
}

export interface Page<T> extends PageInfo {
  items: T[];
}

function toNonNegativeInt(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(Math.floor(value), 0);
}

export function paginate<T>(
  items: readonly T[],
  request: PageRequest,
  options: PageOptions
): Page<T> {
  const total = items.length;
  const requestedLimit = toNonNegativeInt(request.limit);
  const limit = Math.min(
    Math.max(requestedLimit || options.defaultLimit, 1),
    options.maxLimit
  );
  const offset = Math.min(toNonNegativeInt(request.offset) ?? 0, total);
  const pageItems = items.slice(offset, offset + limit);
  const end = offset + pageItems.length;
  const hasMore = end < total;

  return {
    items: pageItems,
    total,
    offset,
    limit,
    returned: pageItems.length,
    hasMore,
    nextOffset: hasMore ? end : null,
  };
}

export function toPageInfo<T>(page: Page<T>): PageInfo {
  const { items: _items, ...info } = page;
  return info;
}

/** e.g. "; showing 26-50 of 120", or "" when one page holds every result. */
export function describePageRange(info: PageInfo): string {
  if (info.returned === 0 || (info.offset === 0 && !info.hasMore)) return "";
  return `; showing ${info.offset + 1}-${info.offset + info.returned} of ${info.total}`;
}

/**
 * Trailing machine-readable paging block for string tool outputs. Contains no
 * square brackets so the chat UI's `:\n[...]` item-count parser still finds
 * the item array.
 */
export function formatPaginationFooter(info: PageInfo): string {
  const hint = info.hasMore
    ? ` More results available: call again with offset ${info.nextOffset}.`
    : "";
  const { total, offset, limit, returned, hasMore, nextOffset } = info;
  const json = JSON.stringify({ total, offset, limit, returned, hasMore, nextOffset });
  return `\n\nPagination: ${json}${hint}`;
}
