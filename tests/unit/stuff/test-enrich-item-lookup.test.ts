#!/usr/bin/env bun
import { describe, expect, test } from "bun:test";
import {
  parseProductImageResponse,
  parseProductLookupResponse,
  shouldAutoApplyProductLookup,
} from "../../../src/apps/stuff/utils/barcodeLookup";
import {
  enrichStuffFromLookupResult,
  productFieldsFromDraft,
  productLookupToDraft,
} from "../../../src/apps/stuff/utils/enrichItemFromLookup";
import { stuffItemCoverSrc } from "../../../src/apps/stuff/types";

describe("productLookupToDraft", () => {
  test("maps book metadata and ISBN barcode", () => {
    const draft = productLookupToDraft(
      {
        found: true,
        title: "The Great Gatsby",
        brand: "F. Scott Fitzgerald",
        productUrl: "https://openlibrary.org/works/OL123",
        isbn: "9780743273565",
        source: "openlibrary",
        queryKind: "isbn",
      },
      { status: "stowed" }
    );

    expect(draft.title).toBe("The Great Gatsby");
    expect(draft.brand).toBe("F. Scott Fitzgerald");
    expect(draft.barcode).toBe("9780743273565");
    expect(draft.barcodeFormat).toBe("EAN_13");
    expect(draft.status).toBe("stowed");
  });

  test("preserves status, tags, notes, and quantity through enrich", () => {
    const draft = productLookupToDraft(
      {
        found: true,
        title: "Sony WH-1000XM5",
        brand: "Sony",
        originalPrice: 348,
        currency: "USD",
      },
      {
        status: "for_sale",
        tagIds: ["tag-electronics", "tag-wishlist"],
        notes: "Gift from mom",
        quantity: 2,
        prices: { currency: "USD", discounted: 199 },
      }
    );

    expect(draft.title).toBe("Sony WH-1000XM5");
    expect(draft.brand).toBe("Sony");
    expect(draft.status).toBe("for_sale");
    expect(draft.tagIds).toEqual(["tag-electronics", "tag-wishlist"]);
    expect(draft.notes).toBe("Gift from mom");
    expect(draft.quantity).toBe(2);
    expect(draft.prices).toEqual({
      currency: "USD",
      discounted: 199,
      original: 348,
    });
  });

  test("does not overwrite an existing barcode", () => {
    const draft = productLookupToDraft(
      {
        found: true,
        title: "Book",
        isbn: "9780743273565",
      },
      { barcode: "012345678905", barcodeFormat: "UPC_A" }
    );

    expect(draft.barcode).toBe("012345678905");
    expect(draft.barcodeFormat).toBe("UPC_A");
  });

  test("maps originalPrice onto prices.original without clearing existing prices when absent", () => {
    const withPrice = productLookupToDraft(
      {
        found: true,
        title: "Sony WH-1000XM5",
        originalPrice: 248,
        currency: "USD",
      },
      { prices: { currency: "USD", discounted: 199 } }
    );
    expect(withPrice.prices).toEqual({
      currency: "USD",
      discounted: 199,
      original: 248,
    });

    const withoutPrice = productLookupToDraft(
      { found: true, title: "Sony WH-1000XM5" },
      { prices: { currency: "USD", original: 120 } }
    );
    expect(withoutPrice.prices).toEqual({ currency: "USD", original: 120 });
  });
});

describe("productFieldsFromDraft", () => {
  test("keeps only product metadata — strips status, tags, notes, quantity", () => {
    const patch = productFieldsFromDraft({
      title: "Sony WH-1000XM5",
      brand: "Sony",
      barcode: "027242919216",
      barcodeFormat: "UPC_A",
      productUrl: "https://example.com/xm5",
      imageDataUrl: "data:image/png;base64,abc",
      imageUrl: "https://cdn.example.com/xm5.jpg",
      prices: { currency: "USD", original: 348, discounted: 199 },
      status: "for_sale",
      tagIds: ["tag-a"],
      notes: "keep me",
      quantity: 3,
    });

    expect(patch).toEqual({
      title: "Sony WH-1000XM5",
      brand: "Sony",
      barcode: "027242919216",
      barcodeFormat: "UPC_A",
      productUrl: "https://example.com/xm5",
      imageDataUrl: "data:image/png;base64,abc",
      imageUrl: "https://cdn.example.com/xm5.jpg",
      prices: { currency: "USD", original: 348 },
    });
    expect(patch.prices).not.toHaveProperty("discounted");
    expect(patch).not.toHaveProperty("status");
    expect(patch).not.toHaveProperty("tagIds");
    expect(patch).not.toHaveProperty("notes");
    expect(patch).not.toHaveProperty("quantity");
  });
});

describe("enrichStuffFromLookupResult cover apply", () => {
  test("stores remote imageUrl for display without downloading", async () => {
    const enriched = await enrichStuffFromLookupResult({
      found: true,
      title: "KitchenAid Mixer",
      imageUrl: "https://cdn.example.com/mixer.jpg",
      source: "amazon",
      queryKind: "title",
    });

    expect(enriched.imageUrl).toBe("https://cdn.example.com/mixer.jpg");
    expect(enriched.imageDataUrl).toBe("");
    expect(enriched.imageApplied).toBe(true);
    expect(enriched.hadImageUrl).toBe(true);
    expect(
      stuffItemCoverSrc({
        imageDataUrl: enriched.imageDataUrl,
        imageUrl: enriched.imageUrl,
      })
    ).toBe("https://cdn.example.com/mixer.jpg");
  });

  test("prefers embedded imageDataUrl over imageUrl", async () => {
    const enriched = await enrichStuffFromLookupResult({
      found: true,
      title: "KitchenAid Mixer",
      imageUrl: "https://cdn.example.com/mixer.jpg",
      imageDataUrl: "data:image/png;base64,abc",
      source: "amazon",
      queryKind: "title",
    });

    expect(enriched.imageDataUrl).toBe("data:image/png;base64,abc");
    expect(enriched.imageUrl).toBe("");
    expect(enriched.imageApplied).toBe(true);
    expect(
      stuffItemCoverSrc({
        imageDataUrl: enriched.imageDataUrl,
        imageUrl: enriched.imageUrl,
      })
    ).toBe("data:image/png;base64,abc");
  });
});

describe("parseProductLookupResponse", () => {
  test("keeps a results list and mirrors the best hit at the top level", () => {
    const parsed = parseProductLookupResponse({
      found: true,
      queryKind: "title",
      title: "Best Hit",
      brand: "Acme",
      source: "amazon",
      results: [
        {
          found: true,
          title: "Best Hit",
          brand: "Acme",
          source: "amazon",
          imageUrl: "https://example.com/a.jpg",
          originalPrice: 42,
          currency: "USD",
        },
        {
          found: true,
          title: "Runner Up",
          brand: "Acme",
          source: "wikipedia",
        },
      ],
    });

    expect(parsed.found).toBe(true);
    expect(parsed.title).toBe("Best Hit");
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[1]?.title).toBe("Runner Up");
  });

  test("falls back to a single-result shape for older payloads", () => {
    const parsed = parseProductLookupResponse({
      found: true,
      queryKind: "barcode",
      title: "Legacy Product",
      brand: "Brand",
      source: "upcitemdb",
    });
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0]?.title).toBe("Legacy Product");
  });
});

describe("shouldAutoApplyProductLookup", () => {
  const multi = parseProductLookupResponse({
    found: true,
    queryKind: "title",
    title: "A",
    results: [
      { found: true, title: "A", source: "amazon" },
      { found: true, title: "B", source: "wikipedia" },
    ],
  });

  test("auto-applies a single result", () => {
    const single = parseProductLookupResponse({
      found: true,
      queryKind: "title",
      title: "Only",
      results: [{ found: true, title: "Only", source: "amazon" }],
    });
    expect(shouldAutoApplyProductLookup(single, "title-lookup")).toBe(true);
  });

  test("shows picker for title Look Up with multiple results", () => {
    expect(shouldAutoApplyProductLookup(multi, "title-lookup")).toBe(false);
  });

  test("auto-applies barcode/ISBN scans even with multiple source hits", () => {
    const barcodeMulti = parseProductLookupResponse({
      found: true,
      queryKind: "barcode",
      title: "A",
      results: [
        { found: true, title: "A", source: "upcitemdb" },
        { found: true, title: "A Alt", source: "openfoodfacts" },
      ],
    });
    expect(shouldAutoApplyProductLookup(barcodeMulti, "barcode-scan")).toBe(
      true
    );
  });

  test("shows picker for scanner free-text title with multiple results", () => {
    expect(shouldAutoApplyProductLookup(multi, "barcode-scan")).toBe(false);
  });
});

describe("apply selected product lookup candidate", () => {
  test("maps the chosen candidate through product fields only", () => {
    const selected = {
      found: true as const,
      title: "Runner Up Mixer",
      brand: "KitchenAid",
      productUrl: "https://example.com/mixer",
      isbn: "9780140329473",
      originalPrice: 199,
      currency: "USD",
      imageDataUrl: "data:image/png;base64,selected",
      source: "wikipedia",
      queryKind: "title" as const,
    };

    const draft = productLookupToDraft(selected, {
      barcode: "scan-kept",
      barcodeFormat: "UPC_A",
      status: "for_sale",
      tagIds: ["tag-a"],
      notes: "keep",
    });
    const patch = productFieldsFromDraft({
      ...draft,
      imageDataUrl: selected.imageDataUrl,
    });

    expect(patch.title).toBe("Runner Up Mixer");
    expect(patch.brand).toBe("KitchenAid");
    expect(patch.productUrl).toBe("https://example.com/mixer");
    expect(patch.imageDataUrl).toBe("data:image/png;base64,selected");
    expect(patch.prices).toEqual({ currency: "USD", original: 199 });
    // Existing barcode is preserved; ISBN does not overwrite.
    expect(patch.barcode).toBe("scan-kept");
    expect(patch).not.toHaveProperty("status");
    expect(patch).not.toHaveProperty("tagIds");
    expect(patch).not.toHaveProperty("notes");
  });

  test("propagates top-level imageDataUrl onto list rows that share imageUrl", () => {
    const cover = "data:image/jpeg;base64,/9j/primary";
    const parsed = parseProductLookupResponse({
      found: true,
      queryKind: "title",
      title: "Best Hit",
      imageUrl: "https://cdn.example.com/a.jpg",
      imageDataUrl: cover,
      results: [
        {
          found: true,
          title: "Best Hit",
          imageUrl: "https://cdn.example.com/a.jpg",
          source: "amazon",
        },
        {
          found: true,
          title: "Other Cover",
          imageUrl: "https://cdn.example.com/b.jpg",
          source: "wikipedia",
        },
      ],
    });

    expect(parsed.results[0]?.imageDataUrl).toBe(cover);
    // Different URL must not inherit primary bytes.
    expect(parsed.results[1]?.imageDataUrl).toBeUndefined();
  });
});

describe("parseProductImageResponse", () => {
  test("accepts a data URL image payload from the product-image API", () => {
    expect(
      parseProductImageResponse({
        imageDataUrl: "data:image/png;base64,abc",
      })
    ).toBe("data:image/png;base64,abc");
  });

  test("rejects non-image or missing payloads", () => {
    expect(parseProductImageResponse(null)).toBeUndefined();
    expect(parseProductImageResponse({})).toBeUndefined();
    expect(
      parseProductImageResponse({ imageDataUrl: "https://example.com/a.jpg" })
    ).toBeUndefined();
    expect(
      parseProductImageResponse({ imageDataUrl: "data:text/plain;base64,abc" })
    ).toBeUndefined();
  });
});
