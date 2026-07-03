/**
 * MediaCore shared playback transport.
 *
 * One implementation of the transport state machine and next/previous
 * navigation algorithm that the media apps (iPod YouTube + Apple Music,
 * Karaoke, Videos, TV) previously each hand-rolled. Stores compose
 * `createTransportActions` for the confirm-playback lifecycle and map
 * `computeNextNavigation` / `computePreviousNavigation` decisions onto
 * their own state patches (lyrics clearing, clock resets, etc.).
 */
import {
  type ConfirmedPlaybackFields,
  confirmPlayback as confirmPlaybackState,
  requestPlayback,
  stopPlayback,
  togglePlayback,
} from "./confirmedPlayback";

export const PLAYBACK_HISTORY_LIMIT = 50;

/** Anything with a stable string id — tracks, videos, channels. */
export interface MediaItemRef {
  id: string;
}

// ============================================================================
// Transport lifecycle actions (togglePlay / setIsPlaying / confirmPlayback)
// ============================================================================

export interface TransportActions {
  togglePlay: () => void;
  /** Request play or stop; `true` remains pending until `confirmPlayback`. */
  setIsPlaying: (playing: boolean) => void;
  confirmPlayback: () => void;
}

export interface TransportActionOptions {
  /**
   * Block toggle/play requests while offline. Matches the historical iPod /
   * Karaoke guards: `togglePlay` is blocked entirely, `setIsPlaying` only
   * when requesting playback (pausing offline is always allowed).
   */
  guardOffline?: boolean;
}

type TransportSet<S extends ConfirmedPlaybackFields> = (
  partial:
    | Partial<S>
    | ConfirmedPlaybackFields
    | ((state: S) => Partial<S> | ConfirmedPlaybackFields)
) => void;

function isOffline(): boolean {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

export function createTransportActions<S extends ConfirmedPlaybackFields>(
  set: TransportSet<S>,
  options: TransportActionOptions = {}
): TransportActions {
  const guardOffline = options.guardOffline ?? false;
  return {
    togglePlay: () => {
      if (guardOffline && isOffline()) return;
      set((state) => togglePlayback(state));
    },
    setIsPlaying: (playing) => {
      if (playing && guardOffline && isOffline()) return;
      set(playing ? requestPlayback() : stopPlayback());
    },
    confirmPlayback: () => {
      set((state) => confirmPlaybackState(state));
    },
  };
}

// ============================================================================
// Library position helpers
// ============================================================================

export function findMediaIndexById(
  items: readonly MediaItemRef[],
  id: string | null
): number {
  if (!id || items.length === 0) return -1;
  const index = items.findIndex((item) => item.id === id);
  return index >= 0 ? index : -1;
}

// ============================================================================
// Playback-history strategies
// ============================================================================

/**
 * Dedupe-append (iPod semantics): moving to a track pulls any earlier
 * occurrence of it to the end so back/forward doesn't create duplicates.
 */
export function dedupeAppendHistory(
  history: readonly string[],
  id: string,
  maxHistory: number = PLAYBACK_HISTORY_LIMIT
): string[] {
  const filtered = history.filter((entry) => entry !== id);
  return [...filtered, id].slice(-maxHistory);
}

/** Plain append (Karaoke semantics). */
export function appendHistory(
  history: readonly string[],
  id: string,
  maxHistory: number = PLAYBACK_HISTORY_LIMIT
): string[] {
  return [...history, id].slice(-maxHistory);
}

// ============================================================================
// Shuffle pickers
// ============================================================================

function getUnplayedIds(
  items: readonly MediaItemRef[],
  history: readonly string[]
): string[] {
  const playedIds = new Set(history);
  return items.reduce<string[]>((acc, item) => {
    if (!playedIds.has(item.id)) acc.push(item.id);
    return acc;
  }, []);
}

/**
 * iPod shuffle: exhaust unplayed tracks first, then avoid the most recently
 * played ones, and never repeat the current track when avoidable.
 */
export function pickRandomIdAvoidingRecent(
  items: readonly MediaItemRef[],
  history: readonly string[],
  currentId: string | null
): string | null {
  if (items.length === 0) return null;
  if (items.length === 1) return items[0].id;

  const unplayedIds = getUnplayedIds(items, history);
  if (unplayedIds.length > 0) {
    const availableUnplayed = unplayedIds.filter((id) => id !== currentId);
    if (availableUnplayed.length > 0) {
      return availableUnplayed[
        Math.floor(Math.random() * availableUnplayed.length)
      ];
    }
  }

  // Avoid a window of recently played tracks (half the library, capped).
  const avoidCount = Math.min(Math.floor(items.length / 2), 10);
  const recentIds = new Set(history.slice(-avoidCount));
  const availableIds = items.reduce<string[]>((acc, item) => {
    if (!recentIds.has(item.id) && item.id !== currentId) acc.push(item.id);
    return acc;
  }, []);
  if (availableIds.length > 0) {
    return availableIds[Math.floor(Math.random() * availableIds.length)];
  }

  const allExceptCurrent = items.reduce<string[]>((acc, item) => {
    if (item.id !== currentId) acc.push(item.id);
    return acc;
  }, []);
  if (allExceptCurrent.length === 0) return currentId;
  return allExceptCurrent[
    Math.floor(Math.random() * allExceptCurrent.length)
  ];
}

/** Karaoke shuffle: any track except the current one. */
export function pickRandomIdAvoidingCurrent(
  items: readonly MediaItemRef[],
  currentId: string | null
): string | null {
  if (items.length === 0) return null;
  if (items.length === 1) return items[0].id;
  const availableIds = items.reduce<string[]>((acc, item) => {
    if (item.id !== currentId) acc.push(item.id);
    return acc;
  }, []);
  if (availableIds.length === 0) return currentId;
  return availableIds[Math.floor(Math.random() * availableIds.length)];
}

// ============================================================================
// Next / previous navigation
// ============================================================================

export interface MediaNavigationInput {
  items: readonly MediaItemRef[];
  currentId: string | null;
  loopCurrent: boolean;
  loopAll: boolean;
  isShuffled: boolean;
  history: readonly string[];
}

export interface MediaNavigationStrategy {
  /**
   * When `next` records the outgoing item into history:
   * - "whenNotLoopingCurrent": always, unless looping the current item
   *   (iPod YouTube — history also feeds sequential back-navigation).
   * - "shuffleOnly": only while shuffling (Karaoke, iPod Apple Music).
   */
  recordHistoryOnNext: "whenNotLoopingCurrent" | "shuffleOnly";
  appendToHistory: (history: readonly string[], id: string) => string[];
  pickShuffleId: (
    items: readonly MediaItemRef[],
    history: readonly string[],
    currentId: string | null
  ) => string | null;
  /**
   * Whether `previous` in shuffle mode only retraces a history entry when it
   * differs from the current item (iPod) or accepts any entry (Karaoke).
   */
  popRequiresDifferentFromCurrent: boolean;
  /**
   * What `previous` does while shuffling with no history: step sequentially
   * (iPod YouTube, Karaoke) or pick another shuffle id (iPod Apple Music).
   */
  previousWithoutHistory: "sequential" | "shuffle";
}

export type MediaNextDecision =
  | { kind: "empty" }
  /** End of list with loopAll off: settle on `id` and stop playback. */
  | { kind: "stop"; id: string | null }
  | { kind: "advance"; id: string | null; history: string[] };

export type MediaPreviousDecision =
  | { kind: "empty" }
  | { kind: "advance"; id: string | null; history: string[] };

export function computeNextNavigation(
  input: MediaNavigationInput,
  strategy: MediaNavigationStrategy
): MediaNextDecision {
  const { items, currentId, loopCurrent, loopAll, isShuffled } = input;
  if (items.length === 0) return { kind: "empty" };

  let history = [...input.history];
  const shouldRecord =
    currentId !== null &&
    !loopCurrent &&
    (strategy.recordHistoryOnNext === "whenNotLoopingCurrent" || isShuffled);
  if (shouldRecord && currentId) {
    history = strategy.appendToHistory(input.history, currentId);
  }

  if (loopCurrent) {
    return { kind: "advance", id: currentId, history };
  }

  if (isShuffled) {
    return {
      kind: "advance",
      id: strategy.pickShuffleId(items, history, currentId),
      history,
    };
  }

  const currentIndex = findMediaIndexById(items, currentId);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % items.length;
  if (!loopAll && nextIndex === 0 && currentIndex !== -1) {
    return { kind: "stop", id: items[items.length - 1]?.id ?? null };
  }
  return { kind: "advance", id: items[nextIndex]?.id ?? null, history };
}

export function computePreviousNavigation(
  input: MediaNavigationInput,
  strategy: MediaNavigationStrategy
): MediaPreviousDecision {
  const { items, currentId, isShuffled } = input;
  if (items.length === 0) return { kind: "empty" };

  if (isShuffled && input.history.length > 0) {
    const lastId = input.history[input.history.length - 1];
    const exists =
      lastId !== undefined && items.some((item) => item.id === lastId);
    const acceptable =
      exists &&
      (!strategy.popRequiresDifferentFromCurrent || lastId !== currentId);
    if (acceptable) {
      return {
        kind: "advance",
        id: lastId,
        history: input.history.slice(0, -1),
      };
    }
    return {
      kind: "advance",
      id: strategy.pickShuffleId(items, input.history, currentId),
      history: [...input.history],
    };
  }

  if (isShuffled && strategy.previousWithoutHistory === "shuffle") {
    return {
      kind: "advance",
      id: strategy.pickShuffleId(items, input.history, currentId),
      history: [...input.history],
    };
  }

  const currentIndex = findMediaIndexById(items, currentId);
  const prevIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
  return {
    kind: "advance",
    id: items[prevIndex]?.id ?? null,
    history: [...input.history],
  };
}

// ============================================================================
// Canonical per-app strategies
// ============================================================================

export const IPOD_YOUTUBE_NAVIGATION: MediaNavigationStrategy = {
  recordHistoryOnNext: "whenNotLoopingCurrent",
  appendToHistory: dedupeAppendHistory,
  pickShuffleId: pickRandomIdAvoidingRecent,
  popRequiresDifferentFromCurrent: true,
  previousWithoutHistory: "sequential",
};

export const IPOD_APPLE_MUSIC_NAVIGATION: MediaNavigationStrategy = {
  recordHistoryOnNext: "shuffleOnly",
  appendToHistory: dedupeAppendHistory,
  pickShuffleId: pickRandomIdAvoidingRecent,
  popRequiresDifferentFromCurrent: true,
  previousWithoutHistory: "shuffle",
};

export const KARAOKE_NAVIGATION: MediaNavigationStrategy = {
  recordHistoryOnNext: "shuffleOnly",
  appendToHistory: appendHistory,
  pickShuffleId: (items, _history, currentId) =>
    pickRandomIdAvoidingCurrent(items, currentId),
  popRequiresDifferentFromCurrent: false,
  previousWithoutHistory: "sequential",
};
