import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import ReactPlayer from "react-player";
import { useTranslation } from "react-i18next";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useTvStore } from "@/stores/useTvStore";
import { useIpodStore, type Track } from "@/stores/useIpodStore";
import { useVideoStore, type Video } from "@/stores/useVideoStore";
import { useThemeStore } from "@/stores/useThemeStore";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { helpItems } from "..";
import { buildTvChannelLineup, type Channel } from "@/apps/tv/data/channels";
import {
  isYouTubeUrl,
  nextIndex,
  prevIndex,
  randomTuneInOffset,
  shuffleArray,
} from "@/apps/tv/utils";
import { isMobileSafari } from "@/utils/device";

export const MTV_CHANNEL_ID = "mtv";
export const RYO_TV_CHANNEL_ID = "ryos-picks";

function trackToVideo(track: Track): Video {
  return {
    id: track.id,
    url: track.url,
    title: track.title,
    artist: track.artist,
  };
}

export interface UseTvLogicOptions {
  isWindowOpen: boolean;
  isForeground?: boolean;
}

export function useTvLogic({ isWindowOpen, isForeground }: UseTvLogicOptions) {
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("tv", helpItems);

  const currentChannelId = useTvStore((s) => s.currentChannelId);
  const setCurrentChannelId = useTvStore((s) => s.setCurrentChannelId);
  const lastVideoIndexByChannel = useTvStore((s) => s.lastVideoIndexByChannel);
  const setVideoIndex = useTvStore((s) => s.setVideoIndex);
  const isPlaying = useTvStore((s) => s.isPlaying);
  const setIsPlaying = useTvStore((s) => s.setIsPlaying);
  const togglePlayStore = useTvStore((s) => s.togglePlay);
  const customChannels = useTvStore((s) => s.customChannels);

  // Built-in channels first, then customs; numbers follow list order (1-based).
  const channels = useMemo(
    (): Channel[] => buildTvChannelLineup(customChannels),
    [customChannels]
  );

  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOSTheme = currentTheme === "macosx";
  const masterVolume = useAudioSettingsStore((state) => state.masterVolume);

  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [playedSeconds, setPlayedSeconds] = useState(0);
  const [isVideoHovered, setIsVideoHovered] = useState(false);
  const [animationDirection, setAnimationDirection] = useState<"next" | "prev">(
    "next"
  );
  const [elapsedTime, setElapsedTime] = useState(0);
  const [isDraggingSeek, setIsDraggingSeek] = useState(false);
  const [dragSeekTime, setDragSeekTime] = useState(0);

  // Mobile Safari blocks autoplay until the user explicitly taps. Detect
  // once on mount so we can leave the TV "powered off" on open and let the
  // user wake it up via the play button (mirrors the iPod / Karaoke
  // pattern in `useIpodLogic` / `useKaraokeLogic`).
  const isMobileSafariDevice = useRef(isMobileSafari()).current;

  const playerRef = useRef<ReactPlayer | null>(null);
  const fullScreenPlayerRef = useRef<ReactPlayer | null>(null);
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRandomSeekedIdRef = useRef<string | null>(null);
  const channelDigitBufferRef = useRef<string>("");
  const channelDigitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const hasForcedPlayOnOpenRef = useRef(false);
  // Whether the next time we learn a video's duration we should jump to a
  // random offset ("tune in mid-program"). True on initial load + manual
  // skip + channel switch; flipped to false when a video advances because
  // it ended naturally, so the *following* video plays from 0.
  const tuneInRandomlyOnNextDurationRef = useRef(true);

  const ipodTracks = useIpodStore((s) => s.tracks);
  const videosLibrary = useVideoStore((s) => s.videos);

  const currentChannel = useMemo((): Channel => {
    const base =
      channels.find((c) => c.id === currentChannelId) ?? channels[0];
    // Built-in channels that mirror another app's library: MTV plays the
    // iPod tracks, Ryo TV plays the user's Videos app library. Custom and
    // other built-in channels keep their static `videos` array.
    let rawSource: Video[];
    if (base.id === MTV_CHANNEL_ID) {
      rawSource = ipodTracks.map(trackToVideo);
    } else if (base.id === RYO_TV_CHANNEL_ID) {
      rawSource = videosLibrary;
    } else {
      rawSource = base.videos;
    }
    // Only YouTube-embeddable videos are playable through ReactPlayer's
    // YouTube driver. Filter at the source so MTV / Ryo TV (which pull
    // from other stores) and any future channel can't smuggle in
    // non-YouTube URLs.
    const source = rawSource.filter((v) => isYouTubeUrl(v.url));
    return {
      ...base,
      videos: shuffleArray(source),
    };
  }, [channels, currentChannelId, ipodTracks, videosLibrary]);

  const videoIndex = lastVideoIndexByChannel[currentChannelId] ?? 0;

  const currentVideo = useMemo(() => {
    const list = currentChannel?.videos ?? [];
    if (list.length === 0) return null;
    const idx = Math.min(Math.max(0, videoIndex), list.length - 1);
    return list[idx] ?? list[0];
  }, [currentChannel, videoIndex]);

  const nextVideoInSchedule = useMemo(() => {
    const list = currentChannel?.videos ?? [];
    if (list.length === 0) return null;
    return list[nextIndex(videoIndex, list.length)] ?? null;
  }, [currentChannel, videoIndex]);

  const scheduleNowTitle = useMemo(() => {
    if (!currentVideo) return "";
    return currentVideo.artist
      ? `${currentVideo.title} — ${currentVideo.artist}`
      : currentVideo.title;
  }, [currentVideo]);

  const scheduleNextTitle = useMemo(() => {
    if (!nextVideoInSchedule) return "";
    return nextVideoInSchedule.artist
      ? `${nextVideoInSchedule.title} — ${nextVideoInSchedule.artist}`
      : nextVideoInSchedule.title;
  }, [nextVideoInSchedule]);

  const showStatus = useCallback((message: string) => {
    setStatusMessage(message);
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
    statusTimeoutRef.current = setTimeout(() => setStatusMessage(null), 2000);
  }, []);

  const setChannelById = useCallback(
    (id: string) => {
      // Look up via store + defaults instead of the closed-over `channels`
      // memo. After `addCustomChannel`, the Zustand store is updated
      // synchronously, but React hasn't re-rendered the parent yet, so a
      // closure on `channels` would miss a freshly-created channel and
      // silently no-op when callers tune in to it.
      const ch = buildTvChannelLineup(
        useTvStore.getState().customChannels
      ).find((c) => c.id === id);
      if (!ch) return;
      // Cancel any in-flight digit buffer so a partial channel number from
      // the keyboard doesn't merge with the next press after a manual switch.
      channelDigitBufferRef.current = "";
      if (channelDigitTimeoutRef.current) {
        clearTimeout(channelDigitTimeoutRef.current);
        channelDigitTimeoutRef.current = null;
      }
      // Channel changes always tune in mid-program, even right after a
      // natural end-of-video rollover that flipped the flag off.
      tuneInRandomlyOnNextDurationRef.current = true;
      setCurrentChannelId(id);
      setIsPlaying(true);
      showStatus(
        t("apps.tv.channelBadge", {
          number: String(ch.number).padStart(2, "0"),
          name: ch.name,
        })
      );
    },
    [setCurrentChannelId, setIsPlaying, showStatus, t]
  );

  const setChannelByNumber = useCallback(
    (num: number) => {
      const ch = channels.find((c) => c.number === num);
      if (ch) setChannelById(ch.id);
    },
    [channels, setChannelById]
  );

  const nextChannel = useCallback(() => {
    setAnimationDirection("next");
    const idx = channels.findIndex((c) => c.id === currentChannelId);
    const next = channels[nextIndex(idx, channels.length)] as Channel;
    setChannelById(next.id);
  }, [channels, currentChannelId, setChannelById]);

  const prevChannel = useCallback(() => {
    setAnimationDirection("prev");
    const idx = channels.findIndex((c) => c.id === currentChannelId);
    const prev = channels[prevIndex(idx, channels.length)] as Channel;
    setChannelById(prev.id);
  }, [channels, currentChannelId, setChannelById]);

  // Internal advancer used by both manual skip (tuneInRandomly=true) and
  // the natural end-of-video rollover (tuneInRandomly=false). Setting the
  // ref at the call site avoids races where two transitions overlap and a
  // stale flag from one would otherwise be picked up by the other.
  const advanceVideo = useCallback(
    (direction: "next" | "prev", tuneInRandomly: boolean) => {
      const list = currentChannel?.videos ?? [];
      if (list.length === 0) return;
      setAnimationDirection(direction);
      tuneInRandomlyOnNextDurationRef.current = tuneInRandomly;
      const nextIdx =
        direction === "next"
          ? nextIndex(videoIndex, list.length)
          : prevIndex(videoIndex, list.length);
      setVideoIndex(currentChannelId, nextIdx);
      setIsPlaying(true);
    },
    [currentChannel, videoIndex, currentChannelId, setVideoIndex, setIsPlaying]
  );

  const nextVideo = useCallback(() => {
    advanceVideo("next", true);
  }, [advanceVideo]);

  const prevVideo = useCallback(() => {
    advanceVideo("prev", true);
  }, [advanceVideo]);

  const handleVideoEnd = useCallback(() => {
    // Natural rollover: the broadcast metaphor breaks if every auto-advance
    // dropped the viewer 30s into the next program, so the upcoming video
    // should play from the start.
    advanceVideo("next", false);
  }, [advanceVideo]);

  const togglePlay = useCallback(() => {
    togglePlayStore();
  }, [togglePlayStore]);

  const toggleFullScreen = useCallback(() => {
    setIsFullScreen((v) => !v);
  }, []);

  const formatTime = useCallback((seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${String(minutes).padStart(2, "0")}:${String(
      remainingSeconds
    ).padStart(2, "0")}`;
  }, []);

  const handleProgress = useCallback(
    (state: { playedSeconds: number }) => {
      setPlayedSeconds(state.playedSeconds);
      setElapsedTime(Math.floor(state.playedSeconds));
    },
    []
  );

  const handleDuration = useCallback(
    (d: number) => {
      setDuration(d);
      const id = currentVideo?.id;
      if (!id || lastRandomSeekedIdRef.current === id) return;
      lastRandomSeekedIdRef.current = id;
      // Reset the flag for the *next* duration event regardless of which
      // branch we take, so a future natural rollover won't be inherited.
      const shouldTuneInRandomly = tuneInRandomlyOnNextDurationRef.current;
      tuneInRandomlyOnNextDurationRef.current = true;
      if (!shouldTuneInRandomly) return;
      // Tune in mid-program: seek to a random offset for the first time we
      // learn this video's duration. `randomTuneInOffset` returns null for
      // live streams (Infinity), unknown durations (NaN / 0), and short
      // clips, so we transparently skip in those cases.
      const start = randomTuneInOffset(d);
      if (start !== null) {
        playerRef.current?.seekTo(start, "seconds");
        fullScreenPlayerRef.current?.seekTo(start, "seconds");
      }
    },
    [currentVideo?.id]
  );

  const handleSeek = useCallback((time: number) => {
    playerRef.current?.seekTo(time);
    fullScreenPlayerRef.current?.seekTo(time);
  }, []);

  // If a video errors out (geo-block, age-gate, removed, etc.), advance to
  // the next entry on the channel rather than stalling on a black frame.
  const handleError = useCallback(() => {
    const list = currentChannel?.videos ?? [];
    if (list.length <= 1) return;
    setVideoIndex(currentChannelId, nextIndex(videoIndex, list.length));
    setIsPlaying(true);
  }, [currentChannel, videoIndex, currentChannelId, setVideoIndex, setIsPlaying]);

  // Force-play once per window-open, not on every render where it stays open,
  // so a user's manual pause survives until the window is closed. Skip on
  // mobile Safari, which blocks autoplay until the user explicitly taps —
  // forcing isPlaying=true there just produces a paused-but-claiming-to-
  // play UI; instead we leave the TV powered off and let the user wake it
  // up via the play button.
  useEffect(() => {
    if (!isWindowOpen) {
      hasForcedPlayOnOpenRef.current = false;
      return;
    }
    if (hasForcedPlayOnOpenRef.current) return;
    hasForcedPlayOnOpenRef.current = true;
    if (isMobileSafariDevice) {
      setIsPlaying(false);
      return;
    }
    setIsPlaying(true);
  }, [isWindowOpen, setIsPlaying, isMobileSafariDevice]);

  // Clear any pending status / digit-buffer timers when the hook unmounts so
  // they don't try to set state on an unmounted tree.
  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
        statusTimeoutRef.current = null;
      }
      if (channelDigitTimeoutRef.current) {
        clearTimeout(channelDigitTimeoutRef.current);
        channelDigitTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isForeground || !isWindowOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        prevChannel();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        nextChannel();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevVideo();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nextVideo();
      } else if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (/^[0-9]$/.test(e.key)) {
        channelDigitBufferRef.current += e.key;
        if (channelDigitTimeoutRef.current) {
          clearTimeout(channelDigitTimeoutRef.current);
        }
        channelDigitTimeoutRef.current = setTimeout(() => {
          const n = parseInt(channelDigitBufferRef.current, 10);
          channelDigitBufferRef.current = "";
          if (!Number.isNaN(n)) setChannelByNumber(n);
        }, 400);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    isForeground,
    isWindowOpen,
    nextChannel,
    prevChannel,
    nextVideo,
    prevVideo,
    togglePlay,
    setChannelByNumber,
  ]);

  return {
    t,
    translatedHelpItems,
    isXpTheme,
    isMacOSTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isFullScreen,
    setIsFullScreen,
    toggleFullScreen,
    isPlaying,
    setIsPlaying,
    togglePlay,
    currentChannel,
    currentVideo,
    currentChannelId,
    setChannelById,
    nextChannel,
    prevChannel,
    nextVideo,
    prevVideo,
    handleVideoEnd,
    handleError,
    playerRef,
    fullScreenPlayerRef,
    masterVolume,
    handleProgress,
    handleDuration,
    handleSeek,
    playedSeconds,
    duration,
    isVideoHovered,
    setIsVideoHovered,
    statusMessage,
    showStatus,
    channels,
    animationDirection,
    elapsedTime,
    videoIndex,
    formatTime,
    isDraggingSeek,
    setIsDraggingSeek,
    dragSeekTime,
    setDragSeekTime,
    scheduleNowTitle,
    scheduleNextTitle,
  };
}
