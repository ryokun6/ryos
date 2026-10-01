/**
 * Mirrors the MediaCore transports (iPod, Karaoke, Videos, TV) onto the
 * native audio session (`nativeMediaSession`). Started by the MediaCore
 * runtime, so it shares that module's lazy-loading constraints.
 *
 * A paused player keeps its lock-screen entry only while its window is open.
 */
import type { RyosNowPlayingInfo } from "@/types/ryos-desktop";
import type { AppId } from "@/config/appRegistry";
import { useAppStore } from "@/stores/useAppStore";
import { getActiveIpodCurrentTrack, useIpodStore } from "@/stores/useIpodStore";
import { useKaraokeStore } from "@/stores/useKaraokeStore";
import { useVideoStore } from "@/stores/useVideoStore";
import { useTvStore } from "@/stores/useTvStore";
import {
  resolveAppleMusicArtworkUrl,
  resolveMediaCoverUrl,
} from "@/utils/coverArt";
import type { MediaAppId } from "./nowPlayingStore";
import {
  type NativeMediaSourceState,
  updateNativeMediaSource,
} from "./nativeMediaSession";
import { getTvNowPlaying, subscribeTvNowPlaying } from "./tvNowPlaying";

const ARTWORK_SIZE = 600;

type NowPlayingReader = () => RyosNowPlayingInfo | null;

/** Recompute only when one of the inputs changes identity (ticks don't). */
function memoNowPlaying(
  getInputs: () => readonly unknown[],
  compute: NowPlayingReader
): NowPlayingReader {
  let lastInputs: readonly unknown[] | null = null;
  let lastValue: RyosNowPlayingInfo | null = null;
  return () => {
    const inputs = getInputs();
    if (
      !lastInputs ||
      inputs.length !== lastInputs.length ||
      inputs.some((input, i) => !Object.is(input, lastInputs![i]))
    ) {
      lastInputs = inputs;
      lastValue = compute();
    }
    return lastValue;
  };
}

const readIpodNowPlaying = memoNowPlaying(
  () => {
    const s = useIpodStore.getState();
    return [
      s.librarySource,
      s.tracks,
      s.currentSongId,
      s.appleMusicTracks,
      s.appleMusicCurrentSongId,
      s.appleMusicKitNowPlaying,
      s.totalTime,
    ];
  },
  () => {
    const s = useIpodStore.getState();
    const track = getActiveIpodCurrentTrack(s);
    const kit = s.librarySource === "appleMusic" ? s.appleMusicKitNowPlaying : null;
    const title = kit?.title ?? track?.title;
    if (!title) return null;
    const isAppleMusic = track?.source === "appleMusic" || (!track && kit);
    const artworkUrl = isAppleMusic
      ? resolveAppleMusicArtworkUrl(kit?.cover ?? track?.cover, ARTWORK_SIZE)
      : resolveMediaCoverUrl(track, {
          kugouSize: ARTWORK_SIZE,
          youtubeQuality: "hqdefault",
        });
    return {
      title,
      artist: kit?.artist ?? track?.artist,
      album: kit?.album ?? track?.album,
      durationSeconds:
        s.totalTime > 0
          ? s.totalTime
          : track?.durationMs
            ? track.durationMs / 1000
            : undefined,
      artworkUrl: artworkUrl ?? undefined,
    };
  }
);

const readKaraokeNowPlaying = memoNowPlaying(
  () => {
    const s = useKaraokeStore.getState();
    return [s.currentSongId, s.totalTime, useIpodStore.getState().tracks];
  },
  () => {
    const s = useKaraokeStore.getState();
    const track = s.currentSongId ? s.getCurrentTrack() : null;
    if (!track) return null;
    return {
      title: track.title,
      artist: track.artist,
      album: track.album,
      durationSeconds: s.totalTime > 0 ? s.totalTime : undefined,
      artworkUrl:
        resolveMediaCoverUrl(track, {
          kugouSize: ARTWORK_SIZE,
          youtubeQuality: "hqdefault",
        }) ?? undefined,
    };
  }
);

const readVideosNowPlaying = memoNowPlaying(
  () => {
    const s = useVideoStore.getState();
    return [s.videos, s.currentVideoId];
  },
  () => {
    const video = useVideoStore.getState().getCurrentVideo();
    if (!video) return null;
    return {
      title: video.title,
      artist: video.artist,
      artworkUrl:
        resolveMediaCoverUrl(video, { youtubeQuality: "hqdefault" }) ??
        undefined,
    };
  }
);

interface NativeBinding {
  appId: MediaAppId;
  subscribe: (listener: () => void) => () => void;
  read: () => { playing: boolean; position: number };
  nowPlaying: NowPlayingReader;
}

const bindings: NativeBinding[] = [
  {
    appId: "ipod",
    subscribe: (listener) => useIpodStore.subscribe(listener),
    read: () => {
      const s = useIpodStore.getState();
      return { playing: s.isPlaying, position: s.elapsedTime };
    },
    nowPlaying: readIpodNowPlaying,
  },
  {
    appId: "karaoke",
    subscribe: (listener) => useKaraokeStore.subscribe(listener),
    read: () => {
      const s = useKaraokeStore.getState();
      return { playing: s.isPlaying, position: s.elapsedTime };
    },
    nowPlaying: readKaraokeNowPlaying,
  },
  {
    appId: "videos",
    subscribe: (listener) => useVideoStore.subscribe(listener),
    read: () => {
      const s = useVideoStore.getState();
      return { playing: s.isPlaying, position: s.playedSeconds };
    },
    nowPlaying: readVideosNowPlaying,
  },
  {
    appId: "tv",
    subscribe: (listener) => {
      const unsubscribeStore = useTvStore.subscribe(listener);
      const unsubscribeNowPlaying = subscribeTvNowPlaying(listener);
      return () => {
        unsubscribeStore();
        unsubscribeNowPlaying();
      };
    },
    read: () => {
      const s = useTvStore.getState();
      return { playing: s.isPlaying, position: s.playedSeconds };
    },
    nowPlaying: getTvNowPlaying,
  },
];

function isAppWindowOpen(appId: AppId): boolean {
  const { instances } = useAppStore.getState();
  for (const id in instances) {
    const instance = instances[id];
    if (instance.appId === appId && instance.isOpen) return true;
  }
  return false;
}

function readSourceState(binding: NativeBinding): NativeMediaSourceState {
  const { playing, position } = binding.read();
  const visible = playing || isAppWindowOpen(binding.appId);
  return {
    playing,
    nowPlaying: visible ? binding.nowPlaying() : null,
    positionSeconds: position,
  };
}

export function sourceIdForMediaApp(appId: MediaAppId): string {
  return `mediacore:${appId}`;
}

/** Start mirroring; returns a cleanup that removes the MediaCore sources. */
export function initNativeMediaCoreSync(): () => void {
  const syncBinding = (binding: NativeBinding) =>
    updateNativeMediaSource(
      sourceIdForMediaApp(binding.appId),
      readSourceState(binding)
    );

  const unsubscribers = bindings.map((binding) => {
    syncBinding(binding);
    return binding.subscribe(() => syncBinding(binding));
  });

  let lastInstances = useAppStore.getState().instances;
  unsubscribers.push(
    useAppStore.subscribe((state) => {
      if (state.instances === lastInstances) return;
      lastInstances = state.instances;
      for (const binding of bindings) syncBinding(binding);
    })
  );

  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
    for (const binding of bindings) {
      updateNativeMediaSource(sourceIdForMediaApp(binding.appId), null);
    }
  };
}
