import type { Track } from "@/shared/media/library";

export interface IpodLibraryIndex {
  trackById: Map<string, Track>;
  indexById: Map<string, number>;
  idSet: Set<string>;
}

export function buildIpodLibraryIndex(
  tracks: readonly Track[]
): IpodLibraryIndex {
  const trackById = new Map<string, Track>();
  const indexById = new Map<string, number>();
  const idSet = new Set<string>();

  for (let index = 0; index < tracks.length; index++) {
    const track = tracks[index];
    if (!track || indexById.has(track.id)) continue;
    trackById.set(track.id, track);
    indexById.set(track.id, index);
    idSet.add(track.id);
  }

  return { trackById, indexById, idSet };
}

export function resolveCurrentTrackIndex(
  indexById: ReadonlyMap<string, number>,
  currentSongId: string | null,
  trackCount: number
): number {
  if (trackCount <= 0) return -1;
  if (!currentSongId) return 0;
  return indexById.get(currentSongId) ?? 0;
}
