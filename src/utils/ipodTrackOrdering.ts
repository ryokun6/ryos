/**
 * Shared iPod/Karaoke library ordering: matches Redis song list sort
 * (newest createdAt first, then importOrder).
 */

export interface TrackCatalogSortKey {
  id: string;
  createdAt?: number;
  importOrder?: number;
}

export function sortTracksByCatalogOrder<T extends TrackCatalogSortKey>(
  tracks: T[]
): T[] {
  return [...tracks].sort((a, b) => {
    const ac = a.createdAt;
    const bc = b.createdAt;
    if (ac != null && bc != null && ac !== bc) {
      return bc - ac;
    }
    if (ac != null && bc == null) {
      return -1;
    }
    if (ac == null && bc != null) {
      return 1;
    }
    const ai = a.importOrder ?? Number.POSITIVE_INFINITY;
    const bi = b.importOrder ?? Number.POSITIVE_INFINITY;
    if (ai !== bi) {
      return ai - bi;
    }
    return a.id.localeCompare(b.id);
  });
}
