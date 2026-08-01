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

export interface StuffItem {
  id: string;
  title: string;
  notes: string;
  /** Local data-URL thumbnail (optional) */
  imageDataUrl?: string;
  barcode?: string;
  /** ZXing / JsBarcode format name, e.g. EAN_13, UPC_A, CODE_128, QR_CODE */
  barcodeFormat?: string;
  brand?: string;
  productUrl?: string;
  tagIds: string[];
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
  barcode?: string;
  brand?: string;
  tagNames: string[];
  status: StuffStatus;
  prices: StuffPrices;
  quantity: number;
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
