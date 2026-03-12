export type DeletionMarkerMap = Record<string, string>;

function parseTimestamp(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeDeletionMarkerMap(value: unknown): DeletionMarkerMap {
  if (!value || typeof value !== "object") {
    return {};
  }

  const normalized: DeletionMarkerMap = {};

  for (const [key, marker] of Object.entries(value as Record<string, unknown>)) {
    if (typeof key === "string" && key.length > 0 && typeof marker === "string") {
      normalized[key] = marker;
    }
  }

  return normalized;
}

export function mergeDeletionMarkerMaps(
  ...maps: Array<DeletionMarkerMap | null | undefined>
): DeletionMarkerMap {
  const merged: DeletionMarkerMap = {};

  for (const map of maps) {
    if (!map) {
      continue;
    }

    for (const [key, marker] of Object.entries(map)) {
      if (parseTimestamp(marker) >= parseTimestamp(merged[key])) {
        merged[key] = marker;
      }
    }
  }

  return merged;
}

export function filterDeletedIds<T>(
  items: T[],
  deletedIds: DeletionMarkerMap,
  getId: (item: T) => string | null | undefined
): T[] {
  if (Object.keys(deletedIds).length === 0) {
    return items;
  }

  return items.filter((item) => {
    const id = getId(item);
    return !id || !deletedIds[id];
  });
}

export function isDeletedFilePath(
  path: string,
  deletedPaths: DeletionMarkerMap
): boolean {
  for (const deletedPath of Object.keys(deletedPaths)) {
    if (deletedPath === path) {
      return true;
    }

    if (deletedPath !== "/" && path.startsWith(`${deletedPath}/`)) {
      return true;
    }
  }

  return false;
}

export function filterDeletedFilePaths<T>(
  items: Record<string, T>,
  deletedPaths: DeletionMarkerMap
): Record<string, T> {
  if (Object.keys(deletedPaths).length === 0) {
    return items;
  }

  return Object.fromEntries(
    Object.entries(items).filter(([path]) => !isDeletedFilePath(path, deletedPaths))
  );
}
