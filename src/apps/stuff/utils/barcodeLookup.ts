import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";

export type ProductQueryKind = "isbn" | "barcode" | "title";

export interface ProductLookupResult {
  found: boolean;
  queryKind?: ProductQueryKind;
  title?: string;
  brand?: string;
  authors?: string[];
  imageUrl?: string;
  /** Server-resolved cover bytes (preferred over client fetch). */
  imageDataUrl?: string;
  productUrl?: string;
  source?: string;
  isbn?: string;
  /** List / purchase price in major currency units when known. */
  originalPrice?: number;
  /** ISO currency code paired with `originalPrice` (e.g. USD). */
  currency?: string;
}

/**
 * Unified product-lookup API payload. Top-level fields mirror the best hit
 * (backward compatible); `results` lists ranked candidates for the picker.
 */
export interface ProductLookupResponse extends ProductLookupResult {
  results: ProductLookupResult[];
}

/** @deprecated Use ProductLookupResult */
export type BarcodeLookupResult = ProductLookupResult;

/** Normalize API JSON into a response with a results array. */
export function parseProductLookupResponse(
  data: unknown
): ProductLookupResponse {
  if (!data || typeof data !== "object") {
    return { found: false, results: [] };
  }
  const raw = data as ProductLookupResult & { results?: unknown };
  const queryKind = raw.queryKind;
  const listed = Array.isArray(raw.results)
    ? raw.results.filter(
        (entry): entry is ProductLookupResult =>
          Boolean(
            entry &&
              typeof entry === "object" &&
              (entry as ProductLookupResult).found &&
              typeof (entry as ProductLookupResult).title === "string" &&
              Boolean((entry as ProductLookupResult).title?.trim())
          )
      )
    : [];

  if (listed.length > 0) {
    // Prefer top-level primary fields (may be a merged best hit) over results[0].
    const primary: ProductLookupResult = {
      found: true,
      queryKind: queryKind ?? listed[0].queryKind,
      title: raw.title ?? listed[0].title,
      brand: raw.brand ?? listed[0].brand,
      authors: raw.authors ?? listed[0].authors,
      imageUrl: raw.imageUrl ?? listed[0].imageUrl,
      imageDataUrl: raw.imageDataUrl ?? listed[0].imageDataUrl,
      productUrl: raw.productUrl ?? listed[0].productUrl,
      source: raw.source ?? listed[0].source,
      isbn: raw.isbn ?? listed[0].isbn,
      originalPrice: raw.originalPrice ?? listed[0].originalPrice,
      currency: raw.currency ?? listed[0].currency,
    };
    // Propagate the primary cover bytes onto list rows that share its URL so
    // picker apply can reuse imageDataUrl without a second (CORS-prone) fetch.
    const primaryImageDataUrl = primary.imageDataUrl;
    const primaryImageUrl = primary.imageUrl;
    return {
      ...primary,
      results: listed.map((entry) => {
        const row: ProductLookupResult = {
          ...entry,
          found: true,
          queryKind: entry.queryKind ?? queryKind,
        };
        if (
          !row.imageDataUrl &&
          primaryImageDataUrl &&
          primaryImageUrl &&
          entry.imageUrl === primaryImageUrl
        ) {
          row.imageDataUrl = primaryImageDataUrl;
        }
        return row;
      }),
    };
  }

  if (raw.found && raw.title?.trim()) {
    const single: ProductLookupResult = {
      found: true,
      queryKind,
      title: raw.title,
      brand: raw.brand,
      authors: raw.authors,
      imageUrl: raw.imageUrl,
      imageDataUrl: raw.imageDataUrl,
      productUrl: raw.productUrl,
      source: raw.source,
      isbn: raw.isbn,
      originalPrice: raw.originalPrice,
      currency: raw.currency,
    };
    return { ...single, results: [single] };
  }

  return { found: false, queryKind, results: [] };
}

/**
 * Auto-apply a single hit, or barcode/ISBN scans (high-confidence identity).
 * Title Look Up always prefers the picker when 2+ candidates exist.
 */
export function shouldAutoApplyProductLookup(
  response: ProductLookupResponse,
  mode: "title-lookup" | "barcode-scan" = "title-lookup"
): boolean {
  if (response.results.length <= 1) return true;
  if (mode !== "barcode-scan") return false;
  return (
    response.queryKind === "barcode" || response.queryKind === "isbn"
  );
}

async function fetchProductLookup(
  path: string
): Promise<ProductLookupResponse> {
  const response = await abortableFetch(getApiUrl(path), {
    method: "GET",
    timeout: 12000,
    throwOnHttpError: false,
    retry: { maxAttempts: 1, initialDelayMs: 200 },
  });

  if (!response.ok) {
    return { found: false, results: [] };
  }

  return parseProductLookupResponse(await response.json());
}

/** Resolve ISBN, UPC/EAN, or free-text title via the unified product lookup API. */
export async function lookupProduct(
  query: string
): Promise<ProductLookupResponse> {
  return fetchProductLookup(
    `/api/stuff/product-lookup?q=${encodeURIComponent(query)}`
  );
}

/** Legacy barcode-only entry point (delegates to unified resolver). */
export async function lookupBarcode(
  barcode: string
): Promise<ProductLookupResponse> {
  return fetchProductLookup(
    `/api/stuff/barcode-lookup?barcode=${encodeURIComponent(barcode)}`
  );
}

/** Max stored thumbnail payload (~1.5MB) for IndexedDB. */
export const STUFF_IMAGE_MAX_BYTES = 1.5 * 1024 * 1024;

/** Read a local image file into a data URL for item storage. */
export async function readImageFileAsDataUrl(
  file: File
): Promise<string | undefined> {
  if (!file.type.startsWith("image/")) return undefined;
  if (file.size > STUFF_IMAGE_MAX_BYTES) return undefined;
  try {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  } catch {
    return undefined;
  }
}

/** Parse `/api/stuff/product-image` JSON into a stored data URL. */
export function parseProductImageResponse(
  data: unknown
): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const imageDataUrl = (data as { imageDataUrl?: unknown }).imageDataUrl;
  if (
    typeof imageDataUrl !== "string" ||
    !imageDataUrl.startsWith("data:image/")
  ) {
    return undefined;
  }
  if (imageDataUrl.length > STUFF_IMAGE_MAX_BYTES * 2) {
    // Base64 expands ~4/3; reject grossly oversized payloads.
    return undefined;
  }
  return imageDataUrl;
}

/**
 * Fetch a remote product image and convert to a local data URL for storage.
 * Prefers the server proxy (avoids browser CORS on product CDNs); falls back
 * to a direct fetch for same-origin / CORS-open URLs.
 */
export async function fetchImageAsDataUrl(
  url: string
): Promise<string | undefined> {
  const trimmed = url.trim();
  if (!trimmed) return undefined;

  try {
    const proxied = await abortableFetch(
      getApiUrl(
        `/api/stuff/product-image?url=${encodeURIComponent(trimmed)}`
      ),
      {
        method: "GET",
        timeout: 12000,
        throwOnHttpError: false,
        retry: { maxAttempts: 1, initialDelayMs: 200 },
      }
    );
    if (proxied.ok) {
      const fromProxy = parseProductImageResponse(await proxied.json());
      if (fromProxy) return fromProxy;
    }
  } catch {
    // Fall through to direct fetch.
  }

  try {
    const response = await abortableFetch(trimmed, {
      method: "GET",
      timeout: 10000,
      throwOnHttpError: false,
      retry: { maxAttempts: 1, initialDelayMs: 200 },
    });
    if (!response.ok) return undefined;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return undefined;
    if (blob.size > STUFF_IMAGE_MAX_BYTES) return undefined;
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return undefined;
  }
}
