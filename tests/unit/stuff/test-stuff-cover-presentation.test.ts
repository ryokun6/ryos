import { beforeEach, describe, expect, test } from "bun:test";
import {
  DEFAULT_CURRENCY,
  type StuffItem,
  type StuffTag,
} from "../../../src/apps/stuff/types";
import { toSharedItem } from "../../../src/apps/stuff/utils/share";
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

describe("Stuff coverPresentation", () => {
  beforeEach(async () => {
    const { useStuffStore } = await import("../../../src/stores/useStuffStore");
    useStuffStore.setState({
      items: [],
      selectedItemId: null,
    });
  });

  test("persists cutout presentation with cover blob", async () => {
    const { useStuffStore } = await import("../../../src/stores/useStuffStore");
    const id = useStuffStore.getState().addItem({ title: "Mug" });
    useStuffStore.getState().updateItem(id, {
      coverBlobId: id,
      imageDataUrl: "",
      imageUrl: "",
      coverPresentation: "cutout",
    });
    const item = useStuffStore.getState().items.find((row) => row.id === id);
    expect(item?.coverPresentation).toBe("cutout");
  });

  test("clears cutout when cover is removed", async () => {
    const { useStuffStore } = await import("../../../src/stores/useStuffStore");
    const id = useStuffStore.getState().addItem({
      title: "Mug",
      coverBlobId: "blob-1",
      coverPresentation: "cutout",
    });
    useStuffStore.getState().updateItem(id, {
      imageDataUrl: "",
      imageUrl: "",
    });
    const item = useStuffStore.getState().items.find((row) => row.id === id);
    expect(item?.coverBlobId).toBeUndefined();
    expect(item?.coverPresentation).toBeUndefined();
  });

  test("resets cutout when a default cover is applied", async () => {
    const { useStuffStore } = await import("../../../src/stores/useStuffStore");
    const id = useStuffStore.getState().addItem({
      title: "Mug",
      coverBlobId: "blob-1",
      coverPresentation: "cutout",
    });
    useStuffStore.getState().updateItem(id, {
      coverBlobId: id,
      imageDataUrl: "",
      imageUrl: "",
      coverPresentation: "default",
    });
    const item = useStuffStore.getState().items.find((row) => row.id === id);
    expect(item?.coverBlobId).toBe(id);
    expect(item?.coverPresentation).toBeUndefined();
  });

  test("shelf import preserves cutout with inline cover", () => {
    const dataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const payload: StuffShelfExport = {
      version: 1,
      exportedAt: 1,
      tags: [],
      items: [
        makeItem({
          id: "cutout-1",
          title: "Mug Cutout",
          imageDataUrl: dataUrl,
          coverPresentation: "cutout",
        }),
      ],
    };

    const result = mergeStuffShelfImport(
      stringifyStuffShelfExport(payload),
      { items: [], tags: [] }
    );

    expect(result.items[0]?.coverPresentation).toBe("cutout");
    expect(result.items[0]?.coverBlobId).toBe("cutout-1");
  });

  test("shelf import preserves cutout with hotlinked imageUrl", () => {
    const payload: StuffShelfExport = {
      version: 1,
      exportedAt: 1,
      tags: [],
      items: [
        makeItem({
          id: "cutout-url",
          title: "Hotlink Cutout",
          imageUrl: "https://cdn.example/cutout.png",
          coverPresentation: "cutout",
        }),
      ],
    };

    const result = mergeStuffShelfImport(
      stringifyStuffShelfExport(payload),
      { items: [], tags: [] }
    );

    expect(result.items[0]?.coverPresentation).toBe("cutout");
    expect(result.items[0]?.imageUrl).toBe("https://cdn.example/cutout.png");
  });

  test("toSharedItem includes coverPresentation cutout", () => {
    const tags: StuffTag[] = [
      { id: "a", name: "Kitchen", color: "#000", createdAt: 1 },
    ];
    const shared = toSharedItem(
      makeItem({
        title: "Pan",
        tagIds: ["a"],
        coverPresentation: "cutout",
        imageUrl: "https://cdn.example/pan.png",
      }),
      tags
    );
    expect(shared.coverPresentation).toBe("cutout");
  });
});
