import type { DeletionMarkerMap } from "@/utils/cloudSyncDeletionMarkers";

export function mergeItemsByIdPreferNewer<T extends { id: string; updatedAt?: number }>(
  localItems: T[],
  remoteItems: T[],
  deletedIds: DeletionMarkerMap
): T[] {
  const merged = new Map<string, T>();

  for (const item of remoteItems) {
    if (!deletedIds[item.id]) {
      merged.set(item.id, item);
    }
  }

  for (const item of localItems) {
    if (deletedIds[item.id]) {
      continue;
    }

    const existing = merged.get(item.id);
    if (!existing || (item.updatedAt ?? 0) >= (existing.updatedAt ?? 0)) {
      merged.set(item.id, item);
    }
  }

  return Array.from(merged.values());
}

export function mergeItemsById<T extends { id: string }>(
  localItems: T[],
  remoteItems: T[]
): T[] {
  const merged = new Map<string, T>();

  for (const item of remoteItems) {
    merged.set(item.id, item);
  }

  for (const item of localItems) {
    merged.set(item.id, item);
  }

  return Array.from(merged.values());
}
