import { describe, expect, test } from "bun:test";
import {
  ensureFurnitureTag,
  getFilteredStuffItems,
} from "../../../src/stores/useStuffStore";
import {
  DEFAULT_CURRENCY,
  DEFAULT_TAG_COLORS,
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

describe("ensureFurnitureTag", () => {
  const baseTags: StuffTag[] = [
    { id: "1", name: "Kitchen", color: DEFAULT_TAG_COLORS[0], createdAt: 1 },
    { id: "2", name: "Books", color: DEFAULT_TAG_COLORS[3], createdAt: 2 },
    { id: "3", name: "Other", color: DEFAULT_TAG_COLORS[4], createdAt: 3 },
  ];

  test("inserts Furniture before Other when missing", () => {
    const next = ensureFurnitureTag(baseTags);
    expect(next.map((t) => t.name)).toEqual([
      "Kitchen",
      "Books",
      "Furniture",
      "Other",
    ]);
    expect(next[2]?.color).toBe(DEFAULT_TAG_COLORS[5]);
  });

  test("does not duplicate existing Furniture", () => {
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
    const next = ensureFurnitureTag(withFurniture);
    expect(next).toBe(withFurniture);
  });

  test("appends when Other is absent", () => {
    const withoutOther = baseTags.slice(0, 2);
    const next = ensureFurnitureTag(withoutOther);
    expect(next.map((t) => t.name)).toEqual([
      "Kitchen",
      "Books",
      "Furniture",
    ]);
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
