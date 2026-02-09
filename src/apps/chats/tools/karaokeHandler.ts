/**
 * Karaoke Control Tool Handler
 */

import { useAppStore } from "@/stores/useAppStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { useKaraokeStore } from "@/stores/useKaraokeStore";
import type { ToolContext } from "./types";
import {
  ciIncludes,
  formatTrackDescription,
  buildResultMessage,
  shouldDisableTranslation,
  getLanguageName,
  isIOSDevice,
} from "./helpers";

// Import fuzzy search utilities from useAiChat (these should eventually be moved to helpers)
const normalizeSearchText = (value: string): string =>
  value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const isLooseSubsequence = (target: string, pattern: string): boolean => {
  if (pattern.length === 0) return true;
  let searchStart = 0;
  for (const char of pattern) {
    const foundIndex = target.indexOf(char, searchStart);
    if (foundIndex === -1) return false;
    searchStart = foundIndex + 1;
  }
  return true;
};

const levenshteinDistance = (a: string, b: string): number => {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const previous = new Array<number>(a.length + 1);
  const current = new Array<number>(a.length + 1);

  for (let i = 0; i <= a.length; i += 1) previous[i] = i;

  for (let i = 1; i <= b.length; i += 1) {
    current[0] = i;
    const bChar = b[i - 1]!;
    for (let j = 1; j <= a.length; j += 1) {
      const substitutionCost = bChar === a[j - 1]! ? 0 : 1;
      current[j] = Math.min(
        current[j - 1]! + 1,
        previous[j]! + 1,
        previous[j - 1]! + substitutionCost
      );
    }
    for (let j = 0; j <= a.length; j += 1) previous[j] = current[j]!;
  }

  return previous[a.length]!;
};

const bestSubstringDistance = (text: string, query: string): number => {
  const textLength = text.length;
  const queryLength = query.length;

  if (queryLength === 0) return 0;
  if (textLength === 0) return queryLength;
  if (queryLength >= textLength) return levenshteinDistance(text, query);

  let best = Number.MAX_SAFE_INTEGER;
  const maxOffset = textLength - queryLength;

  for (let offset = 0; offset <= maxOffset; offset += 1) {
    const window = text.slice(offset, offset + queryLength);
    const distance = levenshteinDistance(window, query);
    if (distance < best) {
      best = distance;
      if (best === 0) break;
    }
  }

  return best;
};

const computeMatchScore = (text: string, query: string, tokens: string[]): number => {
  if (!query) return 1;
  if (!text) return 0;

  let score = 0;

  const includeIndex = text.indexOf(query);
  if (includeIndex !== -1) {
    const includeScore = 0.7 + (1 - includeIndex / Math.max(text.length, query.length)) * 0.3;
    score = Math.max(score, Math.min(1, includeScore));
  }

  if (isLooseSubsequence(text, query)) {
    const subsequenceScore = 0.5 + Math.min(0.4, (query.length / Math.max(text.length, query.length)) * 0.4);
    score = Math.max(score, Math.min(1, subsequenceScore));
  }

  const maxLen = Math.max(query.length, Math.min(text.length, query.length));
  if (maxLen > 0) {
    const distance = bestSubstringDistance(text, query);
    const distanceScore = 1 - distance / (maxLen + 1);
    score = Math.max(score, Math.max(0, distanceScore));
  }

  if (tokens.length > 1) {
    let tokenAccumulator = 0;
    for (const token of tokens) {
      if (!token) continue;
      const tokenIndex = text.indexOf(token);
      if (tokenIndex !== -1) {
        tokenAccumulator += 1;
        continue;
      }
      const tokenMaxLen = Math.max(token.length, Math.min(text.length, token.length));
      if (tokenMaxLen === 0) continue;
      const tokenDistance = bestSubstringDistance(text, token);
      const tokenScore = 1 - tokenDistance / (tokenMaxLen + 1);
      if (tokenScore > 0.5) tokenAccumulator += tokenScore;
    }
    if (tokenAccumulator > 0) {
      const normalizedTokenScore = tokenAccumulator / tokens.length;
      score = Math.max(score, Math.min(1, normalizedTokenScore));
    }
  }

  return Math.max(0, Math.min(1, score));
};

const deriveScoreThreshold = (queryLength: number): number => {
  if (queryLength <= 2) return 0.65;
  if (queryLength <= 4) return 0.55;
  if (queryLength <= 6) return 0.5;
  if (queryLength <= 8) return 0.45;
  return 0.4;
};

export interface KaraokeControlInput {
  action?: "toggle" | "play" | "pause" | "playKnown" | "addAndPlay" | "next" | "previous";
  id?: string;
  title?: string;
  artist?: string;
  enableTranslation?: string | null;
  enableFullscreen?: boolean;
}

type TranslateFn = (
  key: string,
  params?: Record<string, unknown>,
) => string;

const resolveTranslator = (context: ToolContext): TranslateFn =>
  context.translate ??
  ((key: string, _params?: Record<string, unknown>) => key);

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
  enableFullscreen: boolean | undefined,
  t: TranslateFn,
): string[] => {
  const ipod = useIpodStore.getState();
  const karaoke = useKaraokeStore.getState();
  const stateChanges: string[] = [];

  if (enableTranslation !== undefined) {
    if (shouldDisableTranslation(enableTranslation)) {
      ipod.setLyricsTranslationLanguage(null);
      stateChanges.push(t("apps.chats.toolCalls.ipodTurnedOffLyricsTranslation"));
      console.log("[ToolCall] Karaoke lyrics translation disabled.");
    } else if (enableTranslation) {
      ipod.setLyricsTranslationLanguage(enableTranslation);
      const langName = getLanguageName(enableTranslation);
      stateChanges.push(
        t("apps.chats.toolCalls.ipodTranslatedLyricsTo", { langName })
      );
      console.log(`[ToolCall] Karaoke lyrics translation enabled for language: ${enableTranslation}.`);
    }
  }

  if (enableFullscreen !== undefined) {
    if (enableFullscreen && !karaoke.isFullScreen) {
      karaoke.toggleFullScreen();
      stateChanges.push(t("apps.chats.toolCalls.ipodTurnedOnFullScreen"));
      console.log("[ToolCall] Karaoke fullscreen enabled.");
    } else if (!enableFullscreen && karaoke.isFullScreen) {
      karaoke.toggleFullScreen();
      stateChanges.push(t("apps.chats.toolCalls.ipodTurnedOffFullScreen"));
      console.log("[ToolCall] Karaoke fullscreen disabled.");
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
  isIOS: boolean,
  t: TranslateFn,
): void => {
  const karaoke = useKaraokeStore.getState();

  // On iOS, don't auto-play
  if (isIOS && (action === "play" || action === "toggle")) {
    const stateChanges = applyKaraokeSettings(
      input.enableTranslation,
      input.enableFullscreen,
      t,
    );
    const resultParts = [
      t("apps.chats.toolCalls.karaokeReady", { defaultValue: "Karaoke is ready. Tap play to start" }),
    ];
    if (stateChanges.length > 0) {
      resultParts.push(...stateChanges);
    }
    context.addToolResult({
      tool: "karaokeControl",
      toolCallId,
      output: buildResultMessage(resultParts),
    });
    console.log("[ToolCall] iOS detected - user must manually start karaoke playback.");
    return;
  }

  switch (action) {
    case "play":
      if (!karaoke.isPlaying) karaoke.setIsPlaying(true);
      break;
    case "pause":
      if (karaoke.isPlaying) karaoke.setIsPlaying(false);
      break;
    default:
      karaoke.togglePlay();
      break;
  }

  const stateChanges = applyKaraokeSettings(
    input.enableTranslation,
    input.enableFullscreen,
    t,
  );
  const updatedKaraoke = useKaraokeStore.getState();
  const nowPlaying = updatedKaraoke.isPlaying;
  const ipodTracks = useIpodStore.getState().tracks;
  const track = updatedKaraoke.currentSongId
    ? ipodTracks.find((t) => t.id === updatedKaraoke.currentSongId)
    : ipodTracks[0];

  let playbackState: string;
  if (track) {
    const trackDesc = formatTrackDescription(track.title, track.artist);
    playbackState = nowPlaying
      ? t("apps.chats.toolCalls.karaokePlayingTrack", {
          trackDesc,
          defaultValue: `Karaoke is now playing ${trackDesc}`,
        })
      : t("apps.chats.toolCalls.karaokePausedTrack", {
          trackDesc,
          defaultValue: `Karaoke paused ${trackDesc}`,
        });
  } else {
    playbackState = nowPlaying
      ? t("apps.chats.toolCalls.karaokePlaying", { defaultValue: "Karaoke is now playing" })
      : t("apps.chats.toolCalls.karaokePaused", { defaultValue: "Karaoke is now paused" });
  }

  const resultParts = [playbackState, ...stateChanges];
  context.addToolResult({
    tool: "karaokeControl",
    toolCallId,
    output: buildResultMessage(resultParts),
  });

  console.log(`[ToolCall] Karaoke is now ${nowPlaying ? "playing" : "paused"}.`);
};

/**
 * Handle playKnown action
 * If no identifiers are provided, falls back to toggle/play current track
 */
const handlePlayKnown = (
  input: KaraokeControlInput,
  toolCallId: string,
  context: ToolContext,
  isIOS: boolean,
  t: TranslateFn,
): void => {
  const { id, title, artist, enableTranslation, enableFullscreen } = input;
  const ipodState = useIpodStore.getState();
  const { tracks } = ipodState;

  // If no identifiers provided, fall back to toggle/play behavior
  if (!id && !title && !artist) {
    handlePlaybackState("toggle", input, toolCallId, context, isIOS, t);
    return;
  }

  // Find matching tracks
  let candidateIndices: number[] = [];
  if (id) {
    candidateIndices = tracks
      .map((track, index) => (track.id === id ? index : -1))
      .filter((index) => index !== -1);
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
    candidateIndices = validMatches.filter((m) => m.score === maxScore).map(({ index }) => index);
  }

  if (candidateIndices.length === 0 && artist) {
    candidateIndices = tracks
      .map((track, index) => (ciIncludes(track.artist, artist) ? index : -1))
      .filter((index) => index !== -1);
  }

  if (candidateIndices.length === 0) {
    const errorMsg = t("apps.chats.toolCalls.karaokeSongNotFound", {
      defaultValue: "Could not find the requested song in the library",
    });
    context.addToolResult({
      tool: "karaokeControl",
      toolCallId,
      output: errorMsg,
    });
    console.warn("[ToolCall] karaokeControl playKnown: No matching track found.");
    return;
  }

  const randomIndex = candidateIndices[Math.floor(Math.random() * candidateIndices.length)];
  const track = tracks[randomIndex];
  const trackDescForLog = formatTrackDescription(track.title, track.artist);

  const { setCurrentSongId, setIsPlaying } = useKaraokeStore.getState();
  setCurrentSongId(track?.id ?? null);

  // On iOS, don't auto-play
  if (isIOS) {
    const stateChanges = applyKaraokeSettings(
      enableTranslation,
      enableFullscreen,
      t,
    );
    const trackDescForMsg = track.artist ? `${track.title} by ${track.artist}` : track.title;
    const resultParts = [
      t("apps.chats.toolCalls.karaokeSelected", {
        trackDesc: trackDescForMsg,
        defaultValue: `Selected ${trackDescForMsg}. Tap play to start`,
      }),
    ];
    if (stateChanges.length > 0) {
      resultParts.push(...stateChanges);
    }
    context.addToolResult({
      tool: "karaokeControl",
      toolCallId,
      output: buildResultMessage(resultParts),
    });
    console.log(`[ToolCall] iOS detected - selected ${trackDescForLog} in Karaoke, user must manually start playback.`);
    return;
  }

  setIsPlaying(true);

  const stateChanges = applyKaraokeSettings(
    enableTranslation,
    enableFullscreen,
    t,
  );
  const trackDescForMsg = track.artist
    ? t("apps.chats.toolCalls.playingByArtist", { title: track.title, artist: track.artist })
    : t("apps.chats.toolCalls.playing", { title: track.title });

  const resultParts = [trackDescForMsg, ...stateChanges];
  context.addToolResult({
    tool: "karaokeControl",
    toolCallId,
    output: buildResultMessage(resultParts),
  });

  console.log(`[ToolCall] Karaoke started playing ${trackDescForLog}.`);
};

/**
 * Handle addAndPlay action
 */
const handleAddAndPlay = async (
  input: KaraokeControlInput,
  toolCallId: string,
  context: ToolContext,
  isIOS: boolean,
  t: TranslateFn,
): Promise<void> => {
  const { id, enableTranslation, enableFullscreen } = input;

  if (!id) {
    const errorMsg = t("apps.chats.toolCalls.karaokeNoIdProvided", {
      defaultValue: "No YouTube ID or URL provided for addAndPlay",
    });
    context.addToolResult({
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

      const stateChanges = applyKaraokeSettings(
        enableTranslation,
        enableFullscreen,
        t,
      );

      const resultParts = isIOS
        ? [
            t("apps.chats.toolCalls.karaokeAdded", {
              title: addedTrack.title,
              defaultValue: `Added '${addedTrack.title}' to library. Tap play to start in Karaoke`,
            }),
          ]
        : [
            t("apps.chats.toolCalls.karaokeAddedAndPlaying", {
              title: addedTrack.title,
              defaultValue: `Added '${addedTrack.title}' and started playing in Karaoke`,
            }),
          ];

      if (stateChanges.length > 0) {
        resultParts.push(...stateChanges);
      }

      context.addToolResult({
        tool: "karaokeControl",
        toolCallId,
        output: buildResultMessage(resultParts),
      });

      console.log(
        isIOS
          ? `[ToolCall] iOS detected - added '${addedTrack.title}' to library for Karaoke, user must manually start playback.`
          : `[ToolCall] Added '${addedTrack.title}' and started playing in Karaoke.`
      );
    } else {
      const errorMsg = t("apps.chats.toolCalls.karaokeFailedToAdd", {
        id,
        defaultValue: `Failed to add ${id} to library`,
      });
      context.addToolResult({
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
      errorMsg = t("apps.chats.toolCalls.karaokeCannotAdd", {
        id,
        defaultValue: `Cannot add ${id}: Video unavailable or invalid`,
      });
    } else {
      errorMsg = t("apps.chats.toolCalls.karaokeFailedToAddWithError", {
        id,
        error: errorMessage,
        defaultValue: `Failed to add ${id}: ${errorMessage}`,
      });
    }

    context.addToolResult({
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
  context: ToolContext,
  t: TranslateFn,
): void => {
  const { enableTranslation, enableFullscreen } = input;
  const karaokeState = useKaraokeStore.getState();
  const navigate = action === "next" ? karaokeState.nextTrack : karaokeState.previousTrack;

  if (typeof navigate === "function") {
    navigate();
  }

  const stateChanges = applyKaraokeSettings(
    enableTranslation,
    enableFullscreen,
    t,
  );

  const updatedKaraoke = useKaraokeStore.getState();
  const ipodTracks = useIpodStore.getState().tracks;
  const track = updatedKaraoke.currentSongId
    ? ipodTracks.find((t) => t.id === updatedKaraoke.currentSongId)
    : ipodTracks[0];

  if (track) {
    const desc = formatTrackDescription(track.title, track.artist);
    const resultParts = [
      action === "next"
        ? t("apps.chats.toolCalls.karaokeSkippedTo", { trackDesc: desc, defaultValue: `Skipped to ${desc}` })
        : t("apps.chats.toolCalls.karaokeWentBackTo", { trackDesc: desc, defaultValue: `Went back to ${desc}` }),
    ];
    if (stateChanges.length > 0) {
      resultParts.push(...stateChanges);
    }
    context.addToolResult({
      tool: "karaokeControl",
      toolCallId,
      output: buildResultMessage(resultParts),
    });

    console.log(`[ToolCall] Karaoke ${action === "next" ? "skipped to" : "went back to"} ${desc}.`);
    return;
  }

  const resultParts = [
    action === "next"
      ? t("apps.chats.toolCalls.karaokeSkippedToNext", { defaultValue: "Skipped to next track" })
      : t("apps.chats.toolCalls.karaokeWentBackToPrevious", { defaultValue: "Went back to previous track" }),
  ];
  if (stateChanges.length > 0) {
    resultParts.push(...stateChanges);
  }
  context.addToolResult({
    tool: "karaokeControl",
    toolCallId,
    output: buildResultMessage(resultParts),
  });

  console.log(
    `[ToolCall] Karaoke ${action === "next" ? "skipped to next track." : "went back to previous track."}`
  );
};

/**
 * Main Karaoke control handler
 */
export const handleKaraokeControl = async (
  input: KaraokeControlInput,
  toolCallId: string,
  context: ToolContext
): Promise<void> => {
  const t = resolveTranslator(context);
  const { action = "toggle", enableTranslation, enableFullscreen } = input;

  console.log("[ToolCall] karaokeControl:", input);

  const isIOS = isIOSDevice();

  // Ensure Karaoke is open
  ensureKaraokeIsOpen(context.launchApp);

  const normalizedAction = (action ?? "toggle").toLowerCase().trim();

  // Handle different actions
  if (normalizedAction === "toggle" || normalizedAction === "play" || normalizedAction === "pause") {
    handlePlaybackState(
      normalizedAction as "toggle" | "play" | "pause",
      input,
      toolCallId,
      context,
      isIOS,
      t,
    );
    return;
  }

  if (normalizedAction === "playknown") {
    handlePlayKnown(input, toolCallId, context, isIOS, t);
    return;
  }

  if (normalizedAction === "addandplay") {
    await handleAddAndPlay(input, toolCallId, context, isIOS, t);
    return;
  }

  if (normalizedAction === "next" || normalizedAction === "previous") {
    handleNavigation(
      normalizedAction as "next" | "previous",
      input,
      toolCallId,
      context,
      t,
    );
    return;
  }

  // Apply settings even if action is unhandled
  const stateChanges = applyKaraokeSettings(enableTranslation, enableFullscreen, t);

  if (stateChanges.length > 0) {
    context.addToolResult({
      tool: "karaokeControl",
      toolCallId,
      output: buildResultMessage(stateChanges),
    });
  }

  console.warn(`[ToolCall] karaokeControl: Unhandled action "${normalizedAction}".`);
};
