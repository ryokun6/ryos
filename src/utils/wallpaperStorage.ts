export const LEGACY_INDEXEDDB_WALLPAPER_PREFIX = "indexeddb://";
export const OPFS_WALLPAPER_PREFIX = "opfs://";
export const STORED_WALLPAPER_PREFIX = OPFS_WALLPAPER_PREFIX;

const STORED_WALLPAPER_PREFIXES = [
  OPFS_WALLPAPER_PREFIX,
  LEGACY_INDEXEDDB_WALLPAPER_PREFIX,
] as const;

export function isStoredWallpaperReference(reference: string | null | undefined): boolean {
  return (
    typeof reference === "string" &&
    STORED_WALLPAPER_PREFIXES.some((prefix) => reference.startsWith(prefix))
  );
}

export function extractStoredWallpaperId(
  reference: string | null | undefined
): string | null {
  if (!reference) {
    return null;
  }

  for (const prefix of STORED_WALLPAPER_PREFIXES) {
    if (reference.startsWith(prefix)) {
      return reference.substring(prefix.length);
    }
  }

  return null;
}

export function toStoredWallpaperReference(id: string): string {
  return `${STORED_WALLPAPER_PREFIX}${id}`;
}

export function normalizeStoredWallpaperReference(reference: string): string {
  const id = extractStoredWallpaperId(reference);
  return id ? toStoredWallpaperReference(id) : reference;
}
