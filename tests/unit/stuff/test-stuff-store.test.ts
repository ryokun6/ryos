import { describe, expect, test } from "bun:test";
import {
  getFilteredStuffItems,
} from "../../../src/stores/useStuffStore";
import {
  DEFAULT_CURRENCY,
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
