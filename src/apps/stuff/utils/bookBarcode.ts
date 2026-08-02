/**
 * ISBN / bookland barcode helpers for Stuff scan → add flows.
 * Mirrors server classify in api/stuff/_helpers/_productLookup.ts.
 */

const ISBN_COMPACT =
  /^(97[89]\d{10}|\d{9}[\dX])$/;

/** True for ISBN-10, ISBN-13, or EAN bookland (978/979). Ignores hyphens/spaces. */
export function isIsbnBarcode(value: string): boolean {
  const normalized = value.replace(/[-\s]/g, "").toUpperCase();
  return ISBN_COMPACT.test(normalized);
}

/**
 * Detect a book-code scan/lookup (not a generic UPC that happens to match a book).
 * Uses queryKind, barcode format, and/or the scanned/typed code shape.
 */
export function isBookLookupScan(params: {
  query?: string;
  barcode?: string;
  barcodeFormat?: string;
  queryKind?: string | null;
}): boolean {
  if (params.queryKind === "isbn") return true;

  const format = params.barcodeFormat?.trim().toUpperCase().replace(/-/g, "_");
  if (format === "ISBN_10" || format === "ISBN_13") return true;

  const code = (params.barcode ?? params.query ?? "").trim();
  return code.length > 0 && isIsbnBarcode(code);
}

/**
 * Ensure Books is among tagIds for a new book-scan item.
 * No-op when not a book scan; merges without removing other tags.
 */
export function tagIdsWithDefaultBooks(
  existingTagIds: string[] | undefined,
  booksTagId: string,
  isBook: boolean
): string[] | undefined {
  if (!isBook || !booksTagId) return existingTagIds;
  const ids = existingTagIds ?? [];
  if (ids.includes(booksTagId)) return ids;
  return [...ids, booksTagId];
}
