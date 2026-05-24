/**
 * iPod Control Tool Handler
 */

import { useAppStore } from "@/stores/useAppStore";
import {
  getActiveIpodCurrentTrack,
  getActiveIpodTracks,
  navigateActiveIpodTrack,
  setActiveIpodCurrentSongId,
  useIpodStore,
} from "@/stores/useIpodStore";
import i18n from "@/lib/i18n";
import type { ToolContext } from "./types";
import {
  formatTrackDescription,
  buildResultMessage,
  shouldDisableTranslation,
  getLanguageName,
  isIOSDevice,
} from "./helpers";
import {
  createAppleMusicLookupQuery,
  findIpodTrackMatches,
  searchAndCacheAppleMusicTracks,
  type SearchAppleMusicTracksFn,
} from "./ipodMusicLookup";

export interface IpodControlInput {
  action?: "toggle" | "play" | "pause" | "playKnown" | "addAndPlay" | "next" | "previous";
  id?: string;
  title?: string;
  artist?: string;
  enableVideo?: boolean;
  enableTranslation?: string | null;
  enableFullscreen?: boolean;
}

export interface IpodControlDeps {
  searchAppleMusicTracks?: SearchAppleMusicTracksFn;
}

/**
 * Ensure iPod app is open
 */
const ensureIpodIsOpen = (launchApp: ToolContext["launchApp"]) => {
  const appState = useAppStore.getState();
  const ipodInstances = appState.getInstancesByAppId("ipod");
  const hasOpenIpodInstance = ipodInstances.some((inst) => inst.isOpen);

  if (!hasOpenIpodInstance) {
    launchApp("ipod");
  }
};

/**
 * Apply iPod settings (video, translation, fullscreen)
 * Returns an array of state change messages
 */
const applyIpodSettings = (
  enableVideo: boolean | undefined,
  enableTranslation: string | null | undefined,
  enableFullscreen: boolean | undefined
): string[] => {
  const ipod = useIpodStore.getState();
  const stateChanges: string[] = [];

  if (enableVideo !== undefined) {
    if (enableVideo && !ipod.showVideo) {
      ipod.setShowVideo(true);
      stateChanges.push(i18n.t("apps.chats.toolCalls.ipodTurnedOnVideo"));
      console.log("[ToolCall] Video enabled.");
    } else if (!enableVideo && ipod.showVideo) {
      ipod.setShowVideo(false);
      stateChanges.push(i18n.t("apps.chats.toolCalls.ipodTurnedOffVideo"));
      console.log("[ToolCall] Video disabled.");
    }
  }

  if (enableTranslation !== undefined) {
    if (shouldDisableTranslation(enableTranslation)) {
      ipod.setLyricsTranslationLanguage(null);
      stateChanges.push(i18n.t("apps.chats.toolCalls.ipodTurnedOffLyricsTranslation"));
      console.log("[ToolCall] Lyrics translation disabled.");
    } else if (enableTranslation) {
      ipod.setLyricsTranslationLanguage(enableTranslation);
      const langName = getLanguageName(enableTranslation);
      stateChanges.push(
        i18n.t("apps.chats.toolCalls.ipodTranslatedLyricsTo", { langName })
      );
      console.log(`[ToolCall] Lyrics translation enabled for language: ${enableTranslation}.`);
    }
  }

  if (enableFullscreen !== undefined) {
    if (enableFullscreen && !ipod.isFullScreen) {
      ipod.toggleFullScreen();
      stateChanges.push(i18n.t("apps.chats.toolCalls.ipodTurnedOnFullScreen"));
      console.log("[ToolCall] Fullscreen enabled.");
    } else if (!enableFullscreen && ipod.isFullScreen) {
      ipod.toggleFullScreen();
      stateChanges.push(i18n.t("apps.chats.toolCalls.ipodTurnedOffFullScreen"));
      console.log("[ToolCall] Fullscreen disabled.");
    }
  }

  return stateChanges;
};

/**
 * Handle playback state actions (toggle, play, pause)
 */
const handlePlaybackState = (
  action: "toggle" | "play" | "pause",
  input: IpodControlInput,
  toolCallId: string,
  context: ToolContext,
  isIOS: boolean
): void => {
  const ipod = useIpodStore.getState();

  // On iOS, don't auto-play - inform user to press play manually
  if (isIOS && (action === "play" || action === "toggle")) {
    const stateChanges = applyIpodSettings(
      input.enableVideo,
      input.enableTranslation,
      input.enableFullscreen
    );
    const resultParts = [i18n.t("apps.chats.toolCalls.ipodReady")];
    if (stateChanges.length > 0) {
      resultParts.push(...stateChanges);
    }
    context.addToolResult({
      tool: "ipodControl",
      toolCallId,
      output: buildResultMessage(resultParts),
    });
    console.log("[ToolCall] iOS detected - user must manually start playback.");
    return;
  }

  switch (action) {
    case "play":
      if (!ipod.isPlaying) ipod.setIsPlaying(true);
      break;
    case "pause":
      if (ipod.isPlaying) ipod.setIsPlaying(false);
      break;
    default:
      ipod.togglePlay();
      break;
  }

  const stateChanges = applyIpodSettings(
    input.enableVideo,
    input.enableTranslation,
    input.enableFullscreen
  );
  const updatedIpod = useIpodStore.getState();
  const nowPlaying = updatedIpod.isPlaying;
  const track = getActiveIpodCurrentTrack(updatedIpod);

  let playbackState: string;
  if (track) {
    const trackDesc = formatTrackDescription(track.title, track.artist);
    playbackState = nowPlaying
      ? i18n.t("apps.chats.toolCalls.ipodPlayingTrack", { trackDesc })
      : i18n.t("apps.chats.toolCalls.ipodPausedTrack", { trackDesc });
  } else {
    playbackState = nowPlaying
      ? i18n.t("apps.chats.toolCalls.ipodPlaying")
      : i18n.t("apps.chats.toolCalls.ipodPaused");
  }

  const resultParts = [playbackState, ...stateChanges];
  context.addToolResult({
    tool: "ipodControl",
    toolCallId,
    output: buildResultMessage(resultParts),
  });

  console.log(`[ToolCall] iPod is now ${nowPlaying ? "playing" : "paused"}.`);
};

/**
 * Handle playKnown action - play existing track by id/title/artist
 * If no identifiers are provided, falls back to toggle/play current track
 */
const handlePlayKnown = async (
  input: IpodControlInput,
  toolCallId: string,
  context: ToolContext,
  isIOS: boolean,
  deps: IpodControlDeps = {}
): Promise<void> => {
  const { id, title, artist, enableVideo, enableTranslation, enableFullscreen } = input;

  // If no identifiers provided, fall back to toggle/play behavior
  if (!id && !title && !artist) {
    handlePlaybackState("toggle", input, toolCallId, context, isIOS);
    return Promise.resolve();
  }

  let ipodState = useIpodStore.getState();
  let tracks = getActiveIpodTracks(ipodState);
  let candidates = findIpodTrackMatches(tracks, { id, title, artist });

  if (candidates.length === 0 && ipodState.librarySource === "appleMusic") {
    const lookupQuery = createAppleMusicLookupQuery({ id, title, artist });
    const remoteTracks = await searchAndCacheAppleMusicTracks(
      lookupQuery,
      deps.searchAppleMusicTracks
    );
    ipodState = useIpodStore.getState();
    tracks = getActiveIpodTracks(ipodState);
    candidates = findIpodTrackMatches(tracks, { id, title, artist });

    if (candidates.length === 0 && (title || artist)) {
      candidates = remoteTracks;
    }
  }

  if (candidates.length === 0) {
    const errorMsg = i18n.t("apps.chats.toolCalls.ipodSongNotFound");
    context.addToolResult({
      tool: "ipodControl",
      toolCallId,
      output: errorMsg,
    });
    console.log(`[ToolCall] ${errorMsg}`);
    return;
  }

  const track = candidates[Math.floor(Math.random() * candidates.length)];
  if (!track) {
    const errorMsg = i18n.t("apps.chats.toolCalls.ipodSongNotFound");
    context.addToolResult({
      tool: "ipodControl",
      toolCallId,
      output: errorMsg,
    });
    return;
  }

  const activeIpodState = useIpodStore.getState();
  setActiveIpodCurrentSongId(activeIpodState, track.id);
  const { setIsPlaying } = useIpodStore.getState();
  const trackDescForLog = formatTrackDescription(track.title, track.artist);

  // On iOS, don't auto-play - just select the track
  if (isIOS) {
    const stateChanges = applyIpodSettings(enableVideo, enableTranslation, enableFullscreen);
    const trackDescForMsg = track.artist
      ? `${track.title} by ${track.artist}`
      : track.title;
    const resultParts = [
      i18n.t("apps.chats.toolCalls.ipodSelected", { trackDesc: trackDescForMsg }),
    ];
    if (stateChanges.length > 0) {
      resultParts.push(...stateChanges);
    }
    context.addToolResult({
      tool: "ipodControl",
      toolCallId,
      output: buildResultMessage(resultParts),
    });
    console.log(
      `[ToolCall] iOS detected - selected ${trackDescForLog}, user must manually start playback.`
    );
    return;
  }

  setIsPlaying(true);

  const stateChanges = applyIpodSettings(enableVideo, enableTranslation, enableFullscreen);
  const trackDescForMsg = track.artist
    ? i18n.t("apps.chats.toolCalls.playingByArtist", {
        title: track.title,
        artist: track.artist,
      })
    : i18n.t("apps.chats.toolCalls.playing", { title: track.title });

  const resultParts = [trackDescForMsg, ...stateChanges];
  context.addToolResult({
    tool: "ipodControl",
    toolCallId,
    output: buildResultMessage(resultParts),
  });

  console.log(`[ToolCall] Playing ${trackDescForLog}.`);
};

/**
 * Handle addAndPlay action - add YouTube video and play
 */
const handleAddAndPlay = async (
  input: IpodControlInput,
  toolCallId: string,
  context: ToolContext,
  isIOS: boolean
): Promise<void> => {
  const { id, enableVideo, enableTranslation, enableFullscreen } = input;

  if (!id) {
    const errorMsg =
      "The 'addAndPlay' action requires the 'id' parameter (YouTube ID or URL).";
    context.addToolResult({
      tool: "ipodControl",
      toolCallId,
      output: errorMsg,
    });
    console.error(`[ToolCall] ${errorMsg}`);
    return;
  }

  if (id.startsWith("am:")) {
    const errorMsg =
      "Apple Music tracks are already in the active library. Use playKnown with the Apple Music track ID instead of addAndPlay.";
    context.addToolResult({
      tool: "ipodControl",
      toolCallId,
      output: errorMsg,
    });
    console.error(`[ToolCall] ${errorMsg}`);
    return;
  }

  try {
    const ipodState = useIpodStore.getState();
    if (ipodState.librarySource !== "youtube") {
      ipodState.setLibrarySource("youtube");
    }

    // On iOS, use addTrackFromVideoId with autoPlay=false
    const addedTrack = await useIpodStore
      .getState()
      .addTrackFromVideoId(id, !isIOS);

    if (addedTrack) {
      const stateChanges = applyIpodSettings(enableVideo, enableTranslation, enableFullscreen);

      const resultParts = isIOS
        ? [i18n.t("apps.chats.toolCalls.ipodAdded", { title: addedTrack.title })]
        : [i18n.t("apps.chats.toolCalls.ipodAddedAndPlaying", { title: addedTrack.title })];

      if (stateChanges.length > 0) {
        resultParts.push(...stateChanges);
      }

      context.addToolResult({
        tool: "ipodControl",
        toolCallId,
        output: buildResultMessage(resultParts),
      });

      console.log(
        isIOS
          ? `[ToolCall] iOS detected - added '${addedTrack.title}' to iPod, user must manually start playback.`
          : `[ToolCall] Added '${addedTrack.title}' to iPod and started playing.`
      );
    } else {
      const errorMsg = i18n.t("apps.chats.toolCalls.ipodFailedToAdd", { id });
      context.addToolResult({
        tool: "ipodControl",
        toolCallId,
        output: errorMsg,
      });
      console.error(`[ToolCall] ${errorMsg}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[iPod] Error adding ${id}:`, error);

    let errorMsg: string;
    if (errorMessage.includes("Failed to fetch video info")) {
      errorMsg = i18n.t("apps.chats.toolCalls.ipodCannotAdd", { id });
    } else {
      errorMsg = i18n.t("apps.chats.toolCalls.ipodFailedToAddWithError", {
        id,
        error: errorMessage,
      });
    }

    context.addToolResult({
      tool: "ipodControl",
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
  input: IpodControlInput,
  toolCallId: string,
  context: ToolContext
): void => {
  const { enableVideo, enableTranslation, enableFullscreen } = input;
  const ipodState = useIpodStore.getState();
  navigateActiveIpodTrack(ipodState, action);

  const stateChanges = applyIpodSettings(enableVideo, enableTranslation, enableFullscreen);

  const updatedIpod = useIpodStore.getState();
  const track = getActiveIpodCurrentTrack(updatedIpod);

  if (track) {
    const desc = formatTrackDescription(track.title, track.artist);
    const resultParts = [
      action === "next"
        ? i18n.t("apps.chats.toolCalls.ipodSkippedTo", { trackDesc: desc })
        : i18n.t("apps.chats.toolCalls.ipodWentBackTo", { trackDesc: desc }),
    ];
    if (stateChanges.length > 0) {
      resultParts.push(...stateChanges);
    }
    context.addToolResult({
      tool: "ipodControl",
      toolCallId,
      output: buildResultMessage(resultParts),
    });
    console.log(
      `[ToolCall] ${action === "next" ? "Skipped to" : "Went back to"} ${desc}.`
    );
    return;
  }

  const resultParts = [
    action === "next"
      ? i18n.t("apps.chats.toolCalls.ipodSkippedToNext")
      : i18n.t("apps.chats.toolCalls.ipodWentBackToPrevious"),
  ];
  if (stateChanges.length > 0) {
    resultParts.push(...stateChanges);
  }
  context.addToolResult({
    tool: "ipodControl",
    toolCallId,
    output: buildResultMessage(resultParts),
  });

  console.log(
    `[ToolCall] ${action === "next" ? "Skipped to next track." : "Went back to previous track."}`
  );
};

/**
 * Main iPod control handler
 */
export const handleIpodControl = async (
  input: IpodControlInput,
  toolCallId: string,
  context: ToolContext,
  deps: IpodControlDeps = {}
): Promise<void> => {
  const {
    action = "toggle",
    enableVideo,
    enableTranslation,
    enableFullscreen,
  } = input;

  console.log("[ToolCall] ipodControl:", input);

  const isIOS = isIOSDevice();

  // Ensure iPod is open
  ensureIpodIsOpen(context.launchApp);

  const normalizedAction = action ?? "toggle";

  // Handle different actions
  if (normalizedAction === "toggle" || normalizedAction === "play" || normalizedAction === "pause") {
    handlePlaybackState(normalizedAction, input, toolCallId, context, isIOS);
    return;
  }

  if (normalizedAction === "playKnown") {
    await handlePlayKnown(input, toolCallId, context, isIOS, deps);
    return;
  }

  if (normalizedAction === "addAndPlay") {
    await handleAddAndPlay(input, toolCallId, context, isIOS);
    return;
  }

  if (normalizedAction === "next" || normalizedAction === "previous") {
    handleNavigation(normalizedAction, input, toolCallId, context);
    return;
  }

  // Apply settings even if action is unhandled
  const stateChanges = applyIpodSettings(enableVideo, enableTranslation, enableFullscreen);

  if (stateChanges.length > 0) {
    context.addToolResult({
      tool: "ipodControl",
      toolCallId,
      output: buildResultMessage(stateChanges),
    });
    return;
  }

  // Always resolve the tool call to prevent hangs
  console.warn(`[ToolCall] ipodControl: Unhandled action "${normalizedAction}".`);
  context.addToolResult({
    tool: "ipodControl",
    toolCallId,
    state: "output-error",
    errorText: `Unknown iPod action: "${normalizedAction}"`,
  });
};
