import { useEffect } from "react";
import { create } from "zustand";

/**
 * Tiny always-loaded bridge holding the now-playing cover URL for consumers on
 * the boot-critical path (e.g. the Aqua Glass menubar tone sampler).
 *
 * Reading the cover directly via `useNowPlayingCover` would statically pull the
 * full iPod + Karaoke store stack into the entry bundle. Instead, the lazily
 * loaded cover / lyrics wallpaper layers (the only states in which a cover can
 * be the wallpaper) publish the URL here, and light consumers subscribe to
 * this bridge.
 */
interface NowPlayingCoverBridgeState {
  coverUrl: string | null;
  setCoverUrl: (coverUrl: string | null) => void;
}

export const useNowPlayingCoverBridge = create<NowPlayingCoverBridgeState>(
  (set) => ({
    coverUrl: null,
    setCoverUrl: (coverUrl) =>
      set((s) => (s.coverUrl === coverUrl ? s : { coverUrl })),
  })
);

/** Publish `coverUrl` to the bridge while mounted; clears it on unmount. */
export function usePublishNowPlayingCover(coverUrl: string | null) {
  const setCoverUrl = useNowPlayingCoverBridge((s) => s.setCoverUrl);
  useEffect(() => {
    setCoverUrl(coverUrl);
    return () => setCoverUrl(null);
  }, [coverUrl, setCoverUrl]);
}
