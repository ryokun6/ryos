/**
 * Stuff shelf JSON import/export — mirrors TV's versioned envelope + merge
 * import (add missing tags/items; skip collisions rather than overwrite).
 */

import {
  DEFAULT_CURRENCY,
  DEFAULT_TAG_COLORS,
  STUFF_STATUSES,
  type StuffItem,
  type StuffPrices,
  type StuffStatus,
  type StuffTag,
} from "../types";
import { getStuffCoverDataUrl } from "./stuffCoverBlobs";

export const STUFF_SHELF_EXPORT_VERSION = 1 as const;

export interface StuffShelfExport {
  version: typeof STUFF_SHELF_EXPORT_VERSION;
  exportedAt: number;
  tags: StuffTag[];
  items: StuffItem[];
}

export interface ImportStuffShelfCounts {
  addedItems: number;
  addedTags: number;
  skippedItems: number;
  skippedTags: number;
}

export interface ImportStuffShelfResult extends ImportStuffShelfCounts {
  items: StuffItem[];
  tags: StuffTag[];
  /** Item ids that need imageDataUrl → cover blob ingestion after setState. */
  coverIngest: Array<{ itemId: string; imageDataUrl: string }>;
}

function isStuffStatus(value: unknown): value is StuffStatus {
  return (
    typeof value === "string" &&
    (STUFF_STATUSES as readonly string[]).includes(value)
  );
}

function normalizePrices(raw: unknown): StuffPrices {
  if (!raw || typeof raw !== "object") {
    return { currency: DEFAULT_CURRENCY };
  }
  const prices = raw as Partial<StuffPrices>;
  const currency =
    typeof prices.currency === "string" && prices.currency.trim()
      ? prices.currency.trim()
      : DEFAULT_CURRENCY;
  const pick = (key: "original" | "discounted" | "sold"): number | undefined => {
    const value = prices[key];
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  };
  return {
    currency,
    original: pick("original"),
    discounted: pick("discounted"),
    sold: pick("sold"),
  };
}

/** Resolve cover blobs to inline data URLs for a portable JSON backup. */
export async function buildStuffShelfExport(
  tags: StuffTag[],
  items: StuffItem[]
): Promise<StuffShelfExport> {
  const exportedItems: StuffItem[] = await Promise.all(
    items.map(async (item) => {
      let imageDataUrl = item.imageDataUrl;
      if (!imageDataUrl?.trim() && item.coverBlobId) {
        try {
          imageDataUrl = await getStuffCoverDataUrl(item.coverBlobId);
        } catch (error) {
          console.error("[Stuff] Failed to resolve cover for export:", error);
        }
      }
      return {
        ...item,
        imageDataUrl: imageDataUrl?.trim() || undefined,
        // Blob ids are device-local; recreated on import from imageDataUrl.
        coverBlobId: undefined,
        // Explicit so cutout staging survives JSON round-trips.
        coverPresentation:
          item.coverPresentation === "cutout" ? "cutout" : undefined,
      };
    })
  );

  return {
    version: STUFF_SHELF_EXPORT_VERSION,
    exportedAt: Date.now(),
    tags: tags.map((tag) => ({ ...tag })),
    items: exportedItems,
  };
}

export function stringifyStuffShelfExport(payload: StuffShelfExport): string {
  return JSON.stringify(payload, null, 2);
}

/**
 * Parse a Stuff shelf export and merge into existing items/tags.
 * Existing ids are kept (skipped); new entries are appended.
 * Tags that match by name (case-insensitive) remap item tagIds without duplicating.
 */
export function mergeStuffShelfImport(
  json: string,
  existing: { items: StuffItem[]; tags: StuffTag[] }
): ImportStuffShelfResult {
  const parsed = JSON.parse(json) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid Stuff shelf format");
  }

  const envelope = parsed as Partial<StuffShelfExport>;
  const incomingTagsRaw = Array.isArray(envelope.tags) ? envelope.tags : null;
  const incomingItemsRaw = Array.isArray(envelope.items) ? envelope.items : null;

  if (!incomingTagsRaw && !incomingItemsRaw) {
    throw new Error("Invalid Stuff shelf format");
  }

  const tags = [...existing.tags];
  const items = [...existing.items];
  const existingTagIds = new Set(tags.map((tag) => tag.id));
  const existingItemIds = new Set(items.map((item) => item.id));
  const tagIdByName = new Map(
    tags.map((tag) => [tag.name.trim().toLowerCase(), tag.id])
  );
  /** Map exported tag id → local tag id after merge. */
  const tagIdMap = new Map<string, string>();

  let addedTags = 0;
  let skippedTags = 0;

  for (const raw of incomingTagsRaw ?? []) {
    if (!raw || typeof raw !== "object") {
      skippedTags += 1;
      continue;
    }
    const candidate = raw as Partial<StuffTag>;
    const name =
      typeof candidate.name === "string" ? candidate.name.trim() : "";
    if (!name) {
      skippedTags += 1;
      continue;
    }

    const preferredId =
      typeof candidate.id === "string" && candidate.id.trim()
        ? candidate.id.trim()
        : "";
    const nameKey = name.toLowerCase();

    if (preferredId && existingTagIds.has(preferredId)) {
      tagIdMap.set(preferredId, preferredId);
      skippedTags += 1;
      continue;
    }

    const byName = tagIdByName.get(nameKey);
    if (byName) {
      if (preferredId) tagIdMap.set(preferredId, byName);
      skippedTags += 1;
      continue;
    }

    let id = preferredId || crypto.randomUUID();
    while (existingTagIds.has(id)) id = crypto.randomUUID();

    const color =
      typeof candidate.color === "string" && candidate.color.trim()
        ? candidate.color.trim()
        : DEFAULT_TAG_COLORS[tags.length % DEFAULT_TAG_COLORS.length];
    const createdAt =
      typeof candidate.createdAt === "number" && Number.isFinite(candidate.createdAt)
        ? candidate.createdAt
        : Date.now();

    const tag: StuffTag = { id, name, color, createdAt };
    tags.push(tag);
    existingTagIds.add(id);
    tagIdByName.set(nameKey, id);
    if (preferredId) tagIdMap.set(preferredId, id);
    tagIdMap.set(id, id);
    addedTags += 1;
  }

  let addedItems = 0;
  let skippedItems = 0;
  const coverIngest: Array<{ itemId: string; imageDataUrl: string }> = [];
  const now = Date.now();

  for (const raw of incomingItemsRaw ?? []) {
    if (!raw || typeof raw !== "object") {
      skippedItems += 1;
      continue;
    }
    const candidate = raw as Partial<StuffItem>;
    const title =
      typeof candidate.title === "string" ? candidate.title.trim() : "";
    if (!title) {
      skippedItems += 1;
      continue;
    }

    const preferredId =
      typeof candidate.id === "string" && candidate.id.trim()
        ? candidate.id.trim()
        : "";

    if (preferredId && existingItemIds.has(preferredId)) {
      skippedItems += 1;
      continue;
    }

    let id = preferredId || crypto.randomUUID();
    while (existingItemIds.has(id)) id = crypto.randomUUID();

    const remappedTagIds = (
      Array.isArray(candidate.tagIds) ? candidate.tagIds : []
    )
      .filter((tagId): tagId is string => typeof tagId === "string")
      .map((tagId) => tagIdMap.get(tagId) ?? tagId)
      .filter((tagId) => existingTagIds.has(tagId));

    const imageDataUrl =
      typeof candidate.imageDataUrl === "string" &&
      candidate.imageDataUrl.trim().startsWith("data:image/")
        ? candidate.imageDataUrl.trim()
        : undefined;
    const imageUrl =
      typeof candidate.imageUrl === "string" && candidate.imageUrl.trim()
        ? candidate.imageUrl.trim()
        : undefined;
    const hasCover = Boolean(imageDataUrl || imageUrl);

    const item: StuffItem = {
      id,
      title,
      notes: typeof candidate.notes === "string" ? candidate.notes : "",
      imageDataUrl: undefined,
      imageUrl,
      coverBlobId: imageDataUrl ? id : undefined,
      coverPresentation:
        candidate.coverPresentation === "cutout" && hasCover
          ? "cutout"
          : undefined,
      barcode:
        typeof candidate.barcode === "string" ? candidate.barcode : undefined,
      barcodeFormat:
        typeof candidate.barcodeFormat === "string"
          ? candidate.barcodeFormat
          : undefined,
      brand: typeof candidate.brand === "string" ? candidate.brand : undefined,
      productUrl:
        typeof candidate.productUrl === "string"
          ? candidate.productUrl
          : undefined,
      tagIds: remappedTagIds,
      status: isStuffStatus(candidate.status) ? candidate.status : "stowed",
      prices: normalizePrices(candidate.prices),
      quantity: Math.max(
        1,
        typeof candidate.quantity === "number" && Number.isFinite(candidate.quantity)
          ? Math.floor(candidate.quantity)
          : 1
      ),
      createdAt:
        typeof candidate.createdAt === "number" && Number.isFinite(candidate.createdAt)
          ? candidate.createdAt
          : now,
      updatedAt:
        typeof candidate.updatedAt === "number" && Number.isFinite(candidate.updatedAt)
          ? candidate.updatedAt
          : now,
    };

    items.push(item);
    existingItemIds.add(id);
    if (imageDataUrl) {
      coverIngest.push({ itemId: id, imageDataUrl });
    }
    addedItems += 1;
  }

  return {
    addedItems,
    addedTags,
    skippedItems,
    skippedTags,
    items,
    tags,
    coverIngest,
  };
}
