/** Shared playlist playback FSM helpers for media stores. */

export interface PlaylistItem {
  id: string;
}

export interface PlaylistPlaybackState {
  loopAll: boolean;
  loopCurrent: boolean;
  isShuffled: boolean;
  playbackHistory: string[];
}

export function getIndexFromId<T extends PlaylistItem>(
  items: T[],
  currentId: string | null
): number {
  if (!currentId || items.length === 0) return -1;
  const index = items.findIndex((item) => item.id === currentId);
  return index >= 0 ? index : -1;
}

export function getRandomItemIdAvoidingCurrent<T extends PlaylistItem>(
  items: T[],
  currentId: string | null
): string | null {
  if (items.length === 0) return null;
  if (items.length === 1) return items[0].id;

  const availableIds = items.reduce<string[]>((acc, item) => {
    if (item.id !== currentId) {
      acc.push(item.id);
    }
    return acc;
  }, []);
  if (availableIds.length === 0) return currentId;
  return availableIds[Math.floor(Math.random() * availableIds.length)];
}

export function appendToPlaybackHistory(
  playbackHistory: string[],
  itemId: string,
  maxHistory = 50
): string[] {
  return [...playbackHistory, itemId].slice(-maxHistory);
}

export interface ComputeNextIdResult {
  nextId: string | null;
  playbackHistory: string[];
  stopPlaying?: boolean;
}

/**
 * Advance to the next playlist item (karaoke-style boundaries: stop at end
 * when loopAll is off).
 */
export function computeNextPlaylistId<T extends PlaylistItem>(params: {
  items: T[];
  currentId: string | null;
  loopAll: boolean;
  loopCurrent: boolean;
  isShuffled: boolean;
  playbackHistory: string[];
}): ComputeNextIdResult {
  const { items, currentId, loopAll, loopCurrent, isShuffled, playbackHistory } =
    params;

  if (items.length === 0) {
    return { nextId: null, playbackHistory };
  }

  if (loopCurrent) {
    return { nextId: currentId, playbackHistory };
  }

  let newPlaybackHistory = playbackHistory;
  let nextId: string | null;

  if (isShuffled) {
    if (currentId) {
      newPlaybackHistory = appendToPlaybackHistory(playbackHistory, currentId);
    }
    nextId = getRandomItemIdAvoidingCurrent(items, currentId);
  } else {
    const currentIndex = getIndexFromId(items, currentId);
    const nextIndex = currentIndex === -1 ? 0 : currentIndex + 1;

    if (nextIndex >= items.length) {
      if (loopAll) {
        nextId = items[0]?.id ?? null;
      } else {
        return {
          nextId: items[items.length - 1]?.id ?? null,
          playbackHistory,
          stopPlaying: true,
        };
      }
    } else {
      nextId = items[nextIndex]?.id ?? null;
    }
  }

  return { nextId, playbackHistory: newPlaybackHistory };
}

export interface ComputePreviousIdResult {
  prevId: string | null;
  playbackHistory: string[];
}

/**
 * Go to the previous playlist item (karaoke-style: shuffle uses history,
 * sequential wraps to the last item).
 */
export function computePreviousPlaylistId<T extends PlaylistItem>(params: {
  items: T[];
  currentId: string | null;
  isShuffled: boolean;
  playbackHistory: string[];
}): ComputePreviousIdResult {
  const { items, currentId, isShuffled, playbackHistory } = params;

  if (items.length === 0) {
    return { prevId: null, playbackHistory };
  }

  let prevId: string | null;
  let newPlaybackHistory = playbackHistory;

  if (isShuffled && playbackHistory.length > 0) {
    const lastItemId = playbackHistory[playbackHistory.length - 1];
    if (lastItemId && items.some((item) => item.id === lastItemId)) {
      prevId = lastItemId;
      newPlaybackHistory = playbackHistory.slice(0, -1);
    } else {
      prevId = getRandomItemIdAvoidingCurrent(items, currentId);
    }
  } else {
    const currentIndex = getIndexFromId(items, currentId);
    const prevIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
    prevId = items[prevIndex]?.id ?? null;
  }

  return { prevId, playbackHistory: newPlaybackHistory };
}

export function toggleShufflePlaylistState(
  state: Pick<PlaylistPlaybackState, "isShuffled" | "playbackHistory">
): Pick<PlaylistPlaybackState, "isShuffled" | "playbackHistory"> {
  const isShuffled = !state.isShuffled;
  return {
    isShuffled,
    playbackHistory: isShuffled ? [] : state.playbackHistory,
  };
}

export interface PlaylistPlaybackSlice<TId extends string | null = string | null> {
  loopAll: boolean;
  loopCurrent: boolean;
  isShuffled: boolean;
  playbackHistory: string[];
  currentId: TId;
  getCurrentIndex: <T extends PlaylistItem>(items: T[]) => number;
  nextId: <T extends PlaylistItem>(items: T[]) => ComputeNextIdResult;
  previousId: <T extends PlaylistItem>(items: T[]) => ComputePreviousIdResult;
  toggleShuffle: () => Pick<PlaylistPlaybackState, "isShuffled" | "playbackHistory">;
  toggleLoopAll: () => Pick<PlaylistPlaybackState, "loopAll">;
  toggleLoopCurrent: () => Pick<PlaylistPlaybackState, "loopCurrent">;
}

/**
 * Bind shared playlist playback helpers to a zustand-like getter.
 * Stores keep their own field names; this only centralizes the FSM math.
 */
export function createPlaylistPlaybackSlice<TId extends string | null>(
  get: () => PlaylistPlaybackState & { currentId: TId }
): PlaylistPlaybackSlice<TId> {
  return {
    get loopAll() {
      return get().loopAll;
    },
    get loopCurrent() {
      return get().loopCurrent;
    },
    get isShuffled() {
      return get().isShuffled;
    },
    get playbackHistory() {
      return get().playbackHistory;
    },
    get currentId() {
      return get().currentId;
    },
    getCurrentIndex<T extends PlaylistItem>(items: T[]) {
      return getIndexFromId(items, get().currentId);
    },
    nextId<T extends PlaylistItem>(items: T[]) {
      const state = get();
      return computeNextPlaylistId({
        items,
        currentId: state.currentId,
        loopAll: state.loopAll,
        loopCurrent: state.loopCurrent,
        isShuffled: state.isShuffled,
        playbackHistory: state.playbackHistory,
      });
    },
    previousId<T extends PlaylistItem>(items: T[]) {
      const state = get();
      return computePreviousPlaylistId({
        items,
        currentId: state.currentId,
        isShuffled: state.isShuffled,
        playbackHistory: state.playbackHistory,
      });
    },
    toggleShuffle() {
      return toggleShufflePlaylistState(get());
    },
    toggleLoopAll() {
      return { loopAll: !get().loopAll };
    },
    toggleLoopCurrent() {
      return { loopCurrent: !get().loopCurrent };
    },
  };
}
