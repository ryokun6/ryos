/**
 * Unified Media Control Tool Handler (MediaCore Phase 5)
 *
 * One client-side handler for the `mediaControl` tool. Dispatches on
 * `target` ("music" = iPod, "karaoke", "videos", "tv") and runs the shared
 * transport actions (toggle/play/pause/playKnown/addAndPlay/next/previous)
 * against a per-target adapter, so the playback flow, iOS autoplay guard,
 * and result messages are implemented exactly once.
 *
 * TV channel-management actions live in `mediaTvChannels.ts`.
 */

import { useAppStore } from "@/stores/useAppStore";
import {
  getActiveIpodCurrentTrack,
  getActiveIpodTracks,
  navigateActiveIpodTrack,
  setActiveIpodCurrentSongId,
  useIpodStore,
} from "@/stores/useIpodStore";
import { useKaraokeStore } from "@/stores/useKaraokeStore";
import { useVideoStore, type Video } from "@/stores/useVideoStore";
import { useTvStore } from "@/stores/useTvStore";
import { buildTvChannelLineup } from "@/apps/tv/data/channels";
import { parseYouTubeVideoId } from "@/utils/youtubeUrl";
import {
  fetchYouTubeOembed,
  parseYouTubeTitle,
} from "@/utils/youtubeMetadata";
import i18n from "@/lib/i18n";
import type { AppId } from "@/config/appIds";
import type { ToolContext } from "./types";
import {
  ciIncludes,
  formatTrackDescription,
  buildResultMessage,
  shouldDisableTranslation,
  getLanguageName,
  isIOSDevice,
} from "./helpers";
import {
  normalizeSearchText,
  computeMatchScore,
  deriveScoreThreshold,
} from "@/apps/chats/utils/fuzzySearch";
import {
  handleTvChannelAction,
  type TvChannelAction,
} from "./mediaTvChannels";
import { createClientLogger } from "@/utils/logger";
import { computeSequentialNavigation } from "@/shared/media/transport";

const log = createClientLogger("ChatTools");

export type MediaControlTarget = "music" | "karaoke" | "videos" | "tv";

export type MediaTransportAction =
  | "toggle"
  | "play"
  | "pause"
  | "playKnown"
  | "addAndPlay"
  | "next"
  | "previous";

export interface MediaControlInput {
  target?: MediaControlTarget;
  action?: MediaTransportAction | TvChannelAction;
  id?: string;
  title?: string;
  artist?: string;
  enableTranslation?: string | null;
  enableFullscreen?: boolean;
  enableVideo?: boolean;
  // TV channel-action params (target "tv" only)
  channelId?: string;
  channelNumber?: number;
  prompt?: string;
  name?: string;
  videoId?: string;
  url?: string;
  removeVideoId?: string;
}

interface MediaItemRef {
  id: string;
  title: string;
  artist?: string;
}

type AddAndPlayResult =
  | { ok: true; title: string }
  | { ok: false; error: string };

/**
 * Everything the generic transport flow needs to know about one target app.
 */
interface PlaybackTargetAdapter {
  appId: AppId;
  getCurrentItem(): MediaItemRef | null;
  isPlaybackRequested(): boolean;
  setIsPlaying(playing: boolean): void;
  togglePlay(): void;
  /** Apply target-specific flags; returns human-readable state changes. */
  applySettings(input: MediaControlInput): string[];
  messages: {
    ready: () => string;
    playingTrack: (trackDesc: string) => string;
    pausedTrack: (trackDesc: string) => string;
    playing: () => string;
    paused: () => string;
  };
}

interface TransportTargetAdapter extends PlaybackTargetAdapter {
  getItems(): MediaItemRef[];
  /** Select an item by id without starting playback. */
  selectItem(id: string): void;
  navigate(direction: "next" | "previous"): void;
  /** Candidate item indices for playKnown, preserving legacy match rules. */
  matchItems(
    items: MediaItemRef[],
    query: { id?: string; title?: string; artist?: string }
  ): number[];
  addAndPlay(id: string, isIOS: boolean): Promise<AddAndPlayResult>;
  messages: PlaybackTargetAdapter["messages"] & {
    selected: (trackDesc: string) => string;
    notFound: () => string;
    skippedTo: (trackDesc: string) => string;
    wentBackTo: (trackDesc: string) => string;
    skippedToNext: () => string;
    wentBackToPrevious: () => string;
    added: (title: string) => string;
    addedAndPlaying: (title: string) => string;
  };
}

// ============================================================================
// Shared matchers
// ============================================================================

/**
 * iPod-style matching: AND-match title/artist over id-filtered items, with a
 * swapped title↔artist fallback.
 */
const matchItemsSimple = (
  items: MediaItemRef[],
  query: { id?: string; title?: string; artist?: string }
): number[] => {
  const { id, title, artist } = query;
  const allWithIndices = items.map((item, index) => ({ item, index }));

  const idFiltered = id
    ? allWithIndices.filter(({ item }) => item.id === id)
    : allWithIndices;

  const primary = idFiltered.filter(({ item }) => {
    const titleMatches = title ? ciIncludes(item.title, title) : true;
    const artistMatches = artist ? ciIncludes(item.artist, artist) : true;
    return titleMatches && artistMatches;
  });

  if (primary.length > 0) {
    return primary.map(({ index }) => index);
  }

  if (title || artist) {
    // Swapped matching (title in artist field, etc.)
    const secondary = idFiltered.filter(({ item }) => {
      const titleInArtist = title ? ciIncludes(item.artist, title) : false;
      const artistInTitle = artist ? ciIncludes(item.title, artist) : false;
      if (title && artist) return titleInArtist || artistInTitle;
      if (title) return titleInArtist;
      if (artist) return artistInTitle;
      return false;
    });
    return secondary.map(({ index }) => index);
  }

  return [];
};

/**
 * Karaoke-style matching: exact id → fuzzy title scoring → artist substring.
 */
const matchItemsFuzzy = (
  items: MediaItemRef[],
  query: { id?: string; title?: string; artist?: string }
): number[] => {
  const { id, title, artist } = query;

  let candidateIndices: number[] = [];
  if (id) {
    candidateIndices = items.reduce<number[]>((acc, item, index) => {
      if (item.id === id) acc.push(index);
      return acc;
    }, []);
  }

  if (candidateIndices.length === 0 && title) {
    const normalizedQuery = normalizeSearchText(title);
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    const threshold = deriveScoreThreshold(normalizedQuery.length);

    const scored = items.map((item, index) => {
      const normalizedTitle = normalizeSearchText(item.title ?? "");
      const normalizedArtist = normalizeSearchText(item.artist ?? "");
      const combined = `${normalizedTitle} ${normalizedArtist}`.trim();
      const score = computeMatchScore(combined, normalizedQuery, tokens);
      return { index, score };
    });

    const validMatches = scored.filter((t) => t.score >= threshold);
    const maxScore = Math.max(...validMatches.map((m) => m.score), 0);
    candidateIndices = validMatches.reduce<number[]>((acc, match) => {
      if (match.score === maxScore) acc.push(match.index);
      return acc;
    }, []);
  }

  if (candidateIndices.length === 0 && artist) {
    candidateIndices = items.reduce<number[]>((acc, item, index) => {
      if (ciIncludes(item.artist, artist)) acc.push(index);
      return acc;
    }, []);
  }

  return candidateIndices;
};

// ============================================================================
// Target adapters
// ============================================================================

const applyLyricsTranslation = (
  enableTranslation: string | null | undefined,
  stateChanges: string[]
): void => {
  if (enableTranslation === undefined) return;
  const ipod = useIpodStore.getState();
  if (shouldDisableTranslation(enableTranslation)) {
    ipod.setLyricsTranslationLanguage(null);
    stateChanges.push(
      i18n.t("apps.chats.toolCalls.ipodTurnedOffLyricsTranslation")
    );
    log.debug("Lyrics translation disabled");
  } else if (enableTranslation) {
    ipod.setLyricsTranslationLanguage(enableTranslation);
    const langName = getLanguageName(enableTranslation);
    stateChanges.push(
      i18n.t("apps.chats.toolCalls.ipodTranslatedLyricsTo", { langName })
    );
    log.debug("Lyrics translation enabled", { language: enableTranslation });
  }
};

const musicAdapter: TransportTargetAdapter = {
  appId: "ipod",
  getItems: () => getActiveIpodTracks(useIpodStore.getState()),
  getCurrentItem: () => getActiveIpodCurrentTrack(useIpodStore.getState()),
  isPlaybackRequested: () => useIpodStore.getState().playbackRequested,
  setIsPlaying: (playing) => useIpodStore.getState().setIsPlaying(playing),
  togglePlay: () => useIpodStore.getState().togglePlay(),
  selectItem: (id) =>
    setActiveIpodCurrentSongId(useIpodStore.getState(), id),
  navigate: (direction) =>
    navigateActiveIpodTrack(useIpodStore.getState(), direction),
  matchItems: matchItemsSimple,
  addAndPlay: async (id, isIOS) => {
    if (id.startsWith("am:")) {
      return {
        ok: false,
        error:
          "Apple Music tracks are already in the active library. Use playKnown with the Apple Music track ID instead of addAndPlay.",
      };
    }
    const ipodState = useIpodStore.getState();
    if (ipodState.librarySource !== "youtube") {
      ipodState.setLibrarySource("youtube");
    }
    try {
      // On iOS, add without autoplay.
      const addedTrack = await useIpodStore
        .getState()
        .addTrackFromVideoId(id, !isIOS);
      if (!addedTrack) {
        return {
          ok: false,
          error: i18n.t("apps.chats.toolCalls.ipodFailedToAdd", { id }),
        };
      }
      log.debug("Added track to iPod", {
        trackId: addedTrack.id,
        isIOS,
        autoPlayed: !isIOS,
      });
      return { ok: true, title: addedTrack.title };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`[iPod] Error adding ${id}:`, error);
      const errorMsg = errorMessage.includes("Failed to fetch video info")
        ? i18n.t("apps.chats.toolCalls.ipodCannotAdd", { id })
        : i18n.t("apps.chats.toolCalls.ipodFailedToAddWithError", {
            id,
            error: errorMessage,
          });
      return { ok: false, error: errorMsg };
    }
  },
  applySettings: (input) => {
    const ipod = useIpodStore.getState();
    const stateChanges: string[] = [];

    if (input.enableVideo !== undefined) {
      if (input.enableVideo && !ipod.showVideo) {
        ipod.setShowVideo(true);
        stateChanges.push(i18n.t("apps.chats.toolCalls.ipodTurnedOnVideo"));
        log.debug("iPod video enabled");
      } else if (!input.enableVideo && ipod.showVideo) {
        ipod.setShowVideo(false);
        stateChanges.push(i18n.t("apps.chats.toolCalls.ipodTurnedOffVideo"));
        log.debug("iPod video disabled");
      }
    }

    applyLyricsTranslation(input.enableTranslation, stateChanges);

    if (input.enableFullscreen !== undefined) {
      if (input.enableFullscreen && !ipod.isFullScreen) {
        ipod.toggleFullScreen();
        stateChanges.push(
          i18n.t("apps.chats.toolCalls.ipodTurnedOnFullScreen")
        );
        log.debug("iPod fullscreen enabled");
      } else if (!input.enableFullscreen && ipod.isFullScreen) {
        ipod.toggleFullScreen();
        stateChanges.push(
          i18n.t("apps.chats.toolCalls.ipodTurnedOffFullScreen")
        );
        log.debug("iPod fullscreen disabled");
      }
    }

    return stateChanges;
  },
  messages: {
    ready: () => i18n.t("apps.chats.toolCalls.ipodReady"),
    playingTrack: (trackDesc) =>
      i18n.t("apps.chats.toolCalls.ipodPlayingTrack", { trackDesc }),
    pausedTrack: (trackDesc) =>
      i18n.t("apps.chats.toolCalls.ipodPausedTrack", { trackDesc }),
    playing: () => i18n.t("apps.chats.toolCalls.ipodPlaying"),
    paused: () => i18n.t("apps.chats.toolCalls.ipodPaused"),
    selected: (trackDesc) =>
      i18n.t("apps.chats.toolCalls.ipodSelected", { trackDesc }),
    notFound: () => i18n.t("apps.chats.toolCalls.ipodSongNotFound"),
    skippedTo: (trackDesc) =>
      i18n.t("apps.chats.toolCalls.ipodSkippedTo", { trackDesc }),
    wentBackTo: (trackDesc) =>
      i18n.t("apps.chats.toolCalls.ipodWentBackTo", { trackDesc }),
    skippedToNext: () => i18n.t("apps.chats.toolCalls.ipodSkippedToNext"),
    wentBackToPrevious: () =>
      i18n.t("apps.chats.toolCalls.ipodWentBackToPrevious"),
    added: (title) => i18n.t("apps.chats.toolCalls.ipodAdded", { title }),
    addedAndPlaying: (title) =>
      i18n.t("apps.chats.toolCalls.ipodAddedAndPlaying", { title }),
  },
};

const karaokeAdapter: TransportTargetAdapter = {
  appId: "karaoke",
  // Karaoke always plays from the YouTube iPod library.
  getItems: () => useIpodStore.getState().tracks,
  getCurrentItem: () => {
    const karaoke = useKaraokeStore.getState();
    const ipodTracks = useIpodStore.getState().tracks;
    return (
      (karaoke.currentSongId
        ? ipodTracks.find((t) => t.id === karaoke.currentSongId)
        : ipodTracks[0]) ?? null
    );
  },
  isPlaybackRequested: () => useKaraokeStore.getState().playbackRequested,
  setIsPlaying: (playing) =>
    useKaraokeStore.getState().setIsPlaying(playing),
  togglePlay: () => useKaraokeStore.getState().togglePlay(),
  selectItem: (id) => useKaraokeStore.getState().setCurrentSongId(id),
  navigate: (direction) => {
    const karaokeState = useKaraokeStore.getState();
    const navigate =
      direction === "next" ? karaokeState.nextTrack : karaokeState.previousTrack;
    if (typeof navigate === "function") {
      navigate();
    }
  },
  matchItems: matchItemsFuzzy,
  addAndPlay: async (id, isIOS) => {
    try {
      // Add to the shared iPod library, then play it in Karaoke.
      const addedTrack = await useIpodStore
        .getState()
        .addTrackFromVideoId(id, false);
      if (!addedTrack) {
        return {
          ok: false,
          error: i18n.t("apps.chats.toolCalls.karaokeFailedToAdd", {
            id,
            defaultValue: `Failed to add ${id} to library`,
          }),
        };
      }
      const { setCurrentSongId, setIsPlaying } = useKaraokeStore.getState();
      setCurrentSongId(addedTrack.id);
      if (!isIOS) {
        setIsPlaying(true);
      }
      log.debug("Added track to Karaoke library", {
        trackId: addedTrack.id,
        isIOS,
        autoPlayed: !isIOS,
      });
      return { ok: true, title: addedTrack.title };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`[Karaoke] Error adding ${id}:`, error);
      const errorMsg = errorMessage.includes("Failed to fetch video info")
        ? i18n.t("apps.chats.toolCalls.karaokeCannotAdd", {
            id,
            defaultValue: `Cannot add ${id}: Video unavailable or invalid`,
          })
        : i18n.t("apps.chats.toolCalls.karaokeFailedToAddWithError", {
            id,
            error: errorMessage,
            defaultValue: `Failed to add ${id}: ${errorMessage}`,
          });
      return { ok: false, error: errorMsg };
    }
  },
  applySettings: (input) => {
    const karaoke = useKaraokeStore.getState();
    const stateChanges: string[] = [];

    applyLyricsTranslation(input.enableTranslation, stateChanges);

    if (input.enableFullscreen !== undefined) {
      if (input.enableFullscreen && !karaoke.isFullScreen) {
        karaoke.toggleFullScreen();
        stateChanges.push(
          i18n.t("apps.chats.toolCalls.ipodTurnedOnFullScreen")
        );
        log.debug("Karaoke fullscreen enabled");
      } else if (!input.enableFullscreen && karaoke.isFullScreen) {
        karaoke.toggleFullScreen();
        stateChanges.push(
          i18n.t("apps.chats.toolCalls.ipodTurnedOffFullScreen")
        );
        log.debug("Karaoke fullscreen disabled");
      }
    }

    return stateChanges;
  },
  messages: {
    ready: () =>
      i18n.t("apps.chats.toolCalls.karaokeReady", {
        defaultValue: "Karaoke is ready. Tap play to start",
      }),
    playingTrack: (trackDesc) =>
      i18n.t("apps.chats.toolCalls.karaokePlayingTrack", {
        trackDesc,
        defaultValue: `Karaoke is now playing ${trackDesc}`,
      }),
    pausedTrack: (trackDesc) =>
      i18n.t("apps.chats.toolCalls.karaokePausedTrack", {
        trackDesc,
        defaultValue: `Karaoke paused ${trackDesc}`,
      }),
    playing: () =>
      i18n.t("apps.chats.toolCalls.karaokePlaying", {
        defaultValue: "Karaoke is now playing",
      }),
    paused: () =>
      i18n.t("apps.chats.toolCalls.karaokePaused", {
        defaultValue: "Karaoke is now paused",
      }),
    selected: (trackDesc) =>
      i18n.t("apps.chats.toolCalls.karaokeSelected", {
        trackDesc,
        defaultValue: `Selected ${trackDesc}. Tap play to start`,
      }),
    notFound: () =>
      i18n.t("apps.chats.toolCalls.karaokeSongNotFound", {
        defaultValue: "Could not find the requested song in the library",
      }),
    skippedTo: (trackDesc) =>
      i18n.t("apps.chats.toolCalls.karaokeSkippedTo", {
        trackDesc,
        defaultValue: `Skipped to ${trackDesc}`,
      }),
    wentBackTo: (trackDesc) =>
      i18n.t("apps.chats.toolCalls.karaokeWentBackTo", {
        trackDesc,
        defaultValue: `Went back to ${trackDesc}`,
      }),
    skippedToNext: () =>
      i18n.t("apps.chats.toolCalls.karaokeSkippedToNext", {
        defaultValue: "Skipped to next track",
      }),
    wentBackToPrevious: () =>
      i18n.t("apps.chats.toolCalls.karaokeWentBackToPrevious", {
        defaultValue: "Went back to previous track",
      }),
    added: (title) =>
      i18n.t("apps.chats.toolCalls.karaokeAdded", {
        title,
        defaultValue: `Added '${title}' to library. Tap play to start in Karaoke`,
      }),
    addedAndPlaying: (title) =>
      i18n.t("apps.chats.toolCalls.karaokeAddedAndPlaying", {
        title,
        defaultValue: `Added '${title}' and started playing in Karaoke`,
      }),
  },
};

const videosAdapter: TransportTargetAdapter = {
  appId: "videos",
  getItems: () => useVideoStore.getState().videos,
  getCurrentItem: () => useVideoStore.getState().getCurrentVideo(),
  isPlaybackRequested: () => useVideoStore.getState().playbackRequested,
  setIsPlaying: (playing) => useVideoStore.getState().setIsPlaying(playing),
  togglePlay: () => useVideoStore.getState().togglePlay(),
  selectItem: (id) => useVideoStore.getState().setCurrentVideoId(id),
  navigate: (direction) => {
    const store = useVideoStore.getState();
    const decision = computeSequentialNavigation(
      store.videos,
      store.currentVideoId,
      store.loopAll,
      direction
    );
    if (decision.changed) {
      store.setCurrentVideoId(decision.itemId);
    }
    useVideoStore.getState().setIsPlaying(true);
  },
  matchItems: matchItemsSimple,
  addAndPlay: async (id, isIOS) => {
    try {
      const videoId = parseYouTubeVideoId(id);
      if (!videoId) {
        return {
          ok: false,
          error: i18n.t("apps.chats.toolCalls.videosInvalidId", {
            id,
            defaultValue: `Invalid YouTube id or URL: ${id}`,
          }),
        };
      }
      const store = useVideoStore.getState();
      const existing = store.videos.find((v) => v.id === videoId);
      if (existing) {
        store.setCurrentVideoId(existing.id);
        if (!isIOS) {
          useVideoStore.getState().setIsPlaying(true);
        }
        return { ok: true, title: existing.title };
      }

      const oembed = await fetchYouTubeOembed(videoId);
      if (!oembed.ok) {
        return {
          ok: false,
          error: i18n.t("apps.chats.toolCalls.videosCannotAdd", {
            id: videoId,
            defaultValue: `Cannot add ${videoId}: Video unavailable or invalid`,
          }),
        };
      }
      const rawTitle = oembed.rawTitle || `Video ID: ${videoId}`;
      const { title, artist } = await parseYouTubeTitle(
        rawTitle,
        oembed.authorName
      );

      const newVideo: Video = {
        id: videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title,
        artist,
      };
      store.setVideos((prev) => [...prev, newVideo]);
      useVideoStore.getState().setCurrentVideoId(videoId);
      if (!isIOS) {
        useVideoStore.getState().setIsPlaying(true);
      }
      log.debug("Added video to Videos playlist", {
        videoId,
        isIOS,
        autoPlayed: !isIOS,
      });
      return { ok: true, title };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`[Videos] Error adding ${id}:`, error);
      return {
        ok: false,
        error: i18n.t("apps.chats.toolCalls.videosFailedToAdd", {
          id,
          error: errorMessage,
          defaultValue: `Failed to add ${id}: ${errorMessage}`,
        }),
      };
    }
  },
  applySettings: () => [],
  messages: {
    ready: () =>
      i18n.t("apps.chats.toolCalls.videosReady", {
        defaultValue: "Videos is ready. Tap play to start",
      }),
    playingTrack: (trackDesc) =>
      i18n.t("apps.chats.toolCalls.videosPlayingTrack", {
        trackDesc,
        defaultValue: `Videos is now playing ${trackDesc}`,
      }),
    pausedTrack: (trackDesc) =>
      i18n.t("apps.chats.toolCalls.videosPausedTrack", {
        trackDesc,
        defaultValue: `Videos paused ${trackDesc}`,
      }),
    playing: () =>
      i18n.t("apps.chats.toolCalls.videosPlaying", {
        defaultValue: "Videos is now playing",
      }),
    paused: () =>
      i18n.t("apps.chats.toolCalls.videosPaused", {
        defaultValue: "Videos is now paused",
      }),
    selected: (trackDesc) =>
      i18n.t("apps.chats.toolCalls.videosSelected", {
        trackDesc,
        defaultValue: `Selected ${trackDesc}. Tap play to start`,
      }),
    notFound: () =>
      i18n.t("apps.chats.toolCalls.videosNotFound", {
        defaultValue: "Could not find the requested video in the playlist",
      }),
    skippedTo: (trackDesc) =>
      i18n.t("apps.chats.toolCalls.videosSkippedTo", {
        trackDesc,
        defaultValue: `Skipped to ${trackDesc}`,
      }),
    wentBackTo: (trackDesc) =>
      i18n.t("apps.chats.toolCalls.videosWentBackTo", {
        trackDesc,
        defaultValue: `Went back to ${trackDesc}`,
      }),
    skippedToNext: () =>
      i18n.t("apps.chats.toolCalls.videosSkippedToNext", {
        defaultValue: "Skipped to next video",
      }),
    wentBackToPrevious: () =>
      i18n.t("apps.chats.toolCalls.videosWentBackToPrevious", {
        defaultValue: "Went back to previous video",
      }),
    added: (title) =>
      i18n.t("apps.chats.toolCalls.videosAdded", {
        title,
        defaultValue: `Added '${title}' to Videos. Tap play to start`,
      }),
    addedAndPlaying: (title) =>
      i18n.t("apps.chats.toolCalls.videosAddedAndPlaying", {
        title,
        defaultValue: `Added '${title}' and started playing in Videos`,
      }),
  },
};

const tvPlaybackAdapter: PlaybackTargetAdapter = {
  appId: "tv",
  getCurrentItem: () => {
    const state = useTvStore.getState();
    const channel = buildTvChannelLineup(
      state.customChannels,
      state.hiddenDefaultChannelIds
    ).find((candidate) => candidate.id === state.currentChannelId);
    return channel
      ? { id: channel.id, title: channel.name }
      : null;
  },
  isPlaybackRequested: () => useTvStore.getState().playbackRequested,
  setIsPlaying: (playing) => useTvStore.getState().setIsPlaying(playing),
  togglePlay: () => useTvStore.getState().togglePlay(),
  applySettings: () => [],
  messages: {
    ready: () =>
      i18n.t("apps.chats.toolCalls.tvReady", {
        defaultValue: "TV is ready. Tap play to start",
      }),
    playingTrack: (channel) =>
      i18n.t("apps.chats.toolCalls.tvPlayingChannel", {
        channel,
        defaultValue: `TV is now playing ${channel}`,
      }),
    pausedTrack: (channel) =>
      i18n.t("apps.chats.toolCalls.tvPausedChannel", {
        channel,
        defaultValue: `TV paused ${channel}`,
      }),
    playing: () =>
      i18n.t("apps.chats.toolCalls.tvPlaying", {
        defaultValue: "TV is now playing",
      }),
    paused: () =>
      i18n.t("apps.chats.toolCalls.tvPaused", {
        defaultValue: "TV is now paused",
      }),
  },
};

const TRANSPORT_ADAPTERS: Record<
  Exclude<MediaControlTarget, "tv">,
  TransportTargetAdapter
> = {
  music: musicAdapter,
  karaoke: karaokeAdapter,
  videos: videosAdapter,
};

// ============================================================================
// Generic transport flow
// ============================================================================

const ensureAppOpen = (appId: AppId, launchApp: ToolContext["launchApp"]) => {
  const appState = useAppStore.getState();
  const instances = appState.getInstancesByAppId(appId);
  if (!instances.some((inst) => inst.isOpen)) {
    launchApp(appId);
  }
};

const emitOutput = (
  context: ToolContext,
  emitToolName: string,
  toolCallId: string,
  parts: string[]
): void => {
  context.addToolOutput({
    tool: emitToolName,
    toolCallId,
    output: buildResultMessage(parts),
  });
};

const handlePlaybackState = (
  adapter: PlaybackTargetAdapter,
  action: "toggle" | "play" | "pause",
  input: MediaControlInput,
  toolCallId: string,
  context: ToolContext,
  emitToolName: string,
  isIOS: boolean
): void => {
  // On iOS, don't auto-play — inform the user to press play manually.
  if (isIOS && (action === "play" || action === "toggle")) {
    const stateChanges = adapter.applySettings(input);
    emitOutput(context, emitToolName, toolCallId, [
      adapter.messages.ready(),
      ...stateChanges,
    ]);
    log.debug("iOS detected; user must manually start playback", {
      target: input.target,
    });
    return;
  }

  switch (action) {
    case "play":
      if (!adapter.isPlaybackRequested()) adapter.setIsPlaying(true);
      break;
    case "pause":
      if (adapter.isPlaybackRequested()) adapter.setIsPlaying(false);
      break;
    default:
      adapter.togglePlay();
      break;
  }

  const stateChanges = adapter.applySettings(input);
  const nowPlaying = adapter.isPlaybackRequested();
  const item = adapter.getCurrentItem();

  let playbackState: string;
  if (item) {
    const trackDesc = formatTrackDescription(item.title, item.artist);
    playbackState = nowPlaying
      ? adapter.messages.playingTrack(trackDesc)
      : adapter.messages.pausedTrack(trackDesc);
  } else {
    playbackState = nowPlaying
      ? adapter.messages.playing()
      : adapter.messages.paused();
  }

  emitOutput(context, emitToolName, toolCallId, [
    playbackState,
    ...stateChanges,
  ]);
  log.debug("Playback state changed", {
    target: input.target,
    isPlaying: nowPlaying,
  });
};

const handlePlayKnown = (
  adapter: TransportTargetAdapter,
  input: MediaControlInput,
  toolCallId: string,
  context: ToolContext,
  emitToolName: string,
  isIOS: boolean
): void => {
  const { id, title, artist } = input;

  // If no identifiers provided, fall back to toggle/play behavior.
  if (!id && !title && !artist) {
    handlePlaybackState(
      adapter,
      "toggle",
      input,
      toolCallId,
      context,
      emitToolName,
      isIOS
    );
    return;
  }

  const items = adapter.getItems();
  const candidateIndices = adapter.matchItems(items, { id, title, artist });

  if (candidateIndices.length === 0) {
    context.addToolOutput({
      tool: emitToolName,
      toolCallId,
      output: adapter.messages.notFound(),
    });
    log.debug("playKnown found no matching item", { target: input.target });
    return;
  }

  const randomIndex =
    candidateIndices[Math.floor(Math.random() * candidateIndices.length)];
  const item = items[randomIndex];
  if (!item) {
    context.addToolOutput({
      tool: emitToolName,
      toolCallId,
      output: adapter.messages.notFound(),
    });
    return;
  }

  adapter.selectItem(item.id);

  // On iOS, don't auto-play — just select the item.
  if (isIOS) {
    const stateChanges = adapter.applySettings(input);
    const trackDesc = item.artist
      ? `${item.title} by ${item.artist}`
      : item.title;
    emitOutput(context, emitToolName, toolCallId, [
      adapter.messages.selected(trackDesc),
      ...stateChanges,
    ]);
    log.debug("iOS detected; selected item without autoplay", {
      target: input.target,
      itemId: item.id,
    });
    return;
  }

  adapter.setIsPlaying(true);

  const stateChanges = adapter.applySettings(input);
  const trackDescForMsg = item.artist
    ? i18n.t("apps.chats.toolCalls.playingByArtist", {
        title: item.title,
        artist: item.artist,
      })
    : i18n.t("apps.chats.toolCalls.playing", { title: item.title });

  emitOutput(context, emitToolName, toolCallId, [
    trackDescForMsg,
    ...stateChanges,
  ]);
  log.debug("Started playing item", { target: input.target, itemId: item.id });
};

const handleAddAndPlay = async (
  adapter: TransportTargetAdapter,
  input: MediaControlInput,
  toolCallId: string,
  context: ToolContext,
  emitToolName: string,
  isIOS: boolean
): Promise<void> => {
  const { id } = input;

  if (!id) {
    const errorMsg =
      "The 'addAndPlay' action requires the 'id' parameter (YouTube ID or URL).";
    context.addToolOutput({
      tool: emitToolName,
      toolCallId,
      output: errorMsg,
    });
    console.error(`[ToolCall] ${errorMsg}`);
    return;
  }

  const result = await adapter.addAndPlay(id, isIOS);

  if (!result.ok) {
    context.addToolOutput({
      tool: emitToolName,
      toolCallId,
      output: result.error,
    });
    console.error(`[ToolCall] ${result.error}`);
    return;
  }

  const stateChanges = adapter.applySettings(input);
  emitOutput(context, emitToolName, toolCallId, [
    isIOS
      ? adapter.messages.added(result.title)
      : adapter.messages.addedAndPlaying(result.title),
    ...stateChanges,
  ]);
};

const handleNavigation = (
  adapter: TransportTargetAdapter,
  action: "next" | "previous",
  input: MediaControlInput,
  toolCallId: string,
  context: ToolContext,
  emitToolName: string
): void => {
  adapter.navigate(action);

  const stateChanges = adapter.applySettings(input);
  const item = adapter.getCurrentItem();

  if (item) {
    const desc = formatTrackDescription(item.title, item.artist);
    emitOutput(context, emitToolName, toolCallId, [
      action === "next"
        ? adapter.messages.skippedTo(desc)
        : adapter.messages.wentBackTo(desc),
      ...stateChanges,
    ]);
    log.debug("Navigation selected item", {
      target: input.target,
      action,
      itemId: item.id,
    });
    return;
  }

  emitOutput(context, emitToolName, toolCallId, [
    action === "next"
      ? adapter.messages.skippedToNext()
      : adapter.messages.wentBackToPrevious(),
    ...stateChanges,
  ]);
  log.debug("Navigation changed item", {
    target: input.target,
    action,
    hasItem: false,
  });
};

// ============================================================================
// Action normalization
// ============================================================================

const CANONICAL_ACTIONS = [
  "toggle",
  "play",
  "pause",
  "playKnown",
  "addAndPlay",
  "next",
  "previous",
  "list",
  "tune",
  "createChannel",
  "deleteChannel",
  "addVideo",
  "removeVideo",
] as const;

type CanonicalAction = (typeof CANONICAL_ACTIONS)[number];

const ACTION_BY_LOWERCASE = new Map<string, CanonicalAction>(
  CANONICAL_ACTIONS.map((a) => [a.toLowerCase(), a])
);

const TV_CHANNEL_ACTIONS: ReadonlySet<CanonicalAction> = new Set([
  "list",
  "tune",
  "createChannel",
  "deleteChannel",
  "addVideo",
  "removeVideo",
]);

// ============================================================================
// Main handler
// ============================================================================

/** Handle a `mediaControl` tool call. */
export const handleMediaControl = async (
  input: MediaControlInput,
  toolCallId: string,
  context: ToolContext
): Promise<void> => {
  const emitToolName = "mediaControl";
  const target: MediaControlTarget = input.target ?? "music";
  const rawAction = (input.action ?? "toggle").toString().trim();
  const action =
    ACTION_BY_LOWERCASE.get(rawAction.toLowerCase()) ?? rawAction;

  log.debug("mediaControl", {
    emitToolName,
    target,
    action,
    hasId: Boolean(input.id),
    hasTitle: Boolean(input.title),
    hasArtist: Boolean(input.artist),
  });

  const isIOS = isIOSDevice();

  // TV channel-management actions.
  if (TV_CHANNEL_ACTIONS.has(action as CanonicalAction)) {
    if (target !== "tv") {
      context.addToolOutput({
        tool: emitToolName,
        toolCallId,
        state: "output-error",
        errorText: `The '${action}' action requires target 'tv'.`,
      });
      return;
    }
    await handleTvChannelAction(
      {
        action: action as TvChannelAction,
        channelId: input.channelId,
        channelNumber: input.channelNumber,
        prompt: input.prompt,
        name: input.name,
        videoId: input.videoId,
        url: input.url,
        title: input.title,
        artist: input.artist,
        removeVideoId: input.removeVideoId,
      },
      toolCallId,
      context,
      emitToolName
    );
    return;
  }

  // TV transport.
  if (target === "tv") {
    if (action === "toggle" || action === "play" || action === "pause") {
      ensureAppOpen(tvPlaybackAdapter.appId, context.launchApp);
      handlePlaybackState(
        tvPlaybackAdapter,
        action,
        input,
        toolCallId,
        context,
        emitToolName,
        isIOS
      );
      return;
    }
    context.addToolOutput({
      tool: emitToolName,
      toolCallId,
      state: "output-error",
      errorText: `Unsupported TV action: "${action}". Use toggle/play/pause or the channel actions.`,
    });
    return;
  }

  const adapter = TRANSPORT_ADAPTERS[target];

  ensureAppOpen(adapter.appId, context.launchApp);

  if (action === "toggle" || action === "play" || action === "pause") {
    handlePlaybackState(
      adapter,
      action,
      input,
      toolCallId,
      context,
      emitToolName,
      isIOS
    );
    return;
  }

  if (action === "playKnown") {
    handlePlayKnown(adapter, input, toolCallId, context, emitToolName, isIOS);
    return;
  }

  if (action === "addAndPlay") {
    await handleAddAndPlay(
      adapter,
      input,
      toolCallId,
      context,
      emitToolName,
      isIOS
    );
    return;
  }

  if (action === "next" || action === "previous") {
    handleNavigation(adapter, action, input, toolCallId, context, emitToolName);
    return;
  }

  // Apply settings even if the action is unhandled.
  const stateChanges = adapter.applySettings(input);
  if (stateChanges.length > 0) {
    emitOutput(context, emitToolName, toolCallId, stateChanges);
    return;
  }

  // Always resolve the tool call to prevent hangs.
  console.warn(`[ToolCall] ${emitToolName}: Unhandled action "${action}".`);
  context.addToolOutput({
    tool: emitToolName,
    toolCallId,
    state: "output-error",
    errorText: `Unknown media action: "${action}"`,
  });
};
