import { describe, expect, test } from "bun:test";
import {
  defaultStuffTagId,
  ensureDefaultStuffTags,
  ensureFurnitureTag,
  getFilteredStuffItems,
} from "../../../src/stores/useStuffStore";
import {
  DEFAULT_CURRENCY,
  DEFAULT_TAG_COLORS,
  stuffItemCoverSrc,
  type StuffItem,
  type StuffTag,
} from "../../../src/apps/stuff/types";
import { colorFromString, parseOptionalNumber } from "../../../src/apps/stuff/utils/colors";
import {
  encodeStuffId,
  parseStuffIdBarcode,
  toJsBarcodeFormat,
} from "../../../src/apps/stuff/utils/printLabels";
import { toSharedItem } from "../../../src/apps/stuff/utils/share";
import {
  dataUrlToBlob,
  stripImageDataUrlForSync,
} from "../../../src/apps/stuff/utils/stuffCoverBlobs";
import {
  mergeStuffShelfImport,
  stringifyStuffShelfExport,
  type StuffShelfExport,
} from "../../../src/apps/stuff/utils/stuffShelfImportExport";

function makeItem(overrides: Partial<StuffItem> = {}): StuffItem {
  const now = Date.now();
  return {
    id: overrides.id ?? "item-1",
    title: overrides.title ?? "Lamp",
    notes: overrides.notes ?? "",
    tagIds: overrides.tagIds ?? [],
    status: overrides.status ?? "stowed",
    prices: overrides.prices ?? { currency: DEFAULT_CURRENCY },
    quantity: overrides.quantity ?? 1,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    ...overrides,
  };
}

describe("ensureDefaultStuffTags", () => {
  const baseTags: StuffTag[] = [
    { id: "1", name: "Kitchen", color: DEFAULT_TAG_COLORS[0], createdAt: 1 },
    { id: "2", name: "Books", color: DEFAULT_TAG_COLORS[3], createdAt: 2 },
    { id: "3", name: "Other", color: DEFAULT_TAG_COLORS[4], createdAt: 3 },
  ];

  test("inserts missing defaults (Furniture, CD, …) before Other", () => {
    const next = ensureDefaultStuffTags(baseTags);
    expect(next.map((t) => t.name)).toEqual([
      "Kitchen",
      "Books",
      "Electronics",
      "Clothing",
      "Furniture",
      "CD",
      "Other",
    ]);
    expect(next.find((t) => t.name === "Furniture")?.color).toBe(
      DEFAULT_TAG_COLORS[5]
    );
    expect(next.find((t) => t.name === "CD")?.color).toBe(DEFAULT_TAG_COLORS[6]);
    expect(next.find((t) => t.name === "CD")?.id).toBe(defaultStuffTagId("CD"));
  });

  test("does not duplicate existing defaults matched by name", () => {
    const withFurniture: StuffTag[] = [
      ...baseTags.slice(0, 2),
      {
        id: "f",
        name: "furniture",
        color: "#fff",
        createdAt: 9,
      },
      baseTags[2]!,
    ];
    const next = ensureDefaultStuffTags(withFurniture);
    expect(next.filter((t) => t.name.toLowerCase() === "furniture")).toHaveLength(
      1
    );
  });

  test("ensureFurnitureTag alias still inserts Furniture", () => {
    const withoutOther = baseTags.slice(0, 2);
    const next = ensureFurnitureTag(withoutOther);
    expect(next.map((t) => t.name)).toContain("Furniture");
    expect(next.map((t) => t.name)).toContain("CD");
  });
});

describe("Stuff filters", () => {
  const tags: StuffTag[] = [
    { id: "kitchen", name: "Kitchen", color: "#c45c26", createdAt: 1 },
    { id: "electronics", name: "Electronics", color: "#2f6fed", createdAt: 2 },
  ];

  const items = [
    makeItem({ id: "1", title: "Toaster", tagIds: ["kitchen"], status: "in_use" }),
    makeItem({
      id: "2",
      title: "Camera",
      brand: "Canon",
      tagIds: ["electronics"],
      status: "for_sale",
      barcode: "012345678905",
    }),
    makeItem({ id: "3", title: "Mug", tagIds: ["kitchen"], status: "sold" }),
  ];

  test("filters by tag", () => {
    const filtered = getFilteredStuffItems({
      items,
      tags,
      selectedTagId: "kitchen",
      statusFilter: "all",
      searchQuery: "",
    });
    expect(filtered.map((i) => i.id)).toEqual(["1", "3"]);
  });

  test("filters by status and search", () => {
    const filtered = getFilteredStuffItems({
      items,
      tags,
      selectedTagId: null,
      statusFilter: "for_sale",
      searchQuery: "canon",
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("2");
  });
});

describe("Stuff title updates", () => {
  test("preserves titles that contain spaces when committed", async () => {
    // Isolate store module so persist hydration from other suites cannot leak.
    const { useStuffStore } = await import("../../../src/stores/useStuffStore");
    useStuffStore.setState({
      items: [],
      selectedItemId: null,
    });
    const id = useStuffStore.getState().addItem({ title: "Lamp" });
    useStuffStore.getState().updateItem(id, { title: "Desk Lamp" });
    expect(useStuffStore.getState().items[0]?.title).toBe("Desk Lamp");
    useStuffStore.getState().updateItem(id, { title: "  " });
    // Empty/whitespace commits keep the previous title rather than "Untitled".
    expect(useStuffStore.getState().items[0]?.title).toBe("Desk Lamp");
  });
});

describe("Stuff cover helpers", () => {
  test("defaultStuffTagId is stable across devices", () => {
    expect(defaultStuffTagId("Kitchen")).toBe("stuff-default:kitchen");
    expect(defaultStuffTagId("Furniture")).toBe(defaultStuffTagId("furniture"));
  });

  test("stuffItemCoverSrc prefers resolved blob URL, then data URL, then remote", () => {
    expect(
      stuffItemCoverSrc(
        {
          imageDataUrl: "data:image/png;base64,AAA",
          imageUrl: "https://example.com/a.png",
          coverBlobId: "i1",
        },
        "blob:http://localhost/cover"
      )
    ).toBe("blob:http://localhost/cover");
    expect(
      stuffItemCoverSrc({
        imageDataUrl: "data:image/png;base64,AAA",
        imageUrl: "https://example.com/a.png",
      })
    ).toBe("data:image/png;base64,AAA");
    expect(
      stuffItemCoverSrc({
        imageUrl: "https://example.com/a.png",
      })
    ).toBe("https://example.com/a.png");
  });

  test("dataUrlToBlob round-trips a tiny PNG data URL", async () => {
    // 1x1 transparent PNG
    const dataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const blob = dataUrlToBlob(dataUrl);
    expect(blob).not.toBeNull();
    expect(blob?.type).toBe("image/png");
    expect(blob!.size).toBeGreaterThan(0);
  });

  test("stripImageDataUrlForSync drops inline covers from sync docs", () => {
    const stripped = stripImageDataUrlForSync({
      id: "i1",
      imageDataUrl: "data:image/png;base64,AAAA",
      coverBlobId: "i1",
      imageUrl: "https://example.com/a.png",
    });
    expect("imageDataUrl" in stripped && stripped.imageDataUrl).toBeFalsy();
    expect(stripped.coverBlobId).toBe("i1");
    expect(stripped.imageUrl).toBe("https://example.com/a.png");
  });
});

describe("Stuff shelf import/export", () => {
  test("merges new tags/items and skips existing ids", () => {
    const existingTags: StuffTag[] = [
      { id: "kitchen", name: "Kitchen", color: "#c45c26", createdAt: 1 },
    ];
    const existingItems = [
      makeItem({ id: "keep-me", title: "Existing", tagIds: ["kitchen"] }),
    ];

    const payload: StuffShelfExport = {
      version: 1,
      exportedAt: 1,
      tags: [
        { id: "kitchen", name: "Kitchen", color: "#c45c26", createdAt: 1 },
        { id: "books", name: "Books", color: "#9c36b5", createdAt: 2 },
      ],
      items: [
        makeItem({ id: "keep-me", title: "Should Skip", tagIds: ["kitchen"] }),
        makeItem({
          id: "new-1",
          title: "Novel",
          tagIds: ["books"],
          brand: "Penguin",
        }),
      ],
    };

    const result = mergeStuffShelfImport(
      stringifyStuffShelfExport(payload),
      { items: existingItems, tags: existingTags }
    );

    expect(result.addedTags).toBe(1);
    expect(result.skippedTags).toBe(1);
    expect(result.addedItems).toBe(1);
    expect(result.skippedItems).toBe(1);
    expect(result.tags.map((t) => t.id).sort()).toEqual(["books", "kitchen"]);
    expect(result.items.map((i) => i.id).sort()).toEqual(["keep-me", "new-1"]);
    expect(result.items.find((i) => i.id === "new-1")?.tagIds).toEqual([
      "books",
    ]);
  });

  test("remaps item tagIds when tag matches by name", () => {
    const existingTags: StuffTag[] = [
      { id: "local-books", name: "Books", color: "#111", createdAt: 1 },
    ];
    const payload: StuffShelfExport = {
      version: 1,
      exportedAt: 1,
      tags: [
        { id: "remote-books", name: "books", color: "#222", createdAt: 2 },
      ],
      items: [
        makeItem({
          id: "item-a",
          title: "Hardcover",
          tagIds: ["remote-books"],
        }),
      ],
    };

    const result = mergeStuffShelfImport(
      stringifyStuffShelfExport(payload),
      { items: [], tags: existingTags }
    );

    expect(result.addedTags).toBe(0);
    expect(result.addedItems).toBe(1);
    expect(result.items[0]?.tagIds).toEqual(["local-books"]);
  });

  test("queues cover ingestion from inline imageDataUrl", () => {
    const dataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const payload: StuffShelfExport = {
      version: 1,
      exportedAt: 1,
      tags: [],
      items: [
        makeItem({
          id: "with-cover",
          title: "Framed",
          imageDataUrl: dataUrl,
        }),
      ],
    };

    const result = mergeStuffShelfImport(
      stringifyStuffShelfExport(payload),
      { items: [], tags: [] }
    );

    expect(result.coverIngest).toEqual([
      { itemId: "with-cover", imageDataUrl: dataUrl },
    ]);
    expect(result.items[0]?.imageDataUrl).toBeUndefined();
    expect(result.items[0]?.coverBlobId).toBe("with-cover");
  });

  test("rejects invalid payloads", () => {
    expect(() => mergeStuffShelfImport("[]", { items: [], tags: [] })).toThrow(
      /Invalid Stuff shelf format/
    );
    expect(() =>
      mergeStuffShelfImport('{"version":1}', { items: [], tags: [] })
    ).toThrow(/Invalid Stuff shelf format/);
  });
});

describe("Stuff helpers", () => {
  test("colorFromString is stable", () => {
    expect(colorFromString("abc")).toEqual(colorFromString("abc"));
  });

  test("parseOptionalNumber", () => {
    expect(parseOptionalNumber("")).toBeUndefined();
    expect(parseOptionalNumber("12.5")).toBe(12.5);
    expect(parseOptionalNumber("nope")).toBeUndefined();
  });

  test("toJsBarcodeFormat maps ZXing names", () => {
    expect(toJsBarcodeFormat("EAN_13")).toBe("EAN13");
    expect(toJsBarcodeFormat("QR_CODE")).toBe("CODE128");
    expect(toJsBarcodeFormat("CODE_128")).toBe("CODE128");
  });

  test("toSharedItem projects tag names", () => {
    const tags: StuffTag[] = [
      { id: "a", name: "Kitchen", color: "#000", createdAt: 1 },
    ];
    const shared = toSharedItem(
      makeItem({ title: "Pan", tagIds: ["a", "missing"] }),
      tags
    );
    expect(shared.tagNames).toEqual(["Kitchen"]);
    expect(shared.title).toBe("Pan");
  });

  test("encode/parse ryOS stuff id barcodes", () => {
    const itemPayload = encodeStuffId("item", "abc-123");
    const tagPayload = encodeStuffId("tag", "kitchen");
    expect(itemPayload).toBe("ryos:stuff:item:abc-123");
    expect(tagPayload).toBe("ryos:stuff:tag:kitchen");
    expect(parseStuffIdBarcode(itemPayload)).toEqual({
      kind: "item",
      id: "abc-123",
    });
    expect(parseStuffIdBarcode(tagPayload)).toEqual({
      kind: "tag",
      id: "kitchen",
    });
    expect(parseStuffIdBarcode("012345678905")).toBeNull();
  });
});
