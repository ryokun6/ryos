/**
 * Stuff shelf JSON import/export — mirrors TV's versioned envelope + merge
 * import (add missing tags/items; skip collisions rather than overwrite).
 */

import {
  DEFAULT_CURRENCY,
  DEFAULT_TAG_COLORS,
  STUFF_STATUSES,
  type StuffItem,
  type StuffLocation,
  type StuffPrices,
  type StuffStatus,
  type StuffTag,
} from "../types";
import { getStuffCoverDataUrl } from "./stuffCoverBlobs";
import {
  STUFF_DEFAULT_TAG_SLUGS,
  type StuffDefaultTagSlug,
} from "./stuffTagDisplayName";
import {
  STUFF_DEFAULT_LOCATION_SLUGS,
  type StuffDefaultLocationSlug,
} from "./stuffLocationDisplayName";

export const STUFF_SHELF_EXPORT_VERSION = 1 as const;

const DEFAULT_TAG_SLUG_SET = new Set<string>(STUFF_DEFAULT_TAG_SLUGS);

/** Canonical English names for seeded defaults (matches store DEFAULT_TAGS). */
const CANONICAL_DEFAULT_TAG_NAME: Record<StuffDefaultTagSlug, string> = {
  kitchen: "Kitchen",
  electronics: "Electronics",
  clothing: "Clothing",
  books: "Books",
  furniture: "Furniture",
  cd: "CD",
  other: "Other",
};

function defaultStuffTagId(slug: StuffDefaultTagSlug): string {
  return `stuff-default:${slug}`;
}

/** Resolve a seeded-default slug from export id and/or English name. */
function resolveDefaultTagSlug(
  id: string,
  name: string
): StuffDefaultTagSlug | null {
  if (id.startsWith("stuff-default:")) {
    const slug = id.slice("stuff-default:".length);
    if (DEFAULT_TAG_SLUG_SET.has(slug)) return slug as StuffDefaultTagSlug;
  }
  const byName = name.trim().toLowerCase();
  if (DEFAULT_TAG_SLUG_SET.has(byName)) return byName as StuffDefaultTagSlug;
  return null;
}

const DEFAULT_LOCATION_SLUG_SET = new Set<string>(STUFF_DEFAULT_LOCATION_SLUGS);

/** Canonical English names for seeded defaults (matches store DEFAULT_LOCATIONS). */
const CANONICAL_DEFAULT_LOCATION_NAME: Record<StuffDefaultLocationSlug, string> = {
  closet: "Closet",
  storage: "Storage",
  "carry-on": "Carry On",
  "checked-in": "Checked In",
  box: "Box",
};

function defaultStuffLocationId(slug: StuffDefaultLocationSlug): string {
  return `stuff-location-default:${slug}`;
}

/** Resolve a seeded-default location slug from export id and/or (slugified) name. */
function resolveDefaultLocationSlug(
  id: string,
  name: string
): StuffDefaultLocationSlug | null {
  if (id.startsWith("stuff-location-default:")) {
    const slug = id.slice("stuff-location-default:".length);
    if (DEFAULT_LOCATION_SLUG_SET.has(slug)) {
      return slug as StuffDefaultLocationSlug;
    }
  }
  const bySlug = name.trim().toLowerCase().replace(/\s+/g, "-");
  if (DEFAULT_LOCATION_SLUG_SET.has(bySlug)) {
    return bySlug as StuffDefaultLocationSlug;
  }
  return null;
}

export interface StuffShelfExport {
  version: typeof STUFF_SHELF_EXPORT_VERSION;
  exportedAt: number;
  tags: StuffTag[];
  /** Optional so exports created before locations existed still parse. */
  locations?: StuffLocation[];
  items: StuffItem[];
}

export interface ImportStuffShelfCounts {
  addedItems: number;
  addedTags: number;
  addedLocations: number;
  skippedItems: number;
  skippedTags: number;
  skippedLocations: number;
}

export interface ImportStuffShelfResult extends ImportStuffShelfCounts {
  items: StuffItem[];
  tags: StuffTag[];
  locations: StuffLocation[];
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
  items: StuffItem[],
  locations: StuffLocation[]
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
    locations: locations.map((location) => ({ ...location })),
    items: exportedItems,
  };
}

export function stringifyStuffShelfExport(payload: StuffShelfExport): string {
  return JSON.stringify(payload, null, 2);
}

/**
 * Parse a Stuff shelf export and merge into existing items/tags.
 * Existing ids are kept (skipped); new entries are appended.
 * Tags that match by id, case-insensitive name, or seeded-default slug
 * remap item tagIds without duplicating. Default-named tags always land on
 * `stuff-default:<slug>` so ensureDefaultStuffTags cannot add a second copy.
 */
export function mergeStuffShelfImport(
  json: string,
  existing: { items: StuffItem[]; tags: StuffTag[]; locations: StuffLocation[] }
): ImportStuffShelfResult {
  const parsed = JSON.parse(json) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid Stuff shelf format");
  }

  const envelope = parsed as Partial<StuffShelfExport>;
  const incomingTagsRaw = Array.isArray(envelope.tags) ? envelope.tags : null;
  const incomingLocationsRaw = Array.isArray(envelope.locations)
    ? envelope.locations
    : null;
  const incomingItemsRaw = Array.isArray(envelope.items) ? envelope.items : null;

  if (!incomingTagsRaw && !incomingLocationsRaw && !incomingItemsRaw) {
    throw new Error("Invalid Stuff shelf format");
  }

  const tags = [...existing.tags];
  const locations = [...existing.locations];
  const items = [...existing.items];
  const existingTagIds = new Set<string>();
  const existingLocationIds = new Set<string>();
  const existingItemIds = new Set(items.map((item) => item.id));
  const tagIdByName = new Map<string, string>();
  const locationIdByName = new Map<string, string>();
  /** Map exported tag id → local tag id after merge. */
  const tagIdMap = new Map<string, string>();
  /** Map exported location id → local location id after merge. */
  const locationIdMap = new Map<string, string>();

  const rememberTag = (tag: StuffTag) => {
    existingTagIds.add(tag.id);
    tagIdByName.set(tag.name.trim().toLowerCase(), tag.id);
    const slug = resolveDefaultTagSlug(tag.id, tag.name);
    if (slug) {
      // Also index by canonical English name so renamed defaults still match.
      tagIdByName.set(slug, tag.id);
      tagIdByName.set(CANONICAL_DEFAULT_TAG_NAME[slug].toLowerCase(), tag.id);
    }
  };

  // Index existing tags (incl. renamed defaults → canonical slug/name).
  for (const tag of tags) rememberTag(tag);

  const mapExportTagId = (exportId: string, localId: string) => {
    if (exportId) tagIdMap.set(exportId, localId);
    tagIdMap.set(localId, localId);
  };

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
    const defaultSlug = resolveDefaultTagSlug(preferredId, name);

    // 1) Exact id collision → keep local, never add a second.
    if (preferredId && existingTagIds.has(preferredId)) {
      mapExportTagId(preferredId, preferredId);
      skippedTags += 1;
      continue;
    }

    // 2) Seeded default (by stable id or English name) → reuse/create stable id.
    if (defaultSlug) {
      const stableId = defaultStuffTagId(defaultSlug);
      const byStable = existingTagIds.has(stableId) ? stableId : undefined;
      const byName =
        tagIdByName.get(nameKey) ??
        tagIdByName.get(defaultSlug) ??
        tagIdByName.get(CANONICAL_DEFAULT_TAG_NAME[defaultSlug].toLowerCase());
      const localId = byStable ?? byName;

      if (localId) {
        if (preferredId) mapExportTagId(preferredId, localId);
        mapExportTagId(stableId, localId);
        skippedTags += 1;
        continue;
      }

      // No local match — add under the stable default id (not a random UUID).
      const color =
        typeof candidate.color === "string" && candidate.color.trim()
          ? candidate.color.trim()
          : DEFAULT_TAG_COLORS[tags.length % DEFAULT_TAG_COLORS.length];
      const createdAt =
        typeof candidate.createdAt === "number" &&
        Number.isFinite(candidate.createdAt)
          ? candidate.createdAt
          : Date.now();
      const tag: StuffTag = {
        id: stableId,
        name: CANONICAL_DEFAULT_TAG_NAME[defaultSlug],
        color,
        createdAt,
      };
      tags.push(tag);
      rememberTag(tag);
      if (preferredId) mapExportTagId(preferredId, stableId);
      mapExportTagId(stableId, stableId);
      addedTags += 1;
      continue;
    }

    // 3) Custom tag — match by case-insensitive name.
    const byName = tagIdByName.get(nameKey);
    if (byName) {
      if (preferredId) mapExportTagId(preferredId, byName);
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
    rememberTag(tag);
    if (preferredId) mapExportTagId(preferredId, id);
    mapExportTagId(id, id);
    addedTags += 1;
  }

  const rememberLocation = (location: StuffLocation) => {
    existingLocationIds.add(location.id);
    locationIdByName.set(location.name.trim().toLowerCase(), location.id);
    const slug = resolveDefaultLocationSlug(location.id, location.name);
    if (slug) {
      // Also index by canonical English name so renamed defaults still match.
      locationIdByName.set(slug, location.id);
      locationIdByName.set(
        CANONICAL_DEFAULT_LOCATION_NAME[slug].toLowerCase(),
        location.id
      );
    }
  };

  // Index existing locations (incl. renamed defaults → canonical slug/name).
  for (const location of locations) rememberLocation(location);

  const mapExportLocationId = (exportId: string, localId: string) => {
    if (exportId) locationIdMap.set(exportId, localId);
    locationIdMap.set(localId, localId);
  };

  let addedLocations = 0;
  let skippedLocations = 0;

  for (const raw of incomingLocationsRaw ?? []) {
    if (!raw || typeof raw !== "object") {
      skippedLocations += 1;
      continue;
    }
    const candidate = raw as Partial<StuffLocation>;
    const name =
      typeof candidate.name === "string" ? candidate.name.trim() : "";
    if (!name) {
      skippedLocations += 1;
      continue;
    }

    const preferredId =
      typeof candidate.id === "string" && candidate.id.trim()
        ? candidate.id.trim()
        : "";
    const nameKey = name.toLowerCase();
    const defaultSlug = resolveDefaultLocationSlug(preferredId, name);

    // 1) Exact id collision → keep local, never add a second.
    if (preferredId && existingLocationIds.has(preferredId)) {
      mapExportLocationId(preferredId, preferredId);
      skippedLocations += 1;
      continue;
    }

    // 2) Seeded default (by stable id or English name) → reuse/create stable id.
    if (defaultSlug) {
      const stableId = defaultStuffLocationId(defaultSlug);
      const byStable = existingLocationIds.has(stableId) ? stableId : undefined;
      const byName =
        locationIdByName.get(nameKey) ??
        locationIdByName.get(defaultSlug) ??
        locationIdByName.get(
          CANONICAL_DEFAULT_LOCATION_NAME[defaultSlug].toLowerCase()
        );
      const localId = byStable ?? byName;

      if (localId) {
        if (preferredId) mapExportLocationId(preferredId, localId);
        mapExportLocationId(stableId, localId);
        skippedLocations += 1;
        continue;
      }

      // No local match — add under the stable default id (not a random UUID).
      const createdAt =
        typeof candidate.createdAt === "number" &&
        Number.isFinite(candidate.createdAt)
          ? candidate.createdAt
          : Date.now();
      const location: StuffLocation = {
        id: stableId,
        name: CANONICAL_DEFAULT_LOCATION_NAME[defaultSlug],
        createdAt,
      };
      locations.push(location);
      rememberLocation(location);
      if (preferredId) mapExportLocationId(preferredId, stableId);
      mapExportLocationId(stableId, stableId);
      addedLocations += 1;
      continue;
    }

    // 3) Custom location — match by case-insensitive name.
    const byName = locationIdByName.get(nameKey);
    if (byName) {
      if (preferredId) mapExportLocationId(preferredId, byName);
      skippedLocations += 1;
      continue;
    }

    let id = preferredId || crypto.randomUUID();
    while (existingLocationIds.has(id)) id = crypto.randomUUID();

    const createdAt =
      typeof candidate.createdAt === "number" && Number.isFinite(candidate.createdAt)
        ? candidate.createdAt
        : Date.now();

    const location: StuffLocation = { id, name, createdAt };
    locations.push(location);
    rememberLocation(location);
    if (preferredId) mapExportLocationId(preferredId, id);
    mapExportLocationId(id, id);
    addedLocations += 1;
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

    // Same id (including within this import) → skip; never mint a second copy.
    if (preferredId && existingItemIds.has(preferredId)) {
      skippedItems += 1;
      continue;
    }

    // Items without a stable id cannot be idempotently re-imported; skip rather
    // than assign a fresh UUID that would duplicate on every re-import.
    if (!preferredId) {
      skippedItems += 1;
      continue;
    }

    const id = preferredId;

    const seenTagIds = new Set<string>();
    const remappedTagIds = (
      Array.isArray(candidate.tagIds) ? candidate.tagIds : []
    )
      .filter((tagId): tagId is string => typeof tagId === "string")
      .map((tagId) => tagIdMap.get(tagId) ?? tagId)
      .filter((tagId) => {
        if (!existingTagIds.has(tagId) || seenTagIds.has(tagId)) return false;
        seenTagIds.add(tagId);
        return true;
      });

    const rawLocationId =
      typeof candidate.locationId === "string" && candidate.locationId.trim()
        ? candidate.locationId.trim()
        : undefined;
    const mappedLocationId = rawLocationId
      ? locationIdMap.get(rawLocationId) ?? rawLocationId
      : undefined;
    const remappedLocationId =
      mappedLocationId && existingLocationIds.has(mappedLocationId)
        ? mappedLocationId
        : undefined;

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
      locationId: remappedLocationId,
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
    addedLocations,
    skippedItems,
    skippedTags,
    skippedLocations,
    items,
    tags,
    locations,
    coverIngest,
  };
}
