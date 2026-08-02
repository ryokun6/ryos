import { describe, expect, test } from "bun:test";
import {
  createDefaultStuffTags,
  defaultStuffTagId,
  ensureDefaultStuffTags,
  ensureFurnitureTag,
  getFilteredStuffItems,
  isDefaultStuffTag,
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

  const ALL_DEFAULT_NAMES = [
    "Kitchen",
    "Electronics",
    "Clothing",
    "Books",
    "Furniture",
    "CD",
    "Other",
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

  test("ensures all canonical defaults are present without duplicates", () => {
    // Simulates an already-v4 shelf that persisted without CD / Furniture.
    const legacyShelf: StuffTag[] = [
      { id: "1", name: "Kitchen", color: DEFAULT_TAG_COLORS[0], createdAt: 1 },
      {
        id: "2",
        name: "Electronics",
        color: DEFAULT_TAG_COLORS[1],
        createdAt: 2,
      },
      { id: "3", name: "Clothing", color: DEFAULT_TAG_COLORS[2], createdAt: 3 },
      { id: "4", name: "Books", color: DEFAULT_TAG_COLORS[3], createdAt: 4 },
      { id: "5", name: "Other", color: DEFAULT_TAG_COLORS[4], createdAt: 5 },
      { id: "custom", name: "Vintage", color: "#111", createdAt: 6 },
    ];
    const next = ensureDefaultStuffTags(legacyShelf);
    for (const name of ALL_DEFAULT_NAMES) {
      expect(next.filter((t) => t.name.toLowerCase() === name.toLowerCase())).toHaveLength(
        1
      );
    }
    expect(next.map((t) => t.name)).toContain("Vintage");
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

  test("isDefaultStuffTag matches stable id or canonical name", () => {
    expect(
      isDefaultStuffTag({
        id: defaultStuffTagId("CD"),
        name: "CD",
        color: "#000",
        createdAt: 1,
      })
    ).toBe(true);
    expect(
      isDefaultStuffTag({
        id: "uuid",
        name: "Kitchen",
        color: "#000",
        createdAt: 1,
      })
    ).toBe(true);
    expect(
      isDefaultStuffTag({
        id: "custom",
        name: "Vintage",
        color: "#000",
        createdAt: 1,
      })
    ).toBe(false);
  });

  test("ensureFurnitureTag alias still inserts Furniture", () => {
    const withoutOther = baseTags.slice(0, 2);
    const next = ensureFurnitureTag(withoutOther);
    expect(next.map((t) => t.name)).toContain("Furniture");
    expect(next.map((t) => t.name)).toContain("CD");
  });

  test("deleteTag refuses seeded defaults and keeps custom tags deletable", async () => {
    const { useStuffStore } = await import("../../../src/stores/useStuffStore");
    const defaults = ALL_DEFAULT_NAMES.map((name, index) => ({
      id: defaultStuffTagId(name),
      name,
      color: DEFAULT_TAG_COLORS[index % DEFAULT_TAG_COLORS.length],
      createdAt: index + 1,
    }));
    useStuffStore.setState({
      tags: [
        ...defaults,
        { id: "custom", name: "Vintage", color: "#111", createdAt: 99 },
      ],
      selectedTagId: null,
    });

    useStuffStore.getState().deleteTag(defaultStuffTagId("CD"));
    expect(
      useStuffStore.getState().tags.some((t) => t.name === "CD")
    ).toBe(true);

    useStuffStore.getState().deleteTag("custom");
    expect(
      useStuffStore.getState().tags.some((t) => t.id === "custom")
    ).toBe(false);
  });

  test("clearShelf empties items, resets defaults, and clears filters", async () => {
    const { useStuffStore } = await import("../../../src/stores/useStuffStore");
    const defaults = createDefaultStuffTags();
    useStuffStore.setState({
      items: [
        makeItem({
          id: "lamp",
          title: "Lamp",
          coverBlobId: "lamp-cover",
          tagIds: ["custom"],
        }),
      ],
      tags: [
        ...defaults,
        { id: "custom", name: "Vintage", color: "#111", createdAt: 99 },
      ],
      selectedItemId: "lamp",
      selectedTagId: "custom",
      statusFilter: "for_sale",
      searchQuery: "lamp",
      lastShareId: "share-1",
    });

    useStuffStore.getState().clearShelf();
    const state = useStuffStore.getState();

    expect(state.items).toEqual([]);
    expect(state.tags.map((tag) => tag.name)).toEqual(ALL_DEFAULT_NAMES);
    expect(state.tags.every((tag) => tag.id === defaultStuffTagId(tag.name))).toBe(
      true
    );
    expect(state.selectedItemId).toBeNull();
    expect(state.selectedTagId).toBeNull();
    expect(state.statusFilter).toBe("all");
    expect(state.searchQuery).toBe("");
    expect(state.lastShareId).toBeNull();
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

describe("Stuff cover blob updates", () => {
  test("persists coverBlobId when upload clears imageUrl/imageDataUrl", async () => {
    const { useStuffStore } = await import("../../../src/stores/useStuffStore");
    useStuffStore.setState({
      items: [],
      selectedItemId: null,
    });
    const id = useStuffStore.getState().addItem({
      title: "Camera",
      imageUrl: "https://example.com/hotlink.jpg",
    });

    // Same shape as StuffDetailPanel.applyCoverFile after putStuffCoverBlob.
    useStuffStore.getState().updateItem(id, {
      coverBlobId: id,
      imageDataUrl: "",
      imageUrl: "",
    });

    const item = useStuffStore.getState().items.find((row) => row.id === id);
    expect(item?.coverBlobId).toBe(id);
    expect(item?.imageUrl).toBeUndefined();
    expect(item?.imageDataUrl).toBeUndefined();
  });

  test("clears coverBlobId when remove cover clears both image fields", async () => {
    const { useStuffStore } = await import("../../../src/stores/useStuffStore");
    useStuffStore.setState({
      items: [],
      selectedItemId: null,
    });
    const id = useStuffStore.getState().addItem({
      title: "Camera",
      coverBlobId: "blob-1",
    });

    useStuffStore.getState().updateItem(id, {
      imageDataUrl: "",
      imageUrl: "",
    });

    const item = useStuffStore.getState().items.find((row) => row.id === id);
    expect(item?.coverBlobId).toBeUndefined();
  });

  test("hotlink imageUrl clears coverBlobId", async () => {
    const { useStuffStore } = await import("../../../src/stores/useStuffStore");
    useStuffStore.setState({
      items: [],
      selectedItemId: null,
    });
    const id = useStuffStore.getState().addItem({
      title: "Camera",
      coverBlobId: "blob-1",
    });

    useStuffStore.getState().updateItem(id, {
      imageUrl: "https://example.com/cover.jpg",
      imageDataUrl: "",
      coverBlobId: "",
    });

    const item = useStuffStore.getState().items.find((row) => row.id === id);
    expect(item?.imageUrl).toBe("https://example.com/cover.jpg");
    expect(item?.coverBlobId).toBeUndefined();
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
        { id: "vintage", name: "Vintage", color: "#9c36b5", createdAt: 2 },
      ],
      items: [
        makeItem({ id: "keep-me", title: "Should Skip", tagIds: ["kitchen"] }),
        makeItem({
          id: "new-1",
          title: "Novel",
          tagIds: ["vintage"],
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
    expect(result.tags.map((t) => t.id).sort()).toEqual(["kitchen", "vintage"]);
    expect(result.items.map((i) => i.id).sort()).toEqual(["keep-me", "new-1"]);
    expect(result.items.find((i) => i.id === "new-1")?.tagIds).toEqual([
      "vintage",
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
    // Reuse the existing local tag (even a legacy UUID) — do not add a second
    // Books / stuff-default:books copy.
    expect(result.items[0]?.tagIds).toEqual(["local-books"]);
    expect(
      result.tags.filter((t) => t.name.toLowerCase() === "books")
    ).toHaveLength(1);
  });

  test("re-importing the same export is idempotent", () => {
    const existingTags = ensureDefaultStuffTags([
      { id: "custom", name: "Vintage", color: "#111", createdAt: 1 },
    ]);
    const payload: StuffShelfExport = {
      version: 1,
      exportedAt: 1,
      tags: [
        {
          id: defaultStuffTagId("Kitchen"),
          name: "Kitchen",
          color: DEFAULT_TAG_COLORS[0],
          createdAt: 1,
        },
        { id: "custom", name: "Vintage", color: "#111", createdAt: 1 },
        { id: "uuid-books", name: "Books", color: "#222", createdAt: 2 },
      ],
      items: [
        makeItem({
          id: "item-1",
          title: "Pan",
          tagIds: [defaultStuffTagId("Kitchen")],
        }),
        makeItem({
          id: "item-2",
          title: "Novel",
          tagIds: ["uuid-books", "custom"],
        }),
      ],
    };
    const json = stringifyStuffShelfExport(payload);

    const first = mergeStuffShelfImport(json, {
      items: [],
      tags: existingTags,
    });
    const afterFirst = {
      items: first.items,
      tags: ensureDefaultStuffTags(first.tags),
    };
    const second = mergeStuffShelfImport(json, afterFirst);
    const afterSecond = {
      items: second.items,
      tags: ensureDefaultStuffTags(second.tags),
    };

    expect(second.addedItems).toBe(0);
    expect(second.addedTags).toBe(0);
    expect(afterSecond.items).toHaveLength(afterFirst.items.length);
    expect(afterSecond.tags).toHaveLength(afterFirst.tags.length);
    expect(
      afterSecond.tags.filter((t) => t.name.toLowerCase() === "books")
    ).toHaveLength(1);
    expect(
      afterSecond.tags.filter((t) => t.name.toLowerCase() === "kitchen")
    ).toHaveLength(1);
  });

  test("does not duplicate default tags when export uses a different id", () => {
    const existingTags = ensureDefaultStuffTags([]);
    const payload: StuffShelfExport = {
      version: 1,
      exportedAt: 1,
      tags: [
        { id: "uuid-kitchen", name: "Kitchen", color: "#abc", createdAt: 1 },
        { id: "uuid-cd", name: "CD", color: "#def", createdAt: 2 },
        { id: "custom", name: "Vintage", color: "#111", createdAt: 3 },
      ],
      items: [
        makeItem({
          id: "item-1",
          title: "Pan",
          tagIds: ["uuid-kitchen"],
        }),
        makeItem({
          id: "item-2",
          title: "Album",
          tagIds: ["uuid-cd", "custom"],
        }),
      ],
    };

    const result = mergeStuffShelfImport(stringifyStuffShelfExport(payload), {
      items: [],
      tags: existingTags,
    });
    const tags = ensureDefaultStuffTags(result.tags);

    expect(result.addedTags).toBe(1); // only Vintage
    expect(tags.filter((t) => t.name.toLowerCase() === "kitchen")).toHaveLength(
      1
    );
    expect(tags.filter((t) => t.name.toLowerCase() === "cd")).toHaveLength(1);
    expect(tags.find((t) => t.name === "Kitchen")?.id).toBe(
      defaultStuffTagId("Kitchen")
    );
    expect(result.items.find((i) => i.id === "item-1")?.tagIds).toEqual([
      defaultStuffTagId("Kitchen"),
    ]);
    expect(result.items.find((i) => i.id === "item-2")?.tagIds).toEqual([
      defaultStuffTagId("CD"),
      "custom",
    ]);
  });

  test("remaps onto renamed default tags by stable id / English name", () => {
    const existingTags: StuffTag[] = [
      {
        id: defaultStuffTagId("Kitchen"),
        name: "Cookware", // user renamed the default
        color: "#111",
        createdAt: 1,
      },
    ];
    const payload: StuffShelfExport = {
      version: 1,
      exportedAt: 1,
      tags: [
        { id: "uuid-kitchen", name: "Kitchen", color: "#222", createdAt: 2 },
      ],
      items: [
        makeItem({
          id: "item-a",
          title: "Pan",
          tagIds: ["uuid-kitchen"],
        }),
      ],
    };

    const result = mergeStuffShelfImport(stringifyStuffShelfExport(payload), {
      items: [],
      tags: existingTags,
    });

    expect(result.addedTags).toBe(0);
    expect(result.tags).toHaveLength(1);
    expect(result.tags[0]?.id).toBe(defaultStuffTagId("Kitchen"));
    expect(result.items[0]?.tagIds).toEqual([defaultStuffTagId("Kitchen")]);
  });

  test("empty import base still creates stable default ids (not UUID twins)", () => {
    const payload: StuffShelfExport = {
      version: 1,
      exportedAt: 1,
      tags: [
        { id: "uuid-kitchen", name: "Kitchen", color: "#111", createdAt: 1 },
      ],
      items: [
        makeItem({
          id: "item-a",
          title: "Pan",
          tagIds: ["uuid-kitchen"],
        }),
      ],
    };

    const result = mergeStuffShelfImport(stringifyStuffShelfExport(payload), {
      items: [],
      tags: [],
    });
    const tags = ensureDefaultStuffTags(result.tags);

    expect(result.tags.find((t) => t.name === "Kitchen")?.id).toBe(
      defaultStuffTagId("Kitchen")
    );
    expect(tags.filter((t) => t.name.toLowerCase() === "kitchen")).toHaveLength(
      1
    );
    expect(result.items[0]?.tagIds).toEqual([defaultStuffTagId("Kitchen")]);
  });

  test("skips items without ids so re-import cannot mint duplicates", () => {
    const json = JSON.stringify({
      version: 1,
      exportedAt: 1,
      tags: [],
      items: [{ title: "No Id", notes: "", tagIds: [], status: "stowed" }],
    });
    const first = mergeStuffShelfImport(json, { items: [], tags: [] });
    expect(first.addedItems).toBe(0);
    expect(first.skippedItems).toBe(1);
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
