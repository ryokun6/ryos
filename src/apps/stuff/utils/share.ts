import type { StuffItem, StuffSharedItem, StuffTag } from "../types";

export function toSharedItem(
  item: StuffItem,
  tags: StuffTag[]
): StuffSharedItem {
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));
  return {
    id: item.id,
    title: item.title,
    notes: item.notes,
    imageDataUrl: item.imageDataUrl,
    barcode: item.barcode,
    brand: item.brand,
    tagNames: item.tagIds
      .map((id) => tagById.get(id)?.name)
      .filter((name): name is string => Boolean(name)),
    status: item.status,
    prices: item.prices,
    quantity: item.quantity,
  };
}

export function generateStuffShareUrl(shareId: string): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/stuff/${encodeURIComponent(shareId)}`;
}
