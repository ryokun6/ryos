/**
 * Matches listSongs ordering in api/_utils/_song-service.ts (newest first, then importOrder).
 * When both tie, preserves the prior array order (stable).
 */
export interface IpodTrackSortFields {
  id: string;
  createdAt?: number;
  importOrder?: number;
}

export function sortTracksLikeServerOrder<T extends IpodTrackSortFields>(
  tracks: T[]
): T[] {
  const indexById = new Map(tracks.map((t, i) => [t.id, i]));
  return [...tracks].sort((a, b) => {
    const createdAtDiff = (b.createdAt ?? 0) - (a.createdAt ?? 0);
    if (createdAtDiff !== 0) return createdAtDiff;
    const importDiff =
      (a.importOrder ?? Number.POSITIVE_INFINITY) -
      (b.importOrder ?? Number.POSITIVE_INFINITY);
    if (importDiff !== 0) return importDiff;
    return (indexById.get(a.id) ?? 0) - (indexById.get(b.id) ?? 0);
  });
}
