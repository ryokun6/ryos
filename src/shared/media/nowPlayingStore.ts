/**
 * MediaCore now-playing bus.
 *
 * A single answer to "which media app is driving playback right now".
 * Fed by `mediaCoreRuntime.ts` (which subscribes to the iPod, Karaoke,
 * Videos, and TV stores); consumed by cross-app surfaces like the dynamic
 * wallpaper and, later, the unified `mediaControl` AI tool.
 *
 * This module deliberately imports no app stores so it can be consumed from
 * boot-time code without pulling the media apps into the boot chunk.
 */
import { create } from "zustand";

export type MediaAppId = "ipod" | "karaoke" | "videos" | "tv";

/** Tie-break order: music surfaces win over video surfaces. */
export const MEDIA_APP_PRIORITY: readonly MediaAppId[] = [
  "ipod",
  "karaoke",
  "videos",
  "tv",
];

export interface NowPlayingEntry {
  /** Current item id (track / video / channel) or null. */
  itemId: string | null;
  /** Confirmed playback (provider emitted a play event). */
  isPlaying: boolean;
  /** Desired player state, including an in-flight play attempt. */
  playbackRequested: boolean;
  /** Whether the app has something selected to show/play. */
  hasSelection: boolean;
}

const EMPTY_ENTRY: NowPlayingEntry = {
  itemId: null,
  isPlaying: false,
  playbackRequested: false,
  hasSelection: false,
};

export interface NowPlayingState {
  entries: Record<MediaAppId, NowPlayingEntry>;
  /**
   * The app currently driving playback: the highest-priority playing app,
   * falling back to the highest-priority app with a selection (so paused
   * players keep surfaces like the cover wallpaper alive).
   */
  activeAppId: MediaAppId | null;
  updateEntry: (appId: MediaAppId, entry: NowPlayingEntry) => void;
  reset: () => void;
}

function deriveActiveAppId(
  entries: Record<MediaAppId, NowPlayingEntry>
): MediaAppId | null {
  for (const appId of MEDIA_APP_PRIORITY) {
    if (entries[appId].isPlaying) return appId;
  }
  for (const appId of MEDIA_APP_PRIORITY) {
    if (entries[appId].hasSelection) return appId;
  }
  return null;
}

function entriesEqual(a: NowPlayingEntry, b: NowPlayingEntry): boolean {
  return (
    a.itemId === b.itemId &&
    a.isPlaying === b.isPlaying &&
    a.playbackRequested === b.playbackRequested &&
    a.hasSelection === b.hasSelection
  );
}

const initialEntries: Record<MediaAppId, NowPlayingEntry> = {
  ipod: EMPTY_ENTRY,
  karaoke: EMPTY_ENTRY,
  videos: EMPTY_ENTRY,
  tv: EMPTY_ENTRY,
};

export const useNowPlayingStore = create<NowPlayingState>()((set) => ({
  entries: initialEntries,
  activeAppId: null,
  updateEntry: (appId, entry) =>
    set((state) => {
      if (entriesEqual(state.entries[appId], entry)) return state;
      const entries = { ...state.entries, [appId]: entry };
      return { entries, activeAppId: deriveActiveAppId(entries) };
    }),
  reset: () => set({ entries: initialEntries, activeAppId: null }),
}));
