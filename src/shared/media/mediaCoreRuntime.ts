/**
 * MediaCore runtime — feeds the now-playing bus and enforces the
 * single-active-playback policy across the four media transports.
 *
 * Arbitration: when any transport requests playback, every other transport
 * with an in-flight or confirmed request is stopped. Historically nothing
 * arbitrated, so the iPod and Videos could play over each other.
 *
 * This module imports the media stores, so it must only be loaded lazily
 * (see `MediaCoreRunner`) to keep them out of the boot chunk.
 */
import { useIpodStore } from "@/stores/useIpodStore";
import { useKaraokeStore } from "@/stores/useKaraokeStore";
import { useVideoStore } from "@/stores/useVideoStore";
import { useTvStore } from "@/stores/useTvStore";
import {
  type MediaAppId,
  type NowPlayingEntry,
  useNowPlayingStore,
} from "./nowPlayingStore";

interface TransportBinding {
  appId: MediaAppId;
  subscribe: (listener: () => void) => () => void;
  read: () => NowPlayingEntry;
  /** Stop playback without changing the current selection. */
  stop: () => void;
}

const bindings: TransportBinding[] = [
  {
    appId: "ipod",
    subscribe: (listener) => useIpodStore.subscribe(listener),
    read: () => {
      const s = useIpodStore.getState();
      const itemId =
        s.librarySource === "appleMusic"
          ? s.appleMusicCurrentSongId
          : s.currentSongId;
      return {
        itemId,
        isPlaying: s.isPlaying,
        playbackRequested: s.playbackRequested,
        hasSelection: itemId !== null,
      };
    },
    stop: () => useIpodStore.getState().setIsPlaying(false),
  },
  {
    appId: "karaoke",
    subscribe: (listener) => useKaraokeStore.subscribe(listener),
    read: () => {
      const s = useKaraokeStore.getState();
      return {
        itemId: s.currentSongId,
        isPlaying: s.isPlaying,
        playbackRequested: s.playbackRequested,
        hasSelection: s.currentSongId !== null,
      };
    },
    stop: () => useKaraokeStore.getState().setIsPlaying(false),
  },
  {
    appId: "videos",
    subscribe: (listener) => useVideoStore.subscribe(listener),
    read: () => {
      const s = useVideoStore.getState();
      return {
        itemId: s.currentVideoId,
        isPlaying: s.isPlaying,
        playbackRequested: s.playbackRequested,
        // Videos always has a default selection; only an active request
        // should surface it on the now-playing bus.
        hasSelection: s.playbackRequested,
      };
    },
    stop: () => useVideoStore.getState().setIsPlaying(false),
  },
  {
    appId: "tv",
    subscribe: (listener) => useTvStore.subscribe(listener),
    read: () => {
      const s = useTvStore.getState();
      return {
        itemId: s.currentChannelId,
        isPlaying: s.isPlaying,
        playbackRequested: s.playbackRequested,
        // TV is always tuned to some channel; same rule as Videos.
        hasSelection: s.playbackRequested,
      };
    },
    stop: () => useTvStore.getState().setIsPlaying(false),
  },
];

let runtimeCleanup: (() => void) | null = null;

/**
 * Start mirroring the four transports onto the now-playing bus and enforcing
 * single-active playback. Idempotent; returns a cleanup function.
 */
export function initMediaCoreRuntime(): () => void {
  if (runtimeCleanup) return runtimeCleanup;

  const updateEntry = useNowPlayingStore.getState().updateEntry;
  const lastRequested = new Map<MediaAppId, boolean>();
  let arbitrating = false;

  const pauseOthers = (winner: MediaAppId) => {
    // Re-entrancy guard: stopping a transport triggers its subscription
    // synchronously; those callbacks must not re-arbitrate.
    if (arbitrating) return;
    arbitrating = true;
    try {
      for (const binding of bindings) {
        if (binding.appId === winner) continue;
        const entry = binding.read();
        if (entry.playbackRequested || entry.isPlaying) {
          binding.stop();
          lastRequested.set(binding.appId, false);
          updateEntry(binding.appId, binding.read());
        }
      }
    } finally {
      arbitrating = false;
    }
  };

  const unsubscribers = bindings.map((binding) => {
    // Seed the bus (and the transition tracker) with the current state.
    const initial = binding.read();
    lastRequested.set(binding.appId, initial.playbackRequested);
    updateEntry(binding.appId, initial);

    return binding.subscribe(() => {
      const entry = binding.read();
      const wasRequested = lastRequested.get(binding.appId) ?? false;
      lastRequested.set(binding.appId, entry.playbackRequested);
      updateEntry(binding.appId, entry);
      if (!wasRequested && entry.playbackRequested && !arbitrating) {
        pauseOthers(binding.appId);
      }
    });
  });

  runtimeCleanup = () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
    useNowPlayingStore.getState().reset();
    runtimeCleanup = null;
  };
  return runtimeCleanup;
}
