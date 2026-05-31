export type TrackWithIndex<T extends { artist?: string }> = {
  track: T;
  index: number;
};

export function groupTracksByArtist<T extends { artist?: string }>(
  tracks: T[],
  unknownArtistLabel: string,
): Record<string, TrackWithIndex<T>[]> {
  const grouped: Record<string, TrackWithIndex<T>[]> = {};
  for (let index = 0; index < tracks.length; index++) {
    const track = tracks[index];
    const artist = track.artist || unknownArtistLabel;
    const bucket = grouped[artist] || (grouped[artist] = []);
    bucket.push({ track, index });
  }
  return grouped;
}

export function getSortedArtistNames(
  tracksByArtist: Record<string, unknown[]>,
): string[] {
  return Object.keys(tracksByArtist).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}
