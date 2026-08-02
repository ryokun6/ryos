import type { StuffItem, StuffSharedItem, StuffTag } from "../types";
import { getStuffCoverDataUrl } from "./stuffCoverBlobs";

export function toSharedItem(
  item: StuffItem,
  tags: StuffTag[],
  options?: { imageDataUrl?: string }
): StuffSharedItem {
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));
  return {
    id: item.id,
    title: item.title,
    notes: item.notes,
    imageDataUrl: options?.imageDataUrl ?? item.imageDataUrl,
    imageUrl: item.imageUrl,
    coverPresentation:
      item.coverPresentation === "cutout" ? "cutout" : undefined,
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

/** Resolve cover blobs to data URLs for the public share payload. */
export async function toSharedItemAsync(
  item: StuffItem,
  tags: StuffTag[]
): Promise<StuffSharedItem> {
  let imageDataUrl = item.imageDataUrl;
  if (!imageDataUrl && item.coverBlobId) {
    try {
      imageDataUrl = await getStuffCoverDataUrl(item.coverBlobId);
    } catch (error) {
      console.error("[Stuff] Failed to resolve cover for share:", error);
    }
  }
  return toSharedItem(item, tags, { imageDataUrl });
}

export function generateStuffShareUrl(shareId: string): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/stuff/${encodeURIComponent(shareId)}`;
}
