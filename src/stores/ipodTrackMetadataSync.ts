interface TrackLyricsSourceFields {
  hash?: string;
}

interface TrackMetadataFields {
  title?: string;
  artist?: string;
  album?: string;
  cover?: string;
  coverColor?: string;
  url?: string;
  lyricOffset?: number;
  lyricsSource?: TrackLyricsSourceFields | null;
}

function normalizeCoverColorForSync(
  coverColor: string | null | undefined
): string | undefined {
  const trimmed = coverColor?.trim();
  return trimmed ? trimmed.toLowerCase() : undefined;
}

export function hasCoverColorMetadataChange(
  currentTrack: TrackMetadataFields,
  serverTrack: TrackMetadataFields
): boolean {
  return (
    normalizeCoverColorForSync(currentTrack.coverColor) !==
    normalizeCoverColorForSync(serverTrack.coverColor)
  );
}

export function getCoverColorToSyncToRemote(
  currentTrack: TrackMetadataFields,
  serverTrack: TrackMetadataFields
): string | undefined {
  const currentCoverColor = normalizeCoverColorForSync(currentTrack.coverColor);
  const serverCoverColor = normalizeCoverColorForSync(serverTrack.coverColor);
  if (!currentCoverColor || serverCoverColor) return undefined;
  if (serverTrack.cover !== undefined && currentTrack.cover !== serverTrack.cover) {
    return undefined;
  }
  return currentCoverColor;
}

export function shouldUpdateTrackLyricsSource(
  currentTrack: TrackMetadataFields,
  serverTrack: TrackMetadataFields
): boolean {
  return Boolean(
    serverTrack.lyricsSource &&
      (!currentTrack.lyricsSource ||
        currentTrack.lyricsSource.hash !== serverTrack.lyricsSource.hash)
  );
}

export function hasLibraryTrackMetadataChangesExcludingCoverColor(
  currentTrack: TrackMetadataFields,
  serverTrack: TrackMetadataFields
): boolean {
  return (
    currentTrack.title !== serverTrack.title ||
    currentTrack.artist !== serverTrack.artist ||
    currentTrack.album !== serverTrack.album ||
    currentTrack.cover !== serverTrack.cover ||
    currentTrack.url !== serverTrack.url ||
    currentTrack.lyricOffset !== serverTrack.lyricOffset ||
    shouldUpdateTrackLyricsSource(currentTrack, serverTrack)
  );
}

export function hasLibraryTrackMetadataChanges(
  currentTrack: TrackMetadataFields,
  serverTrack: TrackMetadataFields
): boolean {
  return (
    hasLibraryTrackMetadataChangesExcludingCoverColor(
      currentTrack,
      serverTrack
    ) ||
    hasCoverColorMetadataChange(currentTrack, serverTrack)
  );
}

export function hasFetchedTrackMetadataChangesExcludingCoverColor(
  currentTrack: TrackMetadataFields,
  fetchedTrack: TrackMetadataFields
): boolean {
  return Boolean(
    (fetchedTrack.title && fetchedTrack.title !== currentTrack.title) ||
      (fetchedTrack.artist && fetchedTrack.artist !== currentTrack.artist) ||
      (fetchedTrack.album && fetchedTrack.album !== currentTrack.album) ||
      (fetchedTrack.cover && fetchedTrack.cover !== currentTrack.cover) ||
      (fetchedTrack.lyricOffset !== undefined &&
        fetchedTrack.lyricOffset !== currentTrack.lyricOffset) ||
      shouldUpdateTrackLyricsSource(currentTrack, fetchedTrack)
  );
}

export function hasFetchedTrackMetadataChanges(
  currentTrack: TrackMetadataFields,
  fetchedTrack: TrackMetadataFields
): boolean {
  return Boolean(
    hasFetchedTrackMetadataChangesExcludingCoverColor(
      currentTrack,
      fetchedTrack
    ) ||
      hasCoverColorMetadataChange(currentTrack, fetchedTrack)
  );
}

export function resolveSyncedCoverColor(
  currentTrack: TrackMetadataFields,
  serverTrack: TrackMetadataFields
): string | undefined {
  const currentCoverColor = normalizeCoverColorForSync(currentTrack.coverColor);
  const serverCoverColor = normalizeCoverColorForSync(serverTrack.coverColor);
  if (serverTrack.cover !== undefined && currentTrack.cover !== serverTrack.cover) {
    return serverCoverColor;
  }
  return serverCoverColor ?? currentCoverColor;
}
