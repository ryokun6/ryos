/**
 * Karaoke Control Tool Handler
 */

import { useAppStore } from "@/stores/useAppStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { useKaraokeStore } from "@/stores/useKaraokeStore";
import i18n from "@/lib/i18n";
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
import { createClientLogger } from "@/utils/logger";

const log = createClientLogger("ChatTools");

export interface KaraokeControlInput {
  action?: "toggle" | "play" | "pause" | "playKnown" | "addAndPlay" | "next" | "previous";
  id?: string;
  title?: string;
  artist?: string;
  enableTranslation?: string | null;
  enableFullscreen?: boolean;
}

/**
 * Ensure Karaoke app is open
 */
const ensureKaraokeIsOpen = (launchApp: ToolContext["launchApp"]) => {
  const appState = useAppStore.getState();
  const karaokeInstances = appState.getInstancesByAppId("karaoke");
  const hasOpenKaraokeInstance = karaokeInstances.some((inst) => inst.isOpen);

  if (!hasOpenKaraokeInstance) {
    launchApp("karaoke");
  }
};

/**
 * Apply Karaoke settings (translation, fullscreen)
 */
const applyKaraokeSettings = (
  enableTranslation: string | null | undefined,
  enableFullscreen: boolean | undefined
): string[] => {
  const ipod = useIpodStore.getState();
  const karaoke = useKaraokeStore.getState();
  const stateChanges: string[] = [];

  if (enableTranslation !== undefined) {
    if (shouldDisableTranslation(enableTranslation)) {
      ipod.setLyricsTranslationLanguage(null);
      stateChanges.push(i18n.t("apps.chats.toolCalls.ipodTurnedOffLyricsTranslation"));
      log.debug("Karaoke lyrics translation disabled");
    } else if (enableTranslation) {
      ipod.setLyricsTranslationLanguage(enableTranslation);
      const langName = getLanguageName(enableTranslation);
      stateChanges.push(
        i18n.t("apps.chats.toolCalls.ipodTranslatedLyricsTo", { langName })
      );
      log.debug("Karaoke lyrics translation enabled", {
        language: enableTranslation,
      });
    }
  }

  if (enableFullscreen !== undefined) {
    if (enableFullscreen && !karaoke.isFullScreen) {
      karaoke.toggleFullScreen();
      stateChanges.push(i18n.t("apps.chats.toolCalls.ipodTurnedOnFullScreen"));
      log.debug("Karaoke fullscreen enabled");
    } else if (!enableFullscreen && karaoke.isFullScreen) {
      karaoke.toggleFullScreen();
      stateChanges.push(i18n.t("apps.chats.toolCalls.ipodTurnedOffFullScreen"));
      log.debug("Karaoke fullscreen disabled");
    }
  }

  return stateChanges;
};

/**
 * Handle playback state actions (toggle, play, pause)
 */
const handlePlaybackState = (
  action: "toggle" | "play" | "pause",
  input: KaraokeControlInput,
  toolCallId: string,
  context: ToolContext,
  isIOS: boolean
): void => {
  const karaoke = useKaraokeStore.getState();

  // On iOS, don't auto-play
  if (isIOS && (action === "play" || action === "toggle")) {
    const stateChanges = applyKaraokeSettings(input.enableTranslation, input.enableFullscreen);
    const resultParts = [
      i18n.t("apps.chats.toolCalls.karaokeReady", { defaultValue: "Karaoke is ready. Tap play to start" }),
    ];
    if (stateChanges.length > 0) {
      resultParts.push(...stateChanges);
    }
    context.addToolOutput({
      tool: "karaokeControl",
      toolCallId,
      output: buildResultMessage(resultParts),
    });
    log.debug("iOS detected; user must manually start karaoke playback");
    return;
  }

  switch (action) {
    case "play":
      if (!karaoke.playbackRequested) karaoke.setIsPlaying(true);
      break;
    case "pause":
      if (karaoke.playbackRequested) karaoke.setIsPlaying(false);
      break;
    default:
      karaoke.togglePlay();
      break;
  }

  const stateChanges = applyKaraokeSettings(input.enableTranslation, input.enableFullscreen);
  const updatedKaraoke = useKaraokeStore.getState();
  const nowPlaying = updatedKaraoke.playbackRequested;
  const ipodTracks = useIpodStore.getState().tracks;
  const track = updatedKaraoke.currentSongId
    ? ipodTracks.find((t) => t.id === updatedKaraoke.currentSongId)
    : ipodTracks[0];

  let playbackState: string;
  if (track) {
    const trackDesc = formatTrackDescription(track.title, track.artist);
    playbackState = nowPlaying
      ? i18n.t("apps.chats.toolCalls.karaokePlayingTrack", {
          trackDesc,
          defaultValue: `Karaoke is now playing ${trackDesc}`,
        })
      : i18n.t("apps.chats.toolCalls.karaokePausedTrack", {
          trackDesc,
          defaultValue: `Karaoke paused ${trackDesc}`,
        });
  } else {
    playbackState = nowPlaying
      ? i18n.t("apps.chats.toolCalls.karaokePlaying", { defaultValue: "Karaoke is now playing" })
      : i18n.t("apps.chats.toolCalls.karaokePaused", { defaultValue: "Karaoke is now paused" });
  }

  const resultParts = [playbackState, ...stateChanges];
  context.addToolOutput({
    tool: "karaokeControl",
    toolCallId,
    output: buildResultMessage(resultParts),
  });

  log.debug("Karaoke playback state changed", { isPlaying: nowPlaying });
};

/**
 * Handle playKnown action
 * If no identifiers are provided, falls back to toggle/play current track
 */
const handlePlayKnown = (
  input: KaraokeControlInput,
  toolCallId: string,
  context: ToolContext,
  isIOS: boolean
): void => {
  const { id, title, artist, enableTranslation, enableFullscreen } = input;
  const ipodState = useIpodStore.getState();
  const { tracks } = ipodState;

  // If no identifiers provided, fall back to toggle/play behavior
  if (!id && !title && !artist) {
    handlePlaybackState("toggle", input, toolCallId, context, isIOS);
    return;
  }

  // Find matching tracks
  let candidateIndices: number[] = [];
  if (id) {
    candidateIndices = tracks.reduce<number[]>((acc, track, index) => {
      if (track.id === id) {
        acc.push(index);
      }
      return acc;
    }, []);
  }

  if (candidateIndices.length === 0 && title) {
    const normalizedQuery = normalizeSearchText(title);
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    const threshold = deriveScoreThreshold(normalizedQuery.length);

    const scoredTracks = tracks.map((track, index) => {
      const normalizedTitle = normalizeSearchText(track.title ?? "");
      const normalizedArtist = normalizeSearchText(track.artist ?? "");
      const combined = `${normalizedTitle} ${normalizedArtist}`.trim();
      const score = computeMatchScore(combined, normalizedQuery, tokens);
      return { index, score };
    });

    const validMatches = scoredTracks.filter((t) => t.score >= threshold);
    const maxScore = Math.max(...validMatches.map((m) => m.score), 0);
    candidateIndices = validMatches.reduce<number[]>((acc, match) => {
      if (match.score === maxScore) {
        acc.push(match.index);
      }
      return acc;
    }, []);
  }

  if (candidateIndices.length === 0 && artist) {
    candidateIndices = tracks.reduce<number[]>((acc, track, index) => {
      if (ciIncludes(track.artist, artist)) {
        acc.push(index);
      }
      return acc;
    }, []);
  }

  if (candidateIndices.length === 0) {
    const errorMsg = i18n.t("apps.chats.toolCalls.karaokeSongNotFound", {
      defaultValue: "Could not find the requested song in the library",
    });
    context.addToolOutput({
      tool: "karaokeControl",
      toolCallId,
      output: errorMsg,
    });
    console.warn("[ToolCall] karaokeControl playKnown: No matching track found.");
    return;
  }

  const randomIndex = candidateIndices[Math.floor(Math.random() * candidateIndices.length)];
  const track = tracks[randomIndex];

  const { setCurrentSongId, setIsPlaying } = useKaraokeStore.getState();
  setCurrentSongId(track?.id ?? null);

  // On iOS, don't auto-play
  if (isIOS) {
    const stateChanges = applyKaraokeSettings(enableTranslation, enableFullscreen);
    const trackDescForMsg = track.artist ? `${track.title} by ${track.artist}` : track.title;
    const resultParts = [
      i18n.t("apps.chats.toolCalls.karaokeSelected", {
        trackDesc: trackDescForMsg,
        defaultValue: `Selected ${trackDescForMsg}. Tap play to start`,
      }),
    ];
    if (stateChanges.length > 0) {
      resultParts.push(...stateChanges);
    }
    context.addToolOutput({
      tool: "karaokeControl",
      toolCallId,
      output: buildResultMessage(resultParts),
    });
    log.debug("iOS detected; selected Karaoke track without autoplay", {
      trackId: track.id,
    });
    return;
  }

  setIsPlaying(true);

  const stateChanges = applyKaraokeSettings(enableTranslation, enableFullscreen);
  const trackDescForMsg = track.artist
    ? i18n.t("apps.chats.toolCalls.playingByArtist", { title: track.title, artist: track.artist })
    : i18n.t("apps.chats.toolCalls.playing", { title: track.title });

  const resultParts = [trackDescForMsg, ...stateChanges];
  context.addToolOutput({
    tool: "karaokeControl",
    toolCallId,
    output: buildResultMessage(resultParts),
  });

  log.debug("Karaoke started playing track", { trackId: track.id });
};

/**
 * Handle addAndPlay action
 */
const handleAddAndPlay = async (
  input: KaraokeControlInput,
  toolCallId: string,
  context: ToolContext,
  isIOS: boolean
): Promise<void> => {
  const { id, enableTranslation, enableFullscreen } = input;

  if (!id) {
    const errorMsg = i18n.t("apps.chats.toolCalls.karaokeNoIdProvided", {
      defaultValue: "No YouTube ID or URL provided for addAndPlay",
    });
    context.addToolOutput({
      tool: "karaokeControl",
      toolCallId,
      output: errorMsg,
    });
    console.error(`[ToolCall] karaokeControl addAndPlay: ${errorMsg}`);
    return;
  }

  try {
    // Add track to the shared iPod library, then play it in Karaoke
    const addedTrack = await useIpodStore.getState().addTrackFromVideoId(id, false);

    if (addedTrack) {
      // Set karaoke to play the newly added track
      const { setCurrentSongId, setIsPlaying } = useKaraokeStore.getState();
      setCurrentSongId(addedTrack.id);

      // On iOS, don't auto-play
      if (!isIOS) {
        setIsPlaying(true);
      }

      const stateChanges = applyKaraokeSettings(enableTranslation, enableFullscreen);

      const resultParts = isIOS
        ? [
            i18n.t("apps.chats.toolCalls.karaokeAdded", {
              title: addedTrack.title,
              defaultValue: `Added '${addedTrack.title}' to library. Tap play to start in Karaoke`,
            }),
          ]
        : [
            i18n.t("apps.chats.toolCalls.karaokeAddedAndPlaying", {
              title: addedTrack.title,
              defaultValue: `Added '${addedTrack.title}' and started playing in Karaoke`,
            }),
          ];

      if (stateChanges.length > 0) {
        resultParts.push(...stateChanges);
      }

      context.addToolOutput({
        tool: "karaokeControl",
        toolCallId,
        output: buildResultMessage(resultParts),
      });

      log.debug("Added track to Karaoke library", {
        trackId: addedTrack.id,
        isIOS,
        autoPlayed: !isIOS,
      });
    } else {
      const errorMsg = i18n.t("apps.chats.toolCalls.karaokeFailedToAdd", {
        id,
        defaultValue: `Failed to add ${id} to library`,
      });
      context.addToolOutput({
        tool: "karaokeControl",
        toolCallId,
        output: errorMsg,
      });
      console.error(`[ToolCall] ${errorMsg}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Karaoke] Error adding ${id}:`, error);

    let errorMsg: string;
    if (errorMessage.includes("Failed to fetch video info")) {
      errorMsg = i18n.t("apps.chats.toolCalls.karaokeCannotAdd", {
        id,
        defaultValue: `Cannot add ${id}: Video unavailable or invalid`,
      });
    } else {
      errorMsg = i18n.t("apps.chats.toolCalls.karaokeFailedToAddWithError", {
        id,
        error: errorMessage,
        defaultValue: `Failed to add ${id}: ${errorMessage}`,
      });
    }

    context.addToolOutput({
      tool: "karaokeControl",
      toolCallId,
      output: errorMsg,
    });
    console.error(`[ToolCall] ${errorMsg}`);
  }
};

/**
 * Handle next/previous actions
 */
const handleNavigation = (
  action: "next" | "previous",
  input: KaraokeControlInput,
  toolCallId: string,
  context: ToolContext
): void => {
  const { enableTranslation, enableFullscreen } = input;
  const karaokeState = useKaraokeStore.getState();
  const navigate = action === "next" ? karaokeState.nextTrack : karaokeState.previousTrack;

  if (typeof navigate === "function") {
    navigate();
  }

  const stateChanges = applyKaraokeSettings(enableTranslation, enableFullscreen);

  const updatedKaraoke = useKaraokeStore.getState();
  const ipodTracks = useIpodStore.getState().tracks;
  const track = updatedKaraoke.currentSongId
    ? ipodTracks.find((t) => t.id === updatedKaraoke.currentSongId)
    : ipodTracks[0];

  if (track) {
    const desc = formatTrackDescription(track.title, track.artist);
    const resultParts = [
      action === "next"
        ? i18n.t("apps.chats.toolCalls.karaokeSkippedTo", { trackDesc: desc, defaultValue: `Skipped to ${desc}` })
        : i18n.t("apps.chats.toolCalls.karaokeWentBackTo", { trackDesc: desc, defaultValue: `Went back to ${desc}` }),
    ];
    if (stateChanges.length > 0) {
      resultParts.push(...stateChanges);
    }
    context.addToolOutput({
      tool: "karaokeControl",
      toolCallId,
      output: buildResultMessage(resultParts),
    });

    log.debug("Karaoke navigation selected track", {
      action,
      trackId: track.id,
    });
    return;
  }

  const resultParts = [
    action === "next"
      ? i18n.t("apps.chats.toolCalls.karaokeSkippedToNext", { defaultValue: "Skipped to next track" })
      : i18n.t("apps.chats.toolCalls.karaokeWentBackToPrevious", { defaultValue: "Went back to previous track" }),
  ];
  if (stateChanges.length > 0) {
    resultParts.push(...stateChanges);
  }
  context.addToolOutput({
    tool: "karaokeControl",
    toolCallId,
    output: buildResultMessage(resultParts),
  });

  log.debug("Karaoke navigation changed track", { action, hasTrack: false });
};

/**
 * Main Karaoke control handler
 */
export const handleKaraokeControl = async (
  input: KaraokeControlInput,
  toolCallId: string,
  context: ToolContext
): Promise<void> => {
  const { action = "toggle", enableTranslation, enableFullscreen } = input;

  log.debug("karaokeControl", {
    action,
    hasId: Boolean(input.id),
    hasTitle: Boolean(input.title),
    hasArtist: Boolean(input.artist),
    enableTranslation,
    enableFullscreen,
  });

  const isIOS = isIOSDevice();

  // Ensure Karaoke is open
  ensureKaraokeIsOpen(context.launchApp);

  const normalizedAction = (action ?? "toggle").toLowerCase().trim();

  // Handle different actions
  if (normalizedAction === "toggle" || normalizedAction === "play" || normalizedAction === "pause") {
    handlePlaybackState(normalizedAction as "toggle" | "play" | "pause", input, toolCallId, context, isIOS);
    return;
  }

  if (normalizedAction === "playknown") {
    handlePlayKnown(input, toolCallId, context, isIOS);
    return;
  }

  if (normalizedAction === "addandplay") {
    await handleAddAndPlay(input, toolCallId, context, isIOS);
    return;
  }

  if (normalizedAction === "next" || normalizedAction === "previous") {
    handleNavigation(normalizedAction as "next" | "previous", input, toolCallId, context);
    return;
  }

  // Apply settings even if action is unhandled
  const stateChanges = applyKaraokeSettings(enableTranslation, enableFullscreen);

  if (stateChanges.length > 0) {
    context.addToolOutput({
      tool: "karaokeControl",
      toolCallId,
      output: buildResultMessage(stateChanges),
    });
    return;
  }

  // Always resolve the tool call to prevent hangs
  console.warn(`[ToolCall] karaokeControl: Unhandled action "${normalizedAction}".`);
  context.addToolOutput({
    tool: "karaokeControl",
    toolCallId,
    state: "output-error",
    errorText: `Unknown Karaoke action: "${normalizedAction}"`,
  });
};
