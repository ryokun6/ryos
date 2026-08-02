/** Lifecycle status for an inventory item. */
export type StuffStatus =
  | "in_use"
  | "stowed"
  | "for_sale"
  | "reserved"
  | "sold"
  | "discarded";

export const STUFF_STATUSES: StuffStatus[] = [
  "in_use",
  "stowed",
  "for_sale",
  "reserved",
  "sold",
  "discarded",
];

export interface StuffPrices {
  /** Purchase / list price */
  original?: number;
  /** Current asking / sale price */
  discounted?: number;
  /** Price it actually sold for */
  sold?: number;
  currency: string;
}

export interface StuffTag {
  id: string;
  name: string;
  color: string;
  createdAt: number;
}

/** Single-select physical/storage location (Closet, Storage, Carry On, …). */
export interface StuffLocation {
  id: string;
  name: string;
  createdAt: number;
}

/** How the cover is staged on the shelf / detail panel. */
export type StuffCoverPresentation = "default" | "cutout";

export interface StuffItem {
  id: string;
  title: string;
  notes: string;
  /**
   * Legacy inline data-URL cover. Prefer `coverBlobId` (IndexedDB + Sync v2
   * blob namespace). Kept only for migration / share payload compatibility —
   * sync codecs strip this field so ops stay under the 512 KiB limit.
   */
  imageDataUrl?: string;
  /** Remote cover URL for display when no local cover blob is stored */
  imageUrl?: string;
  /**
   * Local/cloud cover blob id (IndexedDB `stuff_images` / sync key
   * `stuff-images/item:<id>`). Usually equals the item id.
   */
  coverBlobId?: string;
  /**
   * `cutout` = transparent stage + drop shadow (background-removed PNG).
   * Omitted / `default` = normal framed product / book / CD cover.
   */
  coverPresentation?: StuffCoverPresentation;
  barcode?: string;
  /** ZXing / JsBarcode format name, e.g. EAN_13, UPC_A, CODE_128, QR_CODE */
  barcodeFormat?: string;
  brand?: string;
  productUrl?: string;
  tagIds: string[];
  /** Single-select id into the locations catalog; undefined/empty = none. */
  locationId?: string;
  status: StuffStatus;
  prices: StuffPrices;
  quantity: number;
  createdAt: number;
  updatedAt: number;
}

export type StuffItemDraft = Partial<
  Omit<StuffItem, "id" | "createdAt" | "updatedAt">
> & {
  title?: string;
};

export type StuffShelfView = "grid" | "list";

export interface StuffInitialData {
  /** Open a shared collection (deep link `/stuff/:shareId`) */
  shareId?: string;
  /** Select a specific local item on launch */
  itemId?: string;
}

/** Public snapshot of an item published in a share. */
export interface StuffSharedItem {
  id: string;
  title: string;
  notes: string;
  imageDataUrl?: string;
  imageUrl?: string;
  /**
   * Shelf staging for the cover. Preserved so shared cutouts render without
   * a box (same meaning as {@link StuffItem.coverPresentation}).
   */
  coverPresentation?: StuffCoverPresentation;
  barcode?: string;
  brand?: string;
  tagNames: string[];
  status: StuffStatus;
  prices: StuffPrices;
  quantity: number;
}

/**
 * Resolve a displayable cover `src`. Prefer a resolved blob object URL, then
 * a legacy embedded data URL, then a remote hotlink.
 */
export function stuffItemCoverSrc(
  item: Pick<StuffItem, "imageDataUrl" | "imageUrl" | "coverBlobId">,
  resolvedBlobUrl?: string | null
): string | undefined {
  const blobUrl = resolvedBlobUrl?.trim();
  if (blobUrl) return blobUrl;
  const embedded = item.imageDataUrl?.trim();
  if (embedded) return embedded;
  const remote = item.imageUrl?.trim();
  return remote || undefined;
}

export interface StuffReservation {
  id: string;
  itemId: string;
  username: string;
  createdAt: number;
  status: "active" | "cancelled";
}

export interface StuffBid {
  id: string;
  itemId: string;
  username: string;
  amount: number;
  currency: string;
  createdAt: number;
}

export interface StuffShare {
  id: string;
  ownerUsername: string;
  title: string;
  description?: string;
  items: StuffSharedItem[];
  reservations: StuffReservation[];
  bids: StuffBid[];
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_TAG_COLORS = [
  "#c45c26",
  "#2f6fed",
  "#2f9e44",
  "#9c36b5",
  "#e67700",
  "#0b7285",
  "#c92a2a",
  "#5c7cfa",
] as const;

export const DEFAULT_CURRENCY = "USD";

/** English fallback label for a stuff status key (Title Case). */
export function stuffStatusLabelDefault(
  status: StuffStatus | "all"
): string {
  if (status === "all") return "All Statuses";
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
