import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";
import ReactPlayer from "react-player";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { track } from "@/utils/analytics";
import { useIpodStore, Track, isAppleMusicCollectionTrack } from "@/stores/useIpodStore";
import { useLibraryUpdateChecker } from "./useLibraryUpdateChecker";
import { useMusicKit } from "@/hooks/useMusicKit";
import { useAppleMusicLibrary } from "./useAppleMusicLibrary";
import { IPOD_ANALYTICS } from "@/utils/analytics";
import { formatSecondsAsMinutesSeconds } from "@/utils/timeFormat";
import { IS_IOS, IS_SAFARI, IS_IOS_SAFARI, BACKLIGHT_TIMEOUT_BY_SETTING } from "./ipodLogicConstants";
import type { IpodInitialData } from "../../base/types";

export interface UseIpodPlaybackOptions {
  isWindowOpen: boolean;
  isForeground: boolean | undefined;
  isFullScreen: boolean;
  isAppleMusic: boolean;
  appleMusicCurrentSongId: string | null;
  isPlaying: boolean;
  loopCurrent: boolean;
  tracks: Track[];
  currentIndex: number;
  toggleBacklight: () => void;
  setIsPlaying: (playing: boolean) => void;
  setLibrarySource: (source: "youtube" | "appleMusic") => void;
  setYoutubeCurrentSongId: (id: string) => void;
  rawNextTrack: () => void;
  rawPreviousTrack: () => void;
  isOffline: boolean;
  /** Games open state — backlight timer skips dimming while a mini-game runs. */
  isMusicQuizOpen: boolean;
  isBrickGameOpen: boolean;
  backlightOn: boolean;
  backlightTimeout: import("@/stores/useIpodStore").IpodBacklightTimeout;
  initialData: IpodInitialData | undefined;
  instanceId: string | undefined;
  clearIpodInitialData: (instanceId: string) => void;
  lastProcessedInitialDataRef: React.MutableRefObject<unknown>;
  lyricOffset: number;
  setMenuMode: (value: boolean | ((prev: boolean) => boolean)) => void;
}

export function useIpodPlayback({
  isWindowOpen,
  isForeground,
  isFullScreen,
  isAppleMusic,
  isPlaying,
  loopCurrent,
  tracks,
  currentIndex,
  toggleBacklight,
  setIsPlaying,
  setLibrarySource,
  setYoutubeCurrentSongId,
  rawNextTrack,
  rawPreviousTrack,
  isOffline,
  appleMusicCurrentSongId,
  isMusicQuizOpen,
  isBrickGameOpen,
  backlightOn,
  backlightTimeout,
  initialData,
  instanceId,
  clearIpodInitialData,
  lastProcessedInitialDataRef,
  lyricOffset,
  setMenuMode,
}: UseIpodPlaybackOptions) {
  const { t, i18n } = useTranslation();
  const menuLocale = i18n.resolvedLanguage ?? i18n.language;
  const prevIsForeground = useRef(isForeground);
  const [isAddingSong, setIsAddingSong] = useState(false);
  const isIOS = IS_IOS;
  const isSafari = IS_SAFARI;
  const isIOSSafari = IS_IOS_SAFARI;

    // ---------------------------------------------------------------------
    // MusicKit (Apple Music) integration
    // ---------------------------------------------------------------------
    // Lazily configure MusicKit only after the iPod window is open at least
    // once OR the user has already opted into Apple Music. This avoids
    // pulling the v3 script on first paint for users that never use the
    // Apple Music mode.
    const enableMusicKit =
      isAppleMusic || isWindowOpen || appleMusicCurrentSongId !== null;
    const {
      instance: musicKitInstance,
      isAuthorized: appleMusicAuthorized,
      status: musicKitStatus,
      authorize: musicKitAuthorize,
      unauthorize: musicKitUnauthorize,
    } = useMusicKit({ enabled: enableMusicKit });
    const musicKitInstanceRef = useRef(musicKitInstance);
    musicKitInstanceRef.current = musicKitInstance;

    // Auto-load library after auth + when Apple Music is the active source.
    const { refresh: refreshAppleMusicLibrary } = useAppleMusicLibrary({
      enabled: enableMusicKit,
      isAuthorized: appleMusicAuthorized,
    });

    const radioMenuTitleForRestore = t("apps.ipod.menuItems.radio", "Radio");
    const [shouldHydrateRadioOnRestore] = useState(() => {
      const state = useIpodStore.getState();
      const currentAppleMusicTrack = state.appleMusicCurrentSongId
        ? state.appleMusicTracks.find(
            (track) => track.id === state.appleMusicCurrentSongId
          )
        : null;
      return Boolean(
        state.librarySource === "appleMusic" &&
          (currentAppleMusicTrack?.appleMusicPlayParams?.stationId ||
            state.ipodMenuBreadcrumb?.some(
              (entry) =>
                entry.kind === "radio" ||
                entry.title === radioMenuTitleForRestore ||
                entry.title === "Radio"
            ))
      );
    });
    const shouldHydrateRadioOnRestoreRef = useRef(
      shouldHydrateRadioOnRestore
    );
    const [appleMusicRadioTracks, setAppleMusicRadioTracks] = useState<Track[]>(
      []
    );
    const [isAppleMusicRadioLoading, setIsAppleMusicRadioLoading] = useState(
      shouldHydrateRadioOnRestore
    );
    const hasAttemptedRadioRestoreHydrationRef = useRef(false);
    const [isAppleMusicGeniusLoading, setIsAppleMusicGeniusLoading] =
      useState(false);

    const [lastActivityTime, setLastActivityTime] = useState(() => Date.now());
    const backlightTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const userHasInteractedRef = useRef(false);

    const elapsedTime = useIpodStore((s) => s.elapsedTime);
    const [totalTime, setTotalTime] = useState(0);
    const playerRef = useRef<ReactPlayer | null>(null);
    const fullScreenPlayerRef = useRef<ReactPlayer | null>(null);
    const lastTrackedSongRef = useRef<{ trackId: string; elapsedTime: number } | null>(null);
    const skipOperationRef = useRef(false);

    const pauseBeforeWindowClose = useCallback(() => {
      const store = useIpodStore.getState();
      const activePlayer = isFullScreen
        ? fullScreenPlayerRef.current
        : playerRef.current;
      const playerTime = activePlayer?.getCurrentTime?.();
      const internalPlayer = (
        activePlayer as unknown as
          | {
              getInternalPlayer?: () => unknown;
            }
          | null
          | undefined
      )?.getInternalPlayer?.();
      const musicKitTime =
        typeof (internalPlayer as { currentPlaybackTime?: unknown } | null)
          ?.currentPlaybackTime === "number"
          ? (internalPlayer as { currentPlaybackTime: number }).currentPlaybackTime
          : typeof musicKitInstanceRef.current?.currentPlaybackTime === "number"
          ? musicKitInstanceRef.current.currentPlaybackTime
          : undefined;
      const currentTime =
        typeof playerTime === "number" && Number.isFinite(playerTime)
          ? playerTime
          : musicKitTime;

      if (typeof currentTime === "number" && Number.isFinite(currentTime)) {
        store.setElapsedTime(Math.max(0, currentTime));
      }

      // Update the store before the parent closes the window so reopening
      // never sees a stale "playing" flag while MusicKit is already paused.
      if (store.isPlaying) {
        store.setIsPlaying(false);
      }

      if (store.librarySource === "appleMusic") {
        const maybeMusicKit =
          (internalPlayer as { pause?: () => void } | null | undefined) ??
          musicKitInstanceRef.current;
        try {
          maybeMusicKit?.pause?.();
        } catch (err) {
          console.warn("[apple music] pause before close failed", err);
        }
      }
    }, [isFullScreen]);

    // Fallback for close paths that bypass the WindowFrame close button and
    // directly flip the app instance closed. By the time this runs refs may
    // already be cleared, so `pauseBeforeWindowClose` also reads directly from
    // the shared MusicKit instance.
    useLayoutEffect(() => {
      if (!isWindowOpen) pauseBeforeWindowClose();
    }, [isWindowOpen, pauseBeforeWindowClose]);

    // Track switching state to prevent race conditions
    const isTrackSwitchingRef = useRef(false);
    const trackSwitchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Library update checker
    const { manualSync } = useLibraryUpdateChecker(
      isWindowOpen && (isForeground ?? false)
    );

    // Status helper functions
    const showStatus = useCallback((message: string) => {
      setStatusMessage(message);
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
      statusTimeoutRef.current = setTimeout(() => {
        setStatusMessage(null);
      }, 2000);
    }, []);

    const showOfflineStatus = useCallback(() => {
      toast.error(t("apps.ipod.dialogs.youreOffline"), {
        id: "ipod-offline",
        description: t("apps.ipod.dialogs.ipodRequiresInternet"),
      });
      showStatus("🚫");
    }, [showStatus, menuLocale]);

    // Ref-only version — marks activity without triggering any React state update.
    // Use this on high-frequency paths (e.g. brick game wheel) to keep the RAF
    // loop uninterrupted.
    const registerActivityRef = useCallback(() => {
      userHasInteractedRef.current = true;
    }, []);

    const registerActivity = useCallback(() => {
      setLastActivityTime(Date.now());
      userHasInteractedRef.current = true;
      const { backlightOn: isBacklightOn, backlightTimeout: timeoutSetting } =
        useIpodStore.getState();
      if (timeoutSetting !== "off" && !isBacklightOn) {
        toggleBacklight();
      }
    }, [toggleBacklight]);

    // Backlight timer
    useEffect(() => {
      if (backlightTimerRef.current) {
        clearTimeout(backlightTimerRef.current);
      }

      const timeoutMs =
        backlightTimeout === "off" || backlightTimeout === "always-on"
          ? null
          : BACKLIGHT_TIMEOUT_BY_SETTING[backlightTimeout];

      if (backlightOn && timeoutMs !== null) {
        backlightTimerRef.current = setTimeout(() => {
          const currentShowVideo = useIpodStore.getState().showVideo;
          const currentIsPlaying = useIpodStore.getState().isPlaying;
          const isGameOpen = isMusicQuizOpen || isBrickGameOpen;
          if (
            Date.now() - lastActivityTime >= timeoutMs &&
            !(currentShowVideo && currentIsPlaying) &&
            !isGameOpen
          ) {
            toggleBacklight();
          }
        }, timeoutMs);
      }

      return () => {
        if (backlightTimerRef.current) {
          clearTimeout(backlightTimerRef.current);
        }
      };
    }, [
      backlightOn,
      backlightTimeout,
      isBrickGameOpen,
      isMusicQuizOpen,
      lastActivityTime,
      toggleBacklight,
    ]);

    // Foreground handling
    useEffect(() => {
      if (isForeground && !prevIsForeground.current) {
        const { backlightOn: isBacklightOn, backlightTimeout: timeoutSetting } =
          useIpodStore.getState();
        if (!isBacklightOn && timeoutSetting !== "off") {
          toggleBacklight();
        }
        registerActivity();
      } else if (!isForeground && prevIsForeground.current) {
        if (useIpodStore.getState().backlightOn) {
          toggleBacklight();
        }
      }
      prevIsForeground.current = isForeground;
    }, [isForeground, toggleBacklight, registerActivity]);

    // Reset elapsed time on track change and set track switching guard
    // This catches track changes from any source (AI tools, shared URLs, menu selections, etc.)
    // Using null as initial value ensures first render triggers the auto-skip check
    const prevCurrentIndexRef = useRef<number | null>(null);
    useEffect(() => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      // Check if track changed or this is initial render (prevCurrentIndexRef.current is null)
      if (prevCurrentIndexRef.current !== currentIndex) {
        isTrackSwitchingRef.current = true;
        if (trackSwitchTimeoutRef.current) {
          clearTimeout(trackSwitchTimeoutRef.current);
        }
        
        // Get the new track's offset
        const newTrack = tracks[currentIndex];
        const newLyricOffset = newTrack?.lyricOffset ?? 0;
        
        // For negative offset, auto-skip to where lyrics time = 0
        // Formula: lyricsTime = playerTime + (lyricOffset / 1000)
        // When lyricsTime = 0: playerTime = -lyricOffset / 1000
        // Only seek if offset is negative (produces positive seek target)
        // and the seek target is reasonable (less than track duration, at least 1 second)
        const seekTarget = -newLyricOffset / 1000;
        
        if (newLyricOffset < 0 && seekTarget >= 1) {
          useIpodStore.getState().setElapsedTime(seekTarget);
          
          timeoutId = setTimeout(() => {
            isTrackSwitchingRef.current = false;
            const activePlayer = isFullScreen ? fullScreenPlayerRef.current : playerRef.current;
            if (activePlayer) {
              activePlayer.seekTo(seekTarget);
              showStatus(`▶ ${formatSecondsAsMinutesSeconds(seekTarget)}`);
            }
          }, 2000);
          trackSwitchTimeoutRef.current = timeoutId;
        } else {
          // Start from beginning for positive/zero offset or small negative offset
          useIpodStore.getState().setElapsedTime(0);
          timeoutId = setTimeout(() => {
            isTrackSwitchingRef.current = false;
          }, 2000);
          trackSwitchTimeoutRef.current = timeoutId;
        }
      }
      prevCurrentIndexRef.current = currentIndex;
      return () => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          if (trackSwitchTimeoutRef.current === timeoutId) {
            trackSwitchTimeoutRef.current = null;
          }
        }
      };
    }, [currentIndex, tracks, isFullScreen, showStatus]);

    // Cleanup status timeout
    useEffect(() => {
      return () => {
        if (statusTimeoutRef.current) {
          clearTimeout(statusTimeoutRef.current);
        }
        if (trackSwitchTimeoutRef.current) {
          clearTimeout(trackSwitchTimeoutRef.current);
        }
      };
    }, []);

    // Helper to mark track switch start and schedule end
    const startTrackSwitch = useCallback(() => {
      isTrackSwitchingRef.current = true;
      if (trackSwitchTimeoutRef.current) {
        clearTimeout(trackSwitchTimeoutRef.current);
      }
      // Allow 2 seconds for YouTube to load before accepting play/pause events
      trackSwitchTimeoutRef.current = setTimeout(() => {
        isTrackSwitchingRef.current = false;
      }, 2000);
    }, []);

    const getCurrentAppleMusicCollectionShellTrack = useCallback(() => {
      const state = useIpodStore.getState();
      if (state.librarySource !== "appleMusic" || !state.appleMusicCurrentSongId) {
        return null;
      }
      const track =
        state.appleMusicTracks.find(
          (candidate) => candidate.id === state.appleMusicCurrentSongId
        ) ??
        appleMusicRadioTracks.find(
          (candidate) => candidate.id === state.appleMusicCurrentSongId
        ) ??
        null;
      return track && isAppleMusicCollectionTrack(track) ? track : null;
    }, [appleMusicRadioTracks]);

    const skipAppleMusicCollectionShell = useCallback(
      async (direction: "next" | "previous") => {
        const shellTrack = getCurrentAppleMusicCollectionShellTrack();
        if (!shellTrack) return false;
        const activePlayer = isFullScreen
          ? fullScreenPlayerRef.current
          : playerRef.current;
        const instance = activePlayer?.getInternalPlayer?.();
        if (!instance) return false;

        const isStation = Boolean(shellTrack.appleMusicPlayParams?.stationId);
        const skipNext =
          direction === "next" ||
          isStation ||
          typeof instance.skipToPreviousItem !== "function";
        if (skipNext && typeof instance.skipToNextItem !== "function") {
          return false;
        }
        if (!skipNext && typeof instance.skipToPreviousItem !== "function") {
          return false;
        }

        try {
          skipOperationRef.current = true;
          startTrackSwitch();
          useIpodStore.getState().setElapsedTime(0);
          useIpodStore.getState().setTotalTime(0);
          if (skipNext) {
            await instance.skipToNextItem();
          } else {
            await instance.skipToPreviousItem();
          }
          setIsPlaying(true);
          showStatus(direction === "previous" ? "⏮" : "⏭");
          return true;
        } catch (err) {
          console.warn("[apple music] failed to skip collection queue item", err);
          return false;
        }
      },
      [
        getCurrentAppleMusicCollectionShellTrack,
        isFullScreen,
        setIsPlaying,
        showStatus,
        startTrackSwitch,
      ]
    );

    const nextTrack = useCallback(() => {
      if (getCurrentAppleMusicCollectionShellTrack()) {
        void skipAppleMusicCollectionShell("next");
        return;
      }
      rawNextTrack();
    }, [
      getCurrentAppleMusicCollectionShellTrack,
      rawNextTrack,
      skipAppleMusicCollectionShell,
    ]);

    const previousTrack = useCallback(() => {
      if (getCurrentAppleMusicCollectionShellTrack()) {
        void skipAppleMusicCollectionShell("previous");
        return;
      }
      rawPreviousTrack();
    }, [
      getCurrentAppleMusicCollectionShellTrack,
      rawPreviousTrack,
      skipAppleMusicCollectionShell,
    ]);

    // Track handling
    const handleAddTrack = useCallback(
      async (url: string) => {
        setIsAddingSong(true);
        try {
          const addedTrack = await useIpodStore.getState().addTrackFromVideoId(url);
          if (addedTrack) {
            showStatus(t("apps.ipod.status.added"));
            // Start track switch guard since addTrackFromVideoId sets currentIndex to 0 and isPlaying to true
            startTrackSwitch();
          } else {
            throw new Error("Failed to add track");
          }
        } finally {
          setIsAddingSong(false);
        }
      },
      [showStatus, t, startTrackSwitch]
    );

    const processVideoId = useCallback(
      async (videoId: string) => {
        // YouTube share URLs always target the YouTube library — switch the
        // active source first so the shared track lands in the right slice
        // and uses the right setter / nav methods.
        if (useIpodStore.getState().librarySource !== "youtube") {
          setLibrarySource("youtube");
        }

        const currentTracks = useIpodStore.getState().tracks;
        const existingTrack = currentTracks.find((track) => track.id === videoId);
        const shouldAutoplay = !(isIOS || isSafari);

        if (existingTrack) {
          toast.info(t("apps.ipod.dialogs.openedSharedTrack"));
          startTrackSwitch();
          setYoutubeCurrentSongId(videoId);
          if (shouldAutoplay) setIsPlaying(true);
          setMenuMode(false);
        } else {
          toast.info(t("apps.ipod.dialogs.addingNewTrack"));
          await handleAddTrack(`https://www.youtube.com/watch?v=${videoId}`);
          if (shouldAutoplay && !isOffline) {
            const currentSongId = useIpodStore.getState().currentSongId;
            if (currentSongId === videoId) {
              startTrackSwitch();
              setIsPlaying(true);
            }
          } else if (isOffline) {
            showOfflineStatus();
          }
        }
      },
      [setLibrarySource, setYoutubeCurrentSongId, setIsPlaying, handleAddTrack, isOffline, showOfflineStatus, t, isIOS, isSafari, startTrackSwitch]
    );

    // Initial data handling
    useEffect(() => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      if (isWindowOpen && initialData?.videoId && typeof initialData.videoId === "string") {
        if (lastProcessedInitialDataRef.current === initialData) return;

        const videoIdToProcess = initialData.videoId;
        timeoutId = setTimeout(() => {
          processVideoId(videoIdToProcess)
            .then(() => {
              if (instanceId) clearIpodInitialData(instanceId);
            })
            .catch((error) => {
              console.error(`Error processing initial videoId ${videoIdToProcess}:`, error);
            });
        }, 100);
        lastProcessedInitialDataRef.current = initialData;
      }
      return () => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
      };
    }, [isWindowOpen, initialData, processVideoId, clearIpodInitialData, instanceId]);

    // Playback handlers
    const handleTrackEnd = useCallback(() => {
      if (loopCurrent) {
        const activePlayer = isFullScreen ? fullScreenPlayerRef.current : playerRef.current;
        activePlayer?.seekTo(0);
        setIsPlaying(true);
      } else {
        startTrackSwitch();
        nextTrack();
      }
    }, [loopCurrent, nextTrack, setIsPlaying, isFullScreen, startTrackSwitch]);

    const handleProgress = useCallback((state: { playedSeconds: number }) => {
      // Single source of truth — zustand. The selector at the top of
      // this hook re-subscribes us to the new value, so any code path
      // that needs reactivity still gets it.
      useIpodStore.getState().setElapsedTime(state.playedSeconds);
    }, []);

    const handleDuration = useCallback((duration: number) => {
      setTotalTime(duration);
      useIpodStore.getState().setTotalTime(duration);
    }, []);

    const handlePlay = useCallback(() => {
      // Don't update state if we're in the middle of a track switch
      if (isTrackSwitchingRef.current) {
        return;
      }
      setIsPlaying(true);
      if (!skipOperationRef.current) showStatus("▶");
      skipOperationRef.current = false;

      const currentTrack = tracks[currentIndex];
      if (currentTrack) {
        const lastTracked = lastTrackedSongRef.current;
        const isNewTrack = !lastTracked || lastTracked.trackId !== currentTrack.id;
        const isStartingFromBeginning = elapsedTime < 1;

        if (isNewTrack || isStartingFromBeginning) {
          track(IPOD_ANALYTICS.SONG_PLAY, {
            trackId: currentTrack.id,
            title: currentTrack.title,
            artist: currentTrack.artist || "",
          });
          lastTrackedSongRef.current = { trackId: currentTrack.id, elapsedTime };
        }
      }
    }, [setIsPlaying, showStatus, tracks, currentIndex, elapsedTime]);

    const handlePause = useCallback(() => {
      // Don't update state if we're in the middle of a track switch
      if (isTrackSwitchingRef.current) {
        return;
      }
      setIsPlaying(false);
      showStatus("⏸︎");
    }, [setIsPlaying, showStatus]);

    const handleReady = useCallback(() => {}, []);

    // Watchdog for blocked autoplay
    useEffect(() => {
      if (!isPlaying || !isIOSSafari || userHasInteractedRef.current) return;

      const startElapsed = elapsedTime;
      const timer = setTimeout(() => {
        if (useIpodStore.getState().isPlaying && elapsedTime === startElapsed) {
          setIsPlaying(false);
          showStatus("⏸");
        }
      }, 1200);

      return () => clearTimeout(timer);
    }, [isPlaying, elapsedTime, setIsPlaying, showStatus, isIOSSafari]);

    // Fullscreen sync
    const prevFullScreenRef = useRef(isFullScreen);

    useEffect(() => {
      const timeoutIds = new Set<ReturnType<typeof setTimeout>>();
      const scheduleTimeout = (callback: () => void, delay: number) => {
        const timeoutId = setTimeout(() => {
          timeoutIds.delete(timeoutId);
          callback();
        }, delay);
        timeoutIds.add(timeoutId);
        return timeoutId;
      };

      if (isFullScreen !== prevFullScreenRef.current) {
        // Apple Music plays through a single shared MusicKit instance, so
        // toggling fullscreen never needs the YouTube-style seek-and-resume
        // dance between two iframes. Skip the sync entirely.
        if (isAppleMusic) {
          prevFullScreenRef.current = isFullScreen;
          return;
        }

        // Mark as track switching to prevent spurious play/pause events during sync
        isTrackSwitchingRef.current = true;
        if (trackSwitchTimeoutRef.current) {
          clearTimeout(trackSwitchTimeoutRef.current);
        }

        if (isFullScreen) {
          const currentTime = playerRef.current?.getCurrentTime() || elapsedTime;
          const wasPlaying = isPlaying;

          // Wait for fullscreen player to be ready before seeking
          const checkAndSync = () => {
            const internalPlayer = fullScreenPlayerRef.current?.getInternalPlayer?.();
            if (internalPlayer && typeof internalPlayer.getPlayerState === "function") {
              const playerState = internalPlayer.getPlayerState();
              // -1 = unstarted, wait for player to be ready
              if (playerState !== -1) {
                fullScreenPlayerRef.current?.seekTo(currentTime);
                if (wasPlaying && typeof internalPlayer.playVideo === "function") {
                  // On iOS Safari, only play if user has interacted
                  if (!isIOSSafari || userHasInteractedRef.current) {
                    internalPlayer.playVideo();
                  }
                }
                // End track switch after sync complete
                trackSwitchTimeoutRef.current = scheduleTimeout(() => {
                  isTrackSwitchingRef.current = false;
                }, 500);
                return;
              }
            }
            // Player not ready, retry
            scheduleTimeout(checkAndSync, 100);
          };
          scheduleTimeout(checkAndSync, 100);
        } else {
          const currentTime = fullScreenPlayerRef.current?.getCurrentTime() || elapsedTime;
          const wasPlaying = isPlaying;

          scheduleTimeout(() => {
            if (playerRef.current) {
              playerRef.current.seekTo(currentTime);
              if (wasPlaying && !useIpodStore.getState().isPlaying) {
                setIsPlaying(true);
              }
            }
            // End track switch after sync complete
            trackSwitchTimeoutRef.current = scheduleTimeout(() => {
              isTrackSwitchingRef.current = false;
            }, 500);
          }, 200);
        }
        prevFullScreenRef.current = isFullScreen;
      }
      return () => {
        timeoutIds.forEach((timeoutId) => clearTimeout(timeoutId));
        timeoutIds.clear();
      };
    }, [isAppleMusic, isFullScreen, elapsedTime, isPlaying, setIsPlaying, isIOSSafari]);

    // Seek time for fullscreen (delta)
    const seekTime = useCallback(
      (delta: number) => {
        if (fullScreenPlayerRef.current) {
          const currentTime = fullScreenPlayerRef.current.getCurrentTime() || 0;
          const newTime = Math.max(0, currentTime + delta);
          fullScreenPlayerRef.current.seekTo(newTime);
          showStatus(
            `${delta > 0 ? "⏩︎" : "⏪︎"} ${formatSecondsAsMinutesSeconds(newTime)}`
          );
        }
      },
      [showStatus]
    );

    // Seek to absolute time (in ms) and start playing
    // timeMs is in "lyrics time" (player time + offset), so we subtract the offset to get player time
    const seekToTime = useCallback(
      (timeMs: number) => {
        if (fullScreenPlayerRef.current) {
          // Set guard to prevent spurious onPause events during seek from killing playback
          isTrackSwitchingRef.current = true;
          if (trackSwitchTimeoutRef.current) {
            clearTimeout(trackSwitchTimeoutRef.current);
          }
          
          // Subtract lyricOffset to convert from lyrics time to player time
          const playerTimeMs = timeMs - lyricOffset;
          const newTime = Math.max(0, playerTimeMs / 1000);
          fullScreenPlayerRef.current.seekTo(newTime);
          
          // Start playing if paused — also poke the internal player directly
          // so iOS Safari (YouTube) and MusicKit honour the user gesture.
          if (!isPlaying) {
            setIsPlaying(true);
            const internalPlayer = fullScreenPlayerRef.current?.getInternalPlayer?.() as
              | { playVideo?: () => void; play?: () => void }
              | null
              | undefined;
            if (internalPlayer) {
              if (typeof internalPlayer.playVideo === "function") {
                internalPlayer.playVideo();
              } else if (typeof internalPlayer.play === "function") {
                // MusicKit bridge: call instance.play() to unblock autoplay.
                try {
                  const result = (
                    internalPlayer.play as () => unknown
                  )();
                  const maybeThenable = result as
                    | { catch?: (cb: (err: unknown) => void) => void }
                    | undefined;
                  if (
                    maybeThenable &&
                    typeof maybeThenable.catch === "function"
                  ) {
                    maybeThenable.catch(() => undefined);
                  }
                } catch {
                  /* MusicKit instances throw when not configured — ignore. */
                }
              }
            }
          }
          showStatus(`▶ ${formatSecondsAsMinutesSeconds(newTime)}`);
          
          // Clear guard after a short delay to allow seek + play to complete
          trackSwitchTimeoutRef.current = setTimeout(() => {
            isTrackSwitchingRef.current = false;
          }, 500);
        }
      },
      [showStatus, isPlaying, lyricOffset, setIsPlaying]
    );

  return {
    elapsedTime,
    totalTime,
    playerRef,
    fullScreenPlayerRef,
    skipOperationRef,
    isTrackSwitchingRef,
    trackSwitchTimeoutRef,
    statusMessage,
    showStatus,
    showOfflineStatus,
    registerActivity,
    registerActivityRef,
    userHasInteractedRef,
    manualSync,
    setLastActivityTime,
    pauseBeforeWindowClose,
    startTrackSwitch,
    getCurrentAppleMusicCollectionShellTrack,
    skipAppleMusicCollectionShell,
    nextTrack,
    previousTrack,
    handleAddTrack,
    processVideoId,
    handleTrackEnd,
    handleProgress,
    handleDuration,
    handlePlay,
    handlePause,
    handleReady,
    seekTime,
    seekToTime,
    isAddingSong,
    setIsAddingSong,
    musicKitInstance,
    musicKitStatus,
    appleMusicAuthorized,
    musicKitAuthorize,
    musicKitUnauthorize,
    musicKitInstanceRef,
    refreshAppleMusicLibrary,
    appleMusicRadioTracks,
    setAppleMusicRadioTracks,
    isAppleMusicRadioLoading,
    setIsAppleMusicRadioLoading,
    hasAttemptedRadioRestoreHydrationRef,
    shouldHydrateRadioOnRestoreRef,
    isAppleMusicGeniusLoading,
    setIsAppleMusicGeniusLoading,
  };
}
