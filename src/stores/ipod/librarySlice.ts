import { getCachedSongMetadata } from "@/utils/songMetadataCache";
import {
  fetchSongLyrics,
  listSongs,
} from "@/api/songs";
import {
  fetchYouTubeOembed,
  parseYouTubeTitle,
} from "@/utils/youtubeMetadata";
import { parseYouTubeVideoId } from "@/utils/youtubeUrl";
import { sortTracksLikeServerOrder } from "@/stores/ipodTrackOrder";
import {
  hasFetchedTrackMetadataChanges,
  hasLibraryTrackMetadataChanges,
  resolveSyncedCoverColor,
  shouldUpdateTrackLyricsSource,
} from "@/stores/ipodTrackMetadataSync";
import {
  saveAppleMusicLibrary,
  saveAppleMusicPlaylistTracks,
  saveAppleMusicTrackCollection,
} from "@/utils/appleMusicLibraryCache";
import type { IpodGet, IpodSet, LyricsSource, Track } from "./types";
import {
  isAppleMusicCollectionTrack,
  loadDefaultTracks,
  normalizeAppleMusicPlaybackQueue,
  parseRyosShareTrackId,
  resolveAppleMusicQueueTracks,
  updateTrackCoverColorList,
} from "./shared";
import { saveLyricsSourceToServer } from "./serverSyncSlice";

export function createLibrarySlice(set: IpodSet, get: IpodGet) {
  return {
    addTrack: (track) =>
      set((state) => ({
        tracks: [
          {
            ...track,
            createdAt: track.createdAt ?? Date.now(),
            importOrder: track.importOrder ?? 0,
            updatedAt: track.updatedAt ?? Date.now(),
          },
          ...state.tracks,
        ],
        currentSongId: track.id,
        currentLyrics: null,
        currentFuriganaMap: null,
        isPlaying: true,
        libraryState: "loaded",
        playbackHistory: [], // Clear playback history when adding new tracks
        historyPosition: -1,
      })),
    setTrackCoverColor: (trackId, coverColor) => {
      let appleMusicTracksToSave: Track[] | null = null;
      let appleMusicLoadedAt = Date.now();
      let appleMusicStorefrontId: string | null = null;
      let recentlyAddedTracksToSave:
        | { tracks: Track[]; loadedAt: number }
        | null = null;
      let favoriteTracksToSave:
        | { tracks: Track[]; loadedAt: number }
        | null = null;
      const playlistTracksToSave: {
        playlistId: string;
        tracks: Track[];
        loadedAt: number;
      }[] = [];

      set((state) => {
        const youtubeUpdate = updateTrackCoverColorList(
          state.tracks,
          trackId,
          coverColor
        );
        const appleMusicUpdate = updateTrackCoverColorList(
          state.appleMusicTracks,
          trackId,
          coverColor
        );
        const recentlyAddedUpdate = updateTrackCoverColorList(
          state.appleMusicRecentlyAddedTracks,
          trackId,
          coverColor
        );
        const favoritesUpdate = updateTrackCoverColorList(
          state.appleMusicFavoriteTracks,
          trackId,
          coverColor
        );

        let playlistTracksChanged = false;
        const nextPlaylistTracks: Record<string, Track[]> = {};
        for (const [playlistId, tracks] of Object.entries(
          state.appleMusicPlaylistTracks
        )) {
          const playlistUpdate = updateTrackCoverColorList(
            tracks,
            trackId,
            coverColor
          );
          nextPlaylistTracks[playlistId] = playlistUpdate.tracks;
          playlistTracksChanged ||= playlistUpdate.changed;
        }

        if (appleMusicUpdate.changed) {
          appleMusicTracksToSave = appleMusicUpdate.tracks.filter(
            (track) => !isAppleMusicCollectionTrack(track)
          );
          appleMusicLoadedAt = state.appleMusicLibraryLoadedAt ?? Date.now();
          appleMusicStorefrontId = state.appleMusicStorefrontId;
        }
        if (recentlyAddedUpdate.changed) {
          recentlyAddedTracksToSave = {
            tracks: recentlyAddedUpdate.tracks,
            loadedAt: state.appleMusicRecentlyAddedLoadedAt ?? Date.now(),
          };
        }
        if (favoritesUpdate.changed) {
          favoriteTracksToSave = {
            tracks: favoritesUpdate.tracks,
            loadedAt: state.appleMusicFavoriteTracksLoadedAt ?? Date.now(),
          };
        }
        if (playlistTracksChanged) {
          for (const [playlistId, tracks] of Object.entries(nextPlaylistTracks)) {
            const originalTracks = state.appleMusicPlaylistTracks[playlistId];
            if (tracks === originalTracks) continue;
            playlistTracksToSave.push({
              playlistId,
              tracks,
              loadedAt:
                state.appleMusicPlaylistTracksLoadedAt[playlistId] ?? Date.now(),
            });
          }
        }

        if (
          !youtubeUpdate.changed &&
          !appleMusicUpdate.changed &&
          !recentlyAddedUpdate.changed &&
          !favoritesUpdate.changed &&
          !playlistTracksChanged
        ) {
          return {};
        }

        return {
          tracks: youtubeUpdate.tracks,
          appleMusicTracks: appleMusicUpdate.tracks,
          appleMusicRecentlyAddedTracks: recentlyAddedUpdate.tracks,
          appleMusicFavoriteTracks: favoritesUpdate.tracks,
          ...(playlistTracksChanged && {
            appleMusicPlaylistTracks: nextPlaylistTracks,
          }),
        };
      });

      if (appleMusicTracksToSave) {
        void saveAppleMusicLibrary({
          tracks: appleMusicTracksToSave,
          loadedAt: appleMusicLoadedAt,
          storefrontId: appleMusicStorefrontId,
        });
      }
      if (recentlyAddedTracksToSave) {
        void saveAppleMusicTrackCollection("recently-added", recentlyAddedTracksToSave);
      }
      if (favoriteTracksToSave) {
        void saveAppleMusicTrackCollection("favorite-songs", favoriteTracksToSave);
      }
      for (const playlistTracks of playlistTracksToSave) {
        void saveAppleMusicPlaylistTracks(playlistTracks.playlistId, {
          tracks: playlistTracks.tracks,
          loadedAt: playlistTracks.loadedAt,
        });
      }
    },
    removeTrackById: (trackId) =>
      set((state) => {
        const idx = state.tracks.findIndex((t) => t.id === trackId);
        if (idx < 0) return {};
        const filtered = state.tracks.filter((t) => t.id !== trackId);
        let nextSongId = state.currentSongId;
        if (state.currentSongId === trackId) {
          if (filtered.length === 0) {
            nextSongId = null;
          } else {
            nextSongId = filtered[Math.min(idx, filtered.length - 1)]!.id;
          }
        }
        return {
          tracks: filtered,
          currentSongId: nextSongId,
          currentLyrics: null,
          currentFuriganaMap: null,
          isPlaying: filtered.length === 0 ? false : state.isPlaying,
          playbackHistory:
            filtered.length === 0
              ? []
              : state.playbackHistory.filter((id) => id !== trackId),
        };
      }),
    clearLibrary: () =>
      set({
        tracks: [],
        currentSongId: null,
        currentLyrics: null,
        currentFuriganaMap: null,
        isPlaying: false,
        libraryState: "cleared",
        playbackHistory: [],
        historyPosition: -1,
        elapsedTime: 0,
        totalTime: 0,
      }),
    resetLibrary: async () => {
      const { tracks, version } = await loadDefaultTracks();
      set({
        tracks,
        currentSongId: tracks[0]?.id ?? null,
        currentLyrics: null,
        currentFuriganaMap: null,
        isPlaying: false,
        libraryState: "loaded",
        lastKnownVersion: version,
        playbackHistory: [],
        historyPosition: -1,
        elapsedTime: 0,
        totalTime: 0,
      });
    },
    importLibrary: (json: string) => {
      try {
        const importedTracks = JSON.parse(json) as Track[];
        if (!Array.isArray(importedTracks)) {
          throw new Error("Invalid library format");
        }
        // Validate each track has required fields
        for (const track of importedTracks) {
          if (!track.id || !track.url || !track.title) {
            throw new Error("Invalid track format");
          }
        }
        set({
          tracks: importedTracks,
          currentSongId: importedTracks[0]?.id ?? null,
          currentLyrics: null,
          currentFuriganaMap: null,
          isPlaying: false,
          libraryState: "loaded",
          playbackHistory: [], // Clear playback history when importing library
          historyPosition: -1,
        });
      } catch (error) {
        console.error("Failed to import library:", error);
        throw error;
      }
    },
    exportLibrary: () => {
      const { tracks } = get();
      return JSON.stringify(tracks, null, 2);
    },
    initializeLibrary: async () => {
      const current = get();
      // Only initialize if the library is in uninitialized state
      if (current.libraryState === "uninitialized") {
        const { tracks, version } = await loadDefaultTracks();
        set({
          tracks,
          currentSongId: tracks[0]?.id ?? null,
          currentLyrics: null,
          currentFuriganaMap: null,
          libraryState: "loaded",
          lastKnownVersion: version,
          playbackHistory: [], // Clear playback history when initializing library
          historyPosition: -1,
        });
      }
    },
    addTrackFromVideoId: async (urlOrId: string, autoPlay: boolean = true): Promise<Track | null> => {
      const videoId =
        parseRyosShareTrackId(urlOrId) ??
        parseYouTubeVideoId(urlOrId);
      if (!videoId) {
        throw new Error("Invalid YouTube URL or video ID");
      }

      // Check if track already exists in library - skip fetching metadata if so
      const existingTrack = get().tracks.find((track) => track.id === videoId);
      if (existingTrack) {
        console.log(`[iPod Store] Track ${videoId} already exists in library, skipping metadata fetch`);
        // Set as current track and optionally autoplay
        const currentState = get();
        const isSameTrack = currentState.currentSongId === videoId;
        set({
          currentSongId: videoId,
          currentLyrics: isSameTrack ? currentState.currentLyrics : null,
          currentFuriganaMap: isSameTrack
            ? currentState.currentFuriganaMap
            : null,
          isPlaying: autoPlay,
        });
        return existingTrack;
      }

      const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

      // Check song metadata cache first before fetching from external APIs
      try {
        const cachedMetadata = await getCachedSongMetadata(videoId);
        if (cachedMetadata) {
          console.log(`[iPod Store] Using cached metadata for ${videoId}`);
          const newTrack: Track = {
            id: videoId,
            url: youtubeUrl,
            title: cachedMetadata.title,
            artist: cachedMetadata.artist,
            album: cachedMetadata.album,
            cover: cachedMetadata.cover,
            coverColor: cachedMetadata.coverColor,
            lyricOffset: cachedMetadata.lyricOffset ?? 500,
            lyricsSource: cachedMetadata.lyricsSource,
            createdAt: cachedMetadata.createdAt,
            importOrder: cachedMetadata.importOrder,
            updatedAt: cachedMetadata.updatedAt,
          };

          try {
            get().addTrack(newTrack);
            if (!autoPlay) {
              set({ isPlaying: false });
            }
            return newTrack;
          } catch (error) {
            console.error("Error adding track from cache to store:", error);
            return null;
          }
        }
      } catch (error) {
        console.warn(`[iPod Store] Failed to check song metadata cache for ${videoId}, falling back to API:`, error);
      }

      // Cache miss - fetch metadata from external APIs
      let rawTitle = `Video ID: ${videoId}`; // Default title
      let authorName: string | undefined = undefined; // Store author_name

      try {
        const oembed = await fetchYouTubeOembed(videoId);
        if (oembed.ok) {
          rawTitle = oembed.rawTitle || rawTitle;
          authorName = oembed.authorName; // Extract author_name
        } else {
          throw new Error(
            `Failed to fetch video info (${oembed.status}). Please check the YouTube URL.`
          );
        }
      } catch (error) {
        console.error(`Error fetching oEmbed data for ${urlOrId}:`, error);
        throw error; // Re-throw to be handled by caller
      }

      const trackInfo = {
        title: rawTitle,
        artist: undefined as string | undefined,
        album: undefined as string | undefined,
        cover: undefined as string | undefined,
        coverColor: undefined as string | undefined,
        lyricsSource: undefined as {
          hash: string;
          albumId: string | number;
          title: string;
          artist: string;
          album?: string;
        } | undefined,
      };

      // Single call to fetch-lyrics with returnMetadata: searches Kugou, fetches lyrics+cover, returns metadata
      // This consolidates search + fetch into one call
      try {
        const fetchData = await fetchSongLyrics(videoId, {
          title: rawTitle,
          returnMetadata: true,
          retry: { maxAttempts: 1, initialDelayMs: 250 },
        });

        // Use metadata from server (Kugou source) if available
        if (fetchData.metadata?.lyricsSource) {
          const meta = fetchData.metadata;
          console.log(`[iPod Store] Got metadata from Kugou for ${videoId}:`, {
            title: meta.title,
            artist: meta.artist,
            cover: meta.cover,
          });
          
          trackInfo.title = meta.title || trackInfo.title;
          trackInfo.artist = meta.artist;
          trackInfo.album = meta.album;
          trackInfo.cover = meta.cover;
          trackInfo.coverColor = meta.coverColor;
          trackInfo.lyricsSource = meta.lyricsSource;
        }
      } catch (error) {
        console.warn(`[iPod Store] Failed to fetch lyrics for ${videoId}:`, error);
      }

      // If no Kugou match found (no lyricsSource), fall back to AI title parsing
      if (!trackInfo.lyricsSource) {
        console.log(`[iPod Store] No Kugou match for ${videoId}, falling back to AI parse`);
        const parsed = await parseYouTubeTitle(rawTitle, authorName);
        trackInfo.title = parsed.title;
        trackInfo.artist = parsed.artist;
        trackInfo.album = parsed.album;
      }

      const newTrack: Track = {
        id: videoId,
        url: youtubeUrl,
        title: trackInfo.title,
        artist: trackInfo.artist,
        album: trackInfo.album,
        cover: trackInfo.cover,
        coverColor: trackInfo.coverColor,
        lyricOffset: 500, // Default 500ms offset for new tracks
        lyricsSource: trackInfo.lyricsSource,
      };

      try {
        get().addTrack(newTrack); // Add track to the store
        // If autoPlay is false (e.g., for iOS), pause after adding
        if (!autoPlay) {
          set({ isPlaying: false });
        }
        return newTrack;
      } catch (error) {
        console.error("Error adding track to store:", error);
        return null;
      }
    },
    // -----------------------------------------------------------------
    // Apple Music actions
    // -----------------------------------------------------------------
    setLibrarySource: (source) => {
      if (get().librarySource === source) return;
      // Pause and reset transient playback state so the YouTube /
      // Apple Music players don't fight for the audio element when
      // we hot-swap libraries.
      set({
        librarySource: source,
        isPlaying: false,
        elapsedTime: 0,
        totalTime: 0,
        currentLyrics: null,
        currentFuriganaMap: null,
        appleMusicKitNowPlaying: null,
      });
    },
    setAppleMusicTracks: (tracks) => {
      const loadedAt = Date.now();
      let storefrontIdAtSave: string | null = null;
      let tracksToSave = tracks;
      set((state) => {
        const incomingIds = new Set(tracks.map((track) => track.id));
        const previousTracksById = new Map(
          state.appleMusicTracks.map((track) => [track.id, track] as const)
        );
        const retainedQueueTracks = (
          normalizeAppleMusicPlaybackQueue(state.appleMusicPlaybackQueue) ?? []
        ).reduce<Track[]>((acc, id) => {
          const track = previousTracksById.get(id);
          if (track !== undefined && !incomingIds.has(track.id)) {
            acc.push(track);
          }
          return acc;
        }, []);
        const currentTrack =
          state.appleMusicCurrentSongId &&
          !incomingIds.has(state.appleMusicCurrentSongId)
            ? previousTracksById.get(state.appleMusicCurrentSongId)
            : null;
        const retainedTracksById = new Map<string, Track>();
        for (const track of retainedQueueTracks) {
          retainedTracksById.set(track.id, track);
        }
        if (currentTrack) {
          retainedTracksById.set(currentTrack.id, currentTrack);
        }
        const nextTracks = [...tracks, ...retainedTracksById.values()];
        const validIds = new Set(nextTracks.map((track) => track.id));
        const stillValidCurrent =
          state.appleMusicCurrentSongId &&
          validIds.has(state.appleMusicCurrentSongId)
            ? state.appleMusicCurrentSongId
            : nextTracks[0]?.id ?? null;
        storefrontIdAtSave = state.appleMusicStorefrontId;
        tracksToSave = nextTracks;
        return {
          appleMusicTracks: nextTracks,
          appleMusicCurrentSongId: stillValidCurrent,
          appleMusicLibraryLoadedAt: loadedAt,
          appleMusicLibraryLoading: false,
          appleMusicLibraryError: null,
        };
      });
      tracksToSave = tracksToSave.filter(
        (track) => !isAppleMusicCollectionTrack(track)
      );
      // Persist to IndexedDB so the next mount can re-hydrate without
      // a network round-trip. Fire-and-forget — failures are logged
      // by the cache helper and the in-memory copy still works.
      void saveAppleMusicLibrary({
        tracks: tracksToSave,
        loadedAt,
        storefrontId: storefrontIdAtSave,
      });
    },
    setAppleMusicPlaylists: (playlists, loadedAt) =>
      set((state) => {
        const activeIds = new Set(playlists.map((playlist) => playlist.id));
        const nextPlaylistTracks: Record<string, Track[]> = {};
        const nextPlaylistTracksLoadedAt: Record<string, number> = {};
        const nextPlaylistTracksLoading: Record<string, boolean> = {};
        for (const [playlistId, tracks] of Object.entries(
          state.appleMusicPlaylistTracks
        )) {
          if (!activeIds.has(playlistId)) continue;
          nextPlaylistTracks[playlistId] = tracks;
          const cachedLoadedAt = state.appleMusicPlaylistTracksLoadedAt[playlistId];
          if (typeof cachedLoadedAt === "number") {
            nextPlaylistTracksLoadedAt[playlistId] = cachedLoadedAt;
          }
          if (state.appleMusicPlaylistTracksLoading[playlistId]) {
            nextPlaylistTracksLoading[playlistId] = true;
          }
        }
        return {
          appleMusicPlaylists: playlists,
          // `null` is reserved for "never synced". When the caller doesn't
          // pass a timestamp, treat this as a fresh sync (default behavior
          // for opportunistic / foreground refresh paths).
          appleMusicPlaylistsLoadedAt:
            loadedAt === undefined ? Date.now() : loadedAt,
          // Keep only tracks for playlists that still exist on the server.
          appleMusicPlaylistTracks: nextPlaylistTracks,
          appleMusicPlaylistTracksLoadedAt: nextPlaylistTracksLoadedAt,
          appleMusicPlaylistTracksLoading: nextPlaylistTracksLoading,
        };
      }),
    setAppleMusicPlaylistTracks: (playlistId, tracks) =>
      set((state) => ({
        appleMusicPlaylistTracks: {
          ...state.appleMusicPlaylistTracks,
          [playlistId]: tracks,
        },
        appleMusicPlaylistTracksLoadedAt: {
          ...state.appleMusicPlaylistTracksLoadedAt,
          [playlistId]: Date.now(),
        },
        appleMusicPlaylistTracksLoading: {
          ...state.appleMusicPlaylistTracksLoading,
          [playlistId]: false,
        },
      })),
    setAppleMusicPlaylistTracksLoading: (playlistId, loading) =>
      set((state) => ({
        appleMusicPlaylistTracksLoading: {
          ...state.appleMusicPlaylistTracksLoading,
          [playlistId]: loading,
        },
      })),
    setAppleMusicRecentlyAddedTracks: (tracks, loadedAt) =>
      set({
        appleMusicRecentlyAddedTracks: tracks,
        appleMusicRecentlyAddedLoadedAt:
          loadedAt === undefined ? Date.now() : loadedAt,
        appleMusicRecentlyAddedLoading: false,
      }),
    setAppleMusicRecentlyAddedLoading: (loading) =>
      set({ appleMusicRecentlyAddedLoading: loading }),
    setAppleMusicFavoriteTracks: (tracks, loadedAt) =>
      set({
        appleMusicFavoriteTracks: tracks,
        appleMusicFavoriteTracksLoadedAt:
          loadedAt === undefined ? Date.now() : loadedAt,
        appleMusicFavoritesLoading: false,
      }),
    setAppleMusicFavoritesLoading: (loading) =>
      set({ appleMusicFavoritesLoading: loading }),
    setAppleMusicPlaylistsLoading: (loading) =>
      set({ appleMusicPlaylistsLoading: loading }),
    prependAppleMusicFavoriteTrack: (track) =>
      set((state) => ({
        appleMusicFavoriteTracks: [
          track,
          ...state.appleMusicFavoriteTracks.filter((t) => t.id !== track.id),
        ],
      })),
    setAppleMusicLibraryLoading: (loading) =>
      set({ appleMusicLibraryLoading: loading }),
    setAppleMusicLibraryError: (error) =>
      set({
        appleMusicLibraryError: error,
        appleMusicLibraryLoading: false,
      }),
    setAppleMusicCurrentSongId: (songId) =>
      set((state) => {
        if (state.appleMusicCurrentSongId === songId) return {};
        // Reset transient progress + lyrics whenever the active track changes.
        return {
          appleMusicCurrentSongId: songId,
          appleMusicKitNowPlaying: null,
          currentLyrics: null,
          currentFuriganaMap: null,
          elapsedTime: 0,
          totalTime: 0,
        };
      }),
    setAppleMusicPlaybackQueue: (queue) =>
      set({
        appleMusicPlaybackQueue: normalizeAppleMusicPlaybackQueue(queue),
      }),
    appleMusicNextTrack: () =>
      set((state) => {
        // Resolve the active queue: when a contextual queue is set
        // (e.g. user opened an Artist / Album / Playlist and tapped a
        // song), step through that ordered list. Otherwise fall back
        // to the full library so behaviour matches the old menu flow.
        const queueTracks = resolveAppleMusicQueueTracks(state);

        if (queueTracks.length === 0) {
          return {
            appleMusicCurrentSongId: null,
            currentLyrics: null,
            currentFuriganaMap: null,
          };
        }

        let nextSongId: string | null;

        if (state.loopCurrent) {
          nextSongId = state.appleMusicCurrentSongId;
        } else if (state.isShuffled) {
          // Lightweight shuffle — avoid the current track when possible.
          const others = queueTracks.filter(
            (t) => t.id !== state.appleMusicCurrentSongId
          );
          const pool = others.length > 0 ? others : queueTracks;
          nextSongId = pool[Math.floor(Math.random() * pool.length)]?.id ?? null;
        } else {
          const currentIndex = queueTracks.findIndex(
            (t) => t.id === state.appleMusicCurrentSongId
          );
          const nextIndex =
            currentIndex === -1
              ? 0
              : (currentIndex + 1) % queueTracks.length;
          if (!state.loopAll && nextIndex === 0 && currentIndex !== -1) {
            const lastSongId =
              queueTracks[queueTracks.length - 1]?.id ?? null;
            const isSameTrack = lastSongId === state.appleMusicCurrentSongId;
            return {
              appleMusicCurrentSongId: lastSongId,
              isPlaying: false,
              ...(isSameTrack ? {} : { elapsedTime: 0, totalTime: 0 }),
            };
          }
          nextSongId = queueTracks[nextIndex]?.id ?? null;
        }

        const isSameTrack = nextSongId === state.appleMusicCurrentSongId;
        return {
          appleMusicCurrentSongId: nextSongId,
          currentLyrics: isSameTrack ? state.currentLyrics : null,
          currentFuriganaMap: isSameTrack ? state.currentFuriganaMap : null,
          isPlaying: true,
          // Reset playback position so the new track starts at 0 instead
          // of inheriting the previous track's elapsedTime — otherwise the
          // AppleMusicPlayerBridge resumes the new song from the previous
          // song's current time (visible as a mid-song start in Apple
          // Music mode).
          ...(isSameTrack ? {} : { elapsedTime: 0, totalTime: 0 }),
        };
      }),
    appleMusicPreviousTrack: () =>
      set((state) => {
        const queueTracks = resolveAppleMusicQueueTracks(state);

        if (queueTracks.length === 0) {
          return {
            appleMusicCurrentSongId: null,
            currentLyrics: null,
            currentFuriganaMap: null,
          };
        }

        let prevSongId: string | null;

        if (state.isShuffled) {
          const others = queueTracks.filter(
            (t) => t.id !== state.appleMusicCurrentSongId
          );
          const pool = others.length > 0 ? others : queueTracks;
          prevSongId = pool[Math.floor(Math.random() * pool.length)]?.id ?? null;
        } else {
          const currentIndex = queueTracks.findIndex(
            (t) => t.id === state.appleMusicCurrentSongId
          );
          const prevIndex =
            currentIndex <= 0 ? queueTracks.length - 1 : currentIndex - 1;
          prevSongId = queueTracks[prevIndex]?.id ?? null;
        }

        const isSameTrack = prevSongId === state.appleMusicCurrentSongId;
        return {
          appleMusicCurrentSongId: prevSongId,
          currentLyrics: isSameTrack ? state.currentLyrics : null,
          currentFuriganaMap: isSameTrack ? state.currentFuriganaMap : null,
          isPlaying: true,
          // Reset playback position so the new track starts at 0 instead
          // of inheriting the previous track's elapsedTime.
          ...(isSameTrack ? {} : { elapsedTime: 0, totalTime: 0 }),
        };
      }),
    setAppleMusicStorefrontId: (storefrontId) =>
      set({ appleMusicStorefrontId: storefrontId }),
    setAppleMusicKitNowPlaying: (snapshot) =>
      set({ appleMusicKitNowPlaying: snapshot }),
    setIpodMenuBreadcrumb: (breadcrumb) =>
      set({ ipodMenuBreadcrumb: breadcrumb }),
    setIpodMenuMode: (menuMode) => set({ ipodMenuMode: menuMode }),
  };
}
