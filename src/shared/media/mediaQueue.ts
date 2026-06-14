/**
 * Pure, store-agnostic helpers for media playback queues shared by the iPod and
 * Karaoke stores. Kept free of any store/React imports so they can be unit
 * tested and reused without pulling in persistence machinery.
 */

/** Resolve the index of an item by id, returning -1 when absent/empty. */
export function getIndexFromSongId<T extends { id: string }>(
  items: T[],
  id: string | null
): number {
  if (!id || items.length === 0) return -1;
  const index = items.findIndex((item) => item.id === id);
  return index >= 0 ? index : -1;
}
