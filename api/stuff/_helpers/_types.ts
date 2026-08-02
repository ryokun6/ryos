export type StuffSharePrices = {
  original?: number;
  discounted?: number;
  sold?: number;
  currency: string;
};

export type StuffShareItem = {
  id: string;
  title: string;
  notes: string;
  imageDataUrl?: string;
  barcode?: string;
  brand?: string;
  tagNames: string[];
  status:
    | "in_use"
    | "stowed"
    | "for_sale"
    | "reserved"
    | "sold"
    | "discarded";
  prices: StuffSharePrices;
  quantity: number;
};

export type StuffShareReservation = {
  id: string;
  itemId: string;
  username: string;
  createdAt: number;
  status: "active" | "cancelled";
};

export type StuffShareBid = {
  id: string;
  itemId: string;
  username: string;
  amount: number;
  currency: string;
  createdAt: number;
};

export type StuffShareRecord = {
  id: string;
  ownerUsername: string;
  title: string;
  description?: string;
  items: StuffShareItem[];
  reservations: StuffShareReservation[];
  bids: StuffShareBid[];
  createdAt: number;
  updatedAt: number;
};
