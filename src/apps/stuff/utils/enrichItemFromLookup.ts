import type { StuffItemDraft } from "../types";
import {
  fetchImageAsDataUrl,
  lookupProduct,
  type ProductLookupResponse,
  type ProductLookupResult,
  shouldAutoApplyProductLookup,
} from "./barcodeLookup";

export interface EnrichedStuffDraft extends StuffItemDraft {
  found: boolean;
  source?: string;
  queryKind?: ProductLookupResult["queryKind"];
  /** True when a cover/thumbnail was stored on the draft. */
  imageApplied: boolean;
  /** Provider offered an image URL (even if download failed). */
  hadImageUrl: boolean;
}

export interface StuffLookupOutcome {
  response: ProductLookupResponse;
  /** When set, apply immediately; when null, show the picker. */
  autoApply: EnrichedStuffDraft | null;
}

/**
 * Product metadata lookup may write. User-managed fields (status, tags,
 * notes, quantity, discounted/sold prices, etc.) are never included.
 */
export function productFieldsFromDraft(draft: StuffItemDraft): StuffItemDraft {
  const patch: StuffItemDraft = {};
  if (draft.title !== undefined) patch.title = draft.title;
  if (draft.brand !== undefined) patch.brand = draft.brand;
  if (draft.productUrl !== undefined) patch.productUrl = draft.productUrl;
  if (draft.barcode !== undefined) patch.barcode = draft.barcode;
  if (draft.barcodeFormat !== undefined) {
    patch.barcodeFormat = draft.barcodeFormat;
  }
  if (draft.imageDataUrl !== undefined) {
    patch.imageDataUrl = draft.imageDataUrl;
  }
  if (draft.prices !== undefined) {
    // Only list/original price from product data — never discounted/sold.
    patch.prices = {
      currency: draft.prices.currency,
      ...(draft.prices.original !== undefined
        ? { original: draft.prices.original }
        : {}),
    };
  }
  return patch;
}

export function productLookupToDraft(
  lookup: ProductLookupResult,
  base: StuffItemDraft = {}
): StuffItemDraft {
  const draft: StuffItemDraft = { ...base };

  if (lookup.title) draft.title = lookup.title;
  if (lookup.brand) draft.brand = lookup.brand;
  if (lookup.productUrl) draft.productUrl = lookup.productUrl;

  if (lookup.isbn && !draft.barcode) {
    draft.barcode = lookup.isbn;
    draft.barcodeFormat = "EAN_13";
  }

  // Only fill original price when the lookup has a finite value — never clear an existing price with emptiness.
  if (
    typeof lookup.originalPrice === "number" &&
    Number.isFinite(lookup.originalPrice) &&
    lookup.originalPrice > 0
  ) {
    draft.prices = {
      ...draft.prices,
      original: lookup.originalPrice,
      currency:
        lookup.currency?.trim() || draft.prices?.currency || "USD",
    };
  }

  return draft;
}

/** Apply a single lookup candidate (downloads cover when needed). */
export async function enrichStuffFromLookupResult(
  lookup: ProductLookupResult,
  base: StuffItemDraft = {}
): Promise<EnrichedStuffDraft> {
  const draft = productLookupToDraft(lookup, base);
  const hadImageUrl = Boolean(lookup.imageUrl || lookup.imageDataUrl);
  let imageApplied = false;

  if (lookup.imageDataUrl) {
    draft.imageDataUrl = lookup.imageDataUrl;
    imageApplied = true;
  } else if (lookup.imageUrl) {
    const imageDataUrl = await fetchImageAsDataUrl(lookup.imageUrl);
    if (imageDataUrl) {
      draft.imageDataUrl = imageDataUrl;
      imageApplied = true;
    }
  }

  return {
    ...draft,
    found: Boolean(lookup.found && lookup.title),
    source: lookup.source,
    queryKind: lookup.queryKind,
    imageApplied,
    hadImageUrl,
  };
}

export async function enrichStuffFromQuery(
  query: string,
  base: StuffItemDraft = {},
  mode: "title-lookup" | "barcode-scan" = "title-lookup"
): Promise<StuffLookupOutcome> {
  const response = await lookupProduct(query);
  if (
    shouldAutoApplyProductLookup(response, mode) ||
    response.results.length === 0
  ) {
    // Use top-level primary (merged best for barcode/ISBN) rather than results[0].
    const best: ProductLookupResult = response.found
      ? {
          found: true,
          queryKind: response.queryKind,
          title: response.title,
          brand: response.brand,
          authors: response.authors,
          imageUrl: response.imageUrl,
          imageDataUrl: response.imageDataUrl,
          productUrl: response.productUrl,
          source: response.source,
          isbn: response.isbn,
          originalPrice: response.originalPrice,
          currency: response.currency,
        }
      : { found: false, queryKind: response.queryKind };
    return {
      response,
      autoApply: await enrichStuffFromLookupResult(best, base),
    };
  }

  return { response, autoApply: null };
}
