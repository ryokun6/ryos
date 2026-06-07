import { ApiRequestError } from "@/api/core";
import { listSongs, patchSongMetadata } from "@/api/songs";
import { useChatsStore } from "@/stores/useChatsStore";
import { sortTracksLikeServerOrder } from "@/stores/ipodTrackOrder";
import {
  hasFetchedTrackMetadataChanges,
  hasLibraryTrackMetadataChanges,
  resolveSyncedCoverColor,
  shouldUpdateTrackLyricsSource,
} from "@/stores/ipodTrackMetadataSync";
import type { IpodGet, IpodSet, LyricsSource } from "./types";
import { loadDefaultTracks } from "./shared";

// Debounce timers for saving lyric offset (keyed by track ID)
const lyricOffsetSaveTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
const pendingLyricOffsets: Map<string, number> = new Map();

async function saveLyricOffsetToServer(
  trackId: string,
  lyricOffset: number
): Promise<boolean> {
  const { username, isAuthenticated } = useChatsStore.getState();
  if (!username || !isAuthenticated) {
    console.log(`[iPod Store] Skipping lyric offset save for ${trackId} - user not logged in`);
    return false;
  }
  console.log(`[iPod Store] Saving lyric offset for ${trackId}: ${lyricOffset}ms...`);
  try {
    const data = await patchSongMetadata(trackId, { lyricOffset }, { username, isAuthenticated });
    if (data.success) {
      console.log(`[iPod Store] ✓ Saved lyric offset for ${trackId}: ${lyricOffset}ms (by ${data.createdBy || username})`);
      return true;
    }
    console.warn(`[iPod Store] Server returned failure for ${trackId}:`, data);
    return false;
  } catch (error) {
    if (error instanceof ApiRequestError) {
      if (error.status === 401) {
        console.warn(`[iPod Store] Unauthorized - user must be logged in to save lyric offset`);
        return false;
      }
      if (error.status === 403) {
        console.log(`[iPod Store] Cannot save lyric offset for ${trackId} - song owned by another user`);
        return false;
      }
      console.warn(`[iPod Store] Failed to save lyric offset for ${trackId}: ${error.status} - ${error.message}`);
      return false;
    }
    console.error(`[iPod Store] Error saving lyric offset for ${trackId}:`, error);
    return false;
  }
}

export function debouncedSaveLyricOffset(trackId: string, lyricOffset: number): void {
  pendingLyricOffsets.set(trackId, lyricOffset);
  const existingTimer = lyricOffsetSaveTimers.get(trackId);
  if (existingTimer) clearTimeout(existingTimer);
  const timer = setTimeout(() => {
    lyricOffsetSaveTimers.delete(trackId);
    pendingLyricOffsets.delete(trackId);
    saveLyricOffsetToServer(trackId, lyricOffset);
  }, 2000);
  lyricOffsetSaveTimers.set(trackId, timer);
}

export async function flushPendingLyricOffsetSave(trackId: string): Promise<void> {
  const existingTimer = lyricOffsetSaveTimers.get(trackId);
  const pendingOffset = pendingLyricOffsets.get(trackId);
  if (existingTimer && pendingOffset !== undefined) {
    clearTimeout(existingTimer);
    lyricOffsetSaveTimers.delete(trackId);
    pendingLyricOffsets.delete(trackId);
    console.log(`[iPod Store] Flushing pending lyric offset save for ${trackId}: ${pendingOffset}ms`);
    await saveLyricOffsetToServer(trackId, pendingOffset);
  }
}

export async function saveLyricsSourceToServer(
  trackId: string,
  lyricsSource: LyricsSource | null
): Promise<void> {
  const { username, isAuthenticated } = useChatsStore.getState();
  if (!username || !isAuthenticated) {
    console.log(`[iPod Store] Skipping lyrics source save for ${trackId} - user not logged in`);
    return;
  }
  try {
    const data = await patchSongMetadata(
      trackId,
      {
        ...(lyricsSource && {
          lyricsSource,
          title: lyricsSource.title,
          artist: lyricsSource.artist,
          album: lyricsSource.album,
        }),
        clearTranslations: true,
        clearFurigana: true,
        clearSoramimi: true,
        clearLyrics: true,
      },
      { username, isAuthenticated }
    );
    console.log(`[iPod Store] Saved lyrics source for ${trackId}, cleared translations/furigana (by ${data.createdBy || username})`);
  } catch (error) {
    if (error instanceof ApiRequestError) {
      if (error.status === 401) {
        console.warn(`[iPod Store] Unauthorized - user must be logged in to save lyrics source`);
        return;
      }
      if (error.status === 403) {
        console.log(`[iPod Store] Cannot save lyrics source for ${trackId} - song owned by another user`);
        return;
      }
      console.warn(`[iPod Store] Failed to save lyrics source for ${trackId}: ${error.status}`);
      return;
    }
    console.error(`[iPod Store] Error saving lyrics source for ${trackId}:`, error);
  }
}

export function createServerSyncSlice(set: IpodSet, get: IpodGet) {
  return {
    syncLibrary: async () => {
      try {
        // Force refresh to get latest tracks from server (bypass cache)
        const { tracks: serverTracks, version: serverVersion } =
          await loadDefaultTracks(true);
        const current = get();
        const wasEmpty = current.tracks.length === 0;

        // Create a map of server tracks by ID for efficient lookup
        const serverTrackMap = new Map(
          serverTracks.map((track) => [track.id, track])
        );

        let newTracksAdded = 0;
        let tracksUpdated = 0;

        // Process existing tracks: merge server timestamps + metadata when on server
        const updatedTracks = current.tracks.map((currentTrack) => {
          const serverTrack = serverTrackMap.get(currentTrack.id);
          if (serverTrack) {
            const hasMetadataChanges = hasLibraryTrackMetadataChanges(
              currentTrack,
              serverTrack
            );
            const shouldUpdateLyricsSource = shouldUpdateTrackLyricsSource(
              currentTrack,
              serverTrack
            );

            const mergedCreatedAt = Math.max(
              currentTrack.createdAt ?? 0,
              serverTrack.createdAt ?? 0
            );
            const mergedUpdatedAt = Math.max(
              currentTrack.updatedAt ?? 0,
              serverTrack.updatedAt ?? 0
            );
            const mergedBase = {
              ...currentTrack,
              createdAt: mergedCreatedAt || undefined,
              updatedAt: mergedUpdatedAt || undefined,
              importOrder: serverTrack.importOrder ?? currentTrack.importOrder,
            };

            if (hasMetadataChanges || shouldUpdateLyricsSource) {
              tracksUpdated++;
              return {
                ...mergedBase,
                title: serverTrack.title,
                artist: serverTrack.artist,
                album: serverTrack.album,
                cover: serverTrack.cover,
                coverColor: resolveSyncedCoverColor(
                  currentTrack,
                  serverTrack
                ),
                url: serverTrack.url,
                lyricOffset: serverTrack.lyricOffset,
                ...(shouldUpdateLyricsSource && {
                  lyricsSource: serverTrack.lyricsSource,
                }),
              };
            }
            return mergedBase;
          }
          return currentTrack;
        });

        // Find tracks that are on the server but not in the user's library
        const existingIds = new Set(current.tracks.map((track) => track.id));
        const tracksToAdd = serverTracks.filter(
          (track) => !existingIds.has(track.id)
        );
        newTracksAdded = tracksToAdd.length;

        // Union then sort like GET /api/songs (newest first, then importOrder)
        let finalTracks = sortTracksLikeServerOrder([
          ...tracksToAdd,
          ...updatedTracks,
        ]);

        // Fetch metadata for tracks not in the default library
        // These are user-added tracks that might have updated metadata in Redis
        const tracksNotInDefaultLibrary = finalTracks.filter(
          (track) => !serverTrackMap.has(track.id)
        );

        if (tracksNotInDefaultLibrary.length > 0) {
          console.log(`[iPod Store] Fetching metadata for ${tracksNotInDefaultLibrary.length} tracks not in default library`);
          
          try {
            // Batch fetch metadata for tracks not in default library
            type FetchedSongMetadata = {
              id: string;
              title?: string;
              artist?: string;
              album?: string;
              cover?: string;
              coverColor?: string;
              lyricOffset?: number;
              lyricsSource?: LyricsSource;
              createdAt?: number;
              importOrder?: number;
              updatedAt?: number;
            };
            const data = await listSongs<FetchedSongMetadata>({
              include: "metadata",
              ids: tracksNotInDefaultLibrary.map((t) => t.id),
            });
            const fetchedSongs = data.songs || [];
            const fetchedMap = new Map<string, FetchedSongMetadata>(
              fetchedSongs.map((s: FetchedSongMetadata) => [s.id, s])
            );

            // Update tracks with fetched metadata
            finalTracks = finalTracks.map((track) => {
              const fetched = fetchedMap.get(track.id);
              if (fetched) {
                const shouldUpdateLyricsSource = shouldUpdateTrackLyricsSource(
                  track,
                  fetched
                );
                const hasChanges = hasFetchedTrackMetadataChanges(track, fetched);

                if (hasChanges) {
                  tracksUpdated++;
                  return {
                    ...track,
                    // Update with server metadata, preserving existing values if server doesn't have them
                    title: fetched.title || track.title,
                    artist: fetched.artist ?? track.artist,
                    album: fetched.album ?? track.album,
                    cover: fetched.cover ?? track.cover,
                    coverColor: resolveSyncedCoverColor(track, fetched),
                    lyricOffset: fetched.lyricOffset ?? track.lyricOffset,
                    createdAt: Math.max(
                      track.createdAt ?? 0,
                      fetched.createdAt ?? 0
                    ) || undefined,
                    importOrder: fetched.importOrder ?? track.importOrder,
                    updatedAt: Math.max(
                      track.updatedAt ?? 0,
                      fetched.updatedAt ?? 0
                    ) || undefined,
                    // Update lyricsSource from server if it's new or different
                    ...(shouldUpdateLyricsSource && {
                      lyricsSource: fetched.lyricsSource,
                    }),
                  };
                }
              }
              const mergedCreated = Math.max(
                track.createdAt ?? 0,
                fetched?.createdAt ?? 0
              );
              const mergedUpdated = Math.max(
                track.updatedAt ?? 0,
                fetched?.updatedAt ?? 0
              );
              return {
                ...track,
                createdAt: mergedCreated || undefined,
                importOrder: fetched?.importOrder ?? track.importOrder,
                updatedAt: mergedUpdated || undefined,
              };
            });
          } catch (error) {
            console.warn(`[iPod Store] Failed to fetch metadata for user tracks:`, error);
          }
        }

        finalTracks = sortTracksLikeServerOrder(finalTracks);

        const orderChanged =
          finalTracks.length !== current.tracks.length ||
          finalTracks.some((t, i) => t.id !== current.tracks[i]?.id);

        // Update store if there were any changes
        if (newTracksAdded > 0 || tracksUpdated > 0 || orderChanged) {
          const nextCurrentSongId =
            wasEmpty && finalTracks.length > 0
              ? finalTracks[0]?.id ?? null
              : current.currentSongId;
          const isSameTrack = nextCurrentSongId === current.currentSongId;
          set({
            tracks: finalTracks,
            lastKnownVersion: serverVersion,
            libraryState: "loaded",
            // If library was empty and we added tracks, set first song as current
            currentSongId: nextCurrentSongId,
            currentLyrics: isSameTrack ? current.currentLyrics : null,
            currentFuriganaMap: isSameTrack ? current.currentFuriganaMap : null,
            // Reset playing state if we're setting a new current track
            isPlaying:
              wasEmpty && finalTracks.length > 0 ? false : current.isPlaying,
          });
        } else {
          // Even if no changes, update the version and state
          set({
            lastKnownVersion: serverVersion,
            libraryState: "loaded",
          });
        }

        return {
          newTracksAdded,
          tracksUpdated,
          totalTracks: finalTracks.length,
        };
      } catch (error) {
        console.error("Error syncing library:", error);
        throw error;
      }
    },
    setTrackLyricsSource: (trackId, lyricsSource) => {
      set((state) => {
        const tracks = state.tracks.map((track) =>
          track.id === trackId
            ? {
                ...track,
                lyricsSource: lyricsSource || undefined,
                // Update track metadata from lyricsSource (KuGou has more accurate metadata)
                ...(lyricsSource && {
                  title: lyricsSource.title,
                  artist: lyricsSource.artist,
                  album: lyricsSource.album || track.album,
                }),
              }
            : track
        );
        return { tracks };
      });
      
      // Save to server and clear translations/furigana
      saveLyricsSourceToServer(trackId, lyricsSource);
    },
    clearTrackLyricsSource: (trackId) => {
      set((state) => {
        const tracks = state.tracks.map((track) =>
          track.id === trackId
            ? {
                ...track,
                lyricsSource: undefined,
              }
            : track
        );
        return { tracks };
      });
      
      // Save to server (clearing the source) and clear translations/furigana
      saveLyricsSourceToServer(trackId, null);
    },
  };
}
