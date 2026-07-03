import React, { useReducer, useRef, useEffect, useCallback } from "react";
import type ReactPlayer from "react-player";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useAppHelpAboutDialogs } from "@/hooks/useAppHelpAboutDialogs";
import { useVideoStore, DEFAULT_VIDEOS } from "@/stores/useVideoStore";
import { useSound, Sounds } from "@/hooks/useSound";
import { useAppStore } from "@/stores/useAppStore";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { useCustomEventListener } from "@/hooks/useEventListener";
import { helpItems } from "..";
import type { VideosInitialData } from "../../base/types";
import { parseYouTubeVideoId } from "@/utils/youtubeUrl";
import { fetchYouTubeOembed, parseYouTubeTitle } from "@/utils/youtubeMetadata";
import { onAppUpdate } from "@/utils/appEventBus";
import { MEDIA_ANALYTICS, track } from "@/utils/analytics";
import { formatSecondsMmSs } from "@/utils/formatDuration";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useTrackSwitchGuard } from "@/shared/media/useTrackSwitchGuard";
import { createClientLogger } from "@/utils/logger";

const log = createClientLogger("Videos");

interface Video {
  id: string;
  url: string;
  title: string;
  artist?: string;
}

export interface UseVideosLogicOptions {
  isWindowOpen: boolean;
  isForeground?: boolean;
  initialData?: VideosInitialData;
  instanceId?: string;
}

export function useVideosLogic({
  isWindowOpen,
  initialData,
  instanceId,
}: UseVideosLogicOptions) {
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("videos", helpItems);
  const { play: playVideoTape } = useSound(Sounds.VIDEO_TAPE);
  const { play: playButtonClick } = useSound(Sounds.BUTTON_CLICK);

  // Video store state
  const videos = useVideoStore((s) => s.videos);
  const setVideos = useVideoStore((s) => s.setVideos);
  const currentVideoId = useVideoStore((s) => s.currentVideoId);
  const setCurrentVideoId = useVideoStore((s) => s.setCurrentVideoId);
  const getCurrentIndex = useVideoStore((s) => s.getCurrentIndex);
  const getCurrentVideo = useVideoStore((s) => s.getCurrentVideo);
  const loopCurrent = useVideoStore((s) => s.loopCurrent);
  const setLoopCurrent = useVideoStore((s) => s.setLoopCurrent);
  const loopAll = useVideoStore((s) => s.loopAll);
  const setLoopAll = useVideoStore((s) => s.setLoopAll);
  const isShuffled = useVideoStore((s) => s.isShuffled);
  const setIsShuffled = useVideoStore((s) => s.setIsShuffled);
  const isPlaying = useVideoStore((s) => s.isPlaying);
  const playbackRequested = useVideoStore((s) => s.playbackRequested);
  const togglePlayStore = useVideoStore((s) => s.togglePlay);
  const setIsPlaying = useVideoStore((s) => s.setIsPlaying);
  const confirmPlayback = useVideoStore((s) => s.confirmPlayback);

  // App store hooks
  const bringInstanceToForeground = useAppStore(
    (state) => state.bringInstanceToForeground
  );
  const clearInstanceInitialData = useAppStore(
    (state) => state.clearInstanceInitialData
  );

  // Theme and audio settings
  const {
    currentTheme,
    isWindowsTheme,
    isMacOSTheme,
  } = useThemeFlags();
  const masterVolume = useAudioSettingsStore((state) => state.masterVolume);

  // Safe setter that ensures currentVideoId is valid
  const safeSetCurrentVideoId = useCallback(
    (videoId: string | null) => {
      // Get fresh state from store to avoid stale closure issues
      const currentVideos = useVideoStore.getState().videos;
      log.debug("safeSetCurrentVideoId called", {
        videoId,
        videoCount: currentVideos.length,
      });

      if (!videoId || currentVideos.length === 0) {
        const fallbackId = currentVideos.length > 0 ? currentVideos[0].id : null;
        log.debug("Using fallback video ID", { fallbackId });
        setCurrentVideoId(fallbackId);
        return;
      }

      const validVideo = currentVideos.find((v) => v.id === videoId);
      const resultId = validVideo
        ? videoId
        : currentVideos.length > 0
        ? currentVideos[0].id
        : null;
      log.debug("Resolved current video ID", {
        requestedVideoId: videoId,
        found: Boolean(validVideo),
        resultId,
      });
      setCurrentVideoId(resultId);
    },
    [setCurrentVideoId]
  );

  // Component state
  interface VideosUiState {
    animationDirection: "next" | "prev";
    originalOrder: Video[];
    urlInput: string;
    isAddDialogOpen: boolean;
    isConfirmClearOpen: boolean;
    isConfirmResetOpen: boolean;
    isAddingVideo: boolean;
    isFullScreen: boolean;
    statusMessage: string | null;
    isShareDialogOpen: boolean;
    duration: number;
    isVideoHovered: boolean;
    isDraggingSeek: boolean;
    dragSeekTime: number;
  }

  const initialState: VideosUiState = {
    animationDirection: "next",
    originalOrder: videos,
    urlInput: "",
    isAddDialogOpen: false,
    isConfirmClearOpen: false,
    isConfirmResetOpen: false,
    isAddingVideo: false,
    isFullScreen: false,
    statusMessage: null,
    isShareDialogOpen: false,
    duration: 0,
    isVideoHovered: false,
    isDraggingSeek: false,
    dragSeekTime: 0,
  };

  type VideosUiAction = { type: "patch"; payload: Partial<VideosUiState> };

  const reducer = (state: VideosUiState, action: VideosUiAction): VideosUiState => {
    switch (action.type) {
      case "patch":
        return { ...state, ...action.payload };
      default:
        return state;
    }
  };

  const [uiState, dispatchUi] = useReducer(reducer, initialState);
  const {
    animationDirection,
    originalOrder,
    urlInput,
    isAddDialogOpen,
    isConfirmClearOpen,
    isConfirmResetOpen,
    isAddingVideo,
    isFullScreen,
    statusMessage,
    isShareDialogOpen,
    duration,
    isVideoHovered,
    isDraggingSeek,
    dragSeekTime,
  } = uiState;
  const {
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
  } = useAppHelpAboutDialogs();
  const setAnimationDirection = useCallback((value: "next" | "prev") => {
    dispatchUi({ type: "patch", payload: { animationDirection: value } });
  }, []);
  const setOriginalOrder = useCallback((value: Video[]) => {
    dispatchUi({ type: "patch", payload: { originalOrder: value } });
  }, []);
  const setUrlInput = useCallback((value: string) => {
    dispatchUi({ type: "patch", payload: { urlInput: value } });
  }, []);
  const setIsAddDialogOpen = useCallback((value: boolean) => {
    dispatchUi({ type: "patch", payload: { isAddDialogOpen: value } });
  }, []);
  const setIsConfirmClearOpen = useCallback((value: boolean) => {
    dispatchUi({ type: "patch", payload: { isConfirmClearOpen: value } });
  }, []);
  const setIsConfirmResetOpen = useCallback((value: boolean) => {
    dispatchUi({ type: "patch", payload: { isConfirmResetOpen: value } });
  }, []);
  const setIsAddingVideo = useCallback((value: boolean) => {
    dispatchUi({ type: "patch", payload: { isAddingVideo: value } });
  }, []);
  const setIsFullScreen = useCallback((value: boolean) => {
    dispatchUi({ type: "patch", payload: { isFullScreen: value } });
  }, []);
  const setStatusMessage = useCallback((value: string | null) => {
    dispatchUi({ type: "patch", payload: { statusMessage: value } });
  }, []);
  const setIsShareDialogOpen = useCallback((value: boolean) => {
    dispatchUi({ type: "patch", payload: { isShareDialogOpen: value } });
  }, []);
  const setDuration = useCallback((value: number) => {
    dispatchUi({ type: "patch", payload: { duration: value } });
  }, []);
  const setIsVideoHovered = useCallback((value: boolean) => {
    dispatchUi({ type: "patch", payload: { isVideoHovered: value } });
  }, []);
  const setIsDraggingSeek = useCallback((value: boolean) => {
    dispatchUi({ type: "patch", payload: { isDraggingSeek: value } });
  }, []);
  const setDragSeekTime = useCallback((value: number) => {
    dispatchUi({ type: "patch", payload: { dragSeekTime: value } });
  }, []);

  // Refs
  const playerRef = useRef<ReactPlayer | null>(null);
  const fullScreenPlayerRef = useRef<ReactPlayer | null>(null);
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { isTrackSwitchingRef, trackSwitchTimeoutRef, startTrackSwitch } =
    useTrackSwitchGuard();
  const prevIsPlayingRef = useRef(isPlaying);
  const autoShowHoverResetRef = useRef<NodeJS.Timeout | null>(null);
  const hasAutoplayCheckedRef = useRef(false);
  const lastProcessedVideoIdRef = useRef<string | null>(null);
  const prevFullScreenRef = useRef(isFullScreen);
  const originalOrderRef = useRef(originalOrder);

  useEffect(() => {
    originalOrderRef.current = originalOrder;
  }, [originalOrder]);

  // Track pointer/touch interactions on the video area
  const touchGestureRef = useRef<{
    startX: number;
    startY: number;
    moved: boolean;
    pointerId: number | null;
  } | null>(null);
  const SWIPE_MOVE_THRESHOLD = 10; // px

  // Function to show status message
  const showStatus = useCallback(
    (message: string) => {
      setStatusMessage(message);
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
        statusTimeoutRef.current = null;
      }
      statusTimeoutRef.current = setTimeout(() => {
        setStatusMessage(null);
      }, 2000);
    },
    []
  );

  const sharedVideoToastContent = useCallback(
    () =>
      React.createElement(
        React.Fragment,
        null,
        t("apps.videos.dialogs.openedSharedVideo"),
        " ",
        React.createElement("span", { className: "font-chicago" }, "⏯"),
        " ",
        t("apps.videos.dialogs.toStartPlaying")
      ),
    [t]
  );

  // Update animation direction before changing currentVideoId
  const updateCurrentVideoId = useCallback(
    (videoId: string | null, direction: "next" | "prev") => {
      setAnimationDirection(direction);
      safeSetCurrentVideoId(videoId);
    },
    [safeSetCurrentVideoId]
  );

  const extractVideoId = useCallback(
    (url: string): string | null => parseYouTubeVideoId(url),
    []
  );

  const addVideo = useCallback(
    async (url: string) => {
      setIsAddingVideo(true);
      try {
        const videoId = extractVideoId(url);
        if (!videoId) {
          throw new Error("Invalid YouTube URL");
        }

        const existingVideos = useVideoStore.getState().videos;
        const existing = existingVideos.find((v) => v.id === videoId);
        if (existing) {
          safeSetCurrentVideoId(existing.id);
          setIsPlaying(true);
          showStatus(t("apps.videos.status.videoAdded"));
          dispatchUi({
            type: "patch",
            payload: {
              urlInput: "",
              isAddDialogOpen: false,
            },
          });
          return;
        }

        // 1. Fetch initial info from oEmbed
        const oembed = await fetchYouTubeOembed(videoId);
        if (!oembed.ok) {
          throw new Error(
            `Failed to fetch video info (${oembed.status}). Please check the YouTube URL.`
          );
        }
        const rawTitle = oembed.rawTitle || `Video ID: ${videoId}`;

        // 2. Resolve a cleaned title/artist via /api/parse-title
        const { title, artist } = await parseYouTubeTitle(
          rawTitle,
          oembed.authorName
        );

        const newVideo: Video = {
          id: videoId,
          url,
          title,
          artist,
        };

        // Add video to store
        const currentVideos = useVideoStore.getState().videos;
        const newVideos = [...currentVideos, newVideo];
        log.debug("Adding video", {
          videoId: newVideo.id,
          previousCount: currentVideos.length,
          nextCount: newVideos.length,
        });
        setVideos(newVideos);

        // Update original order if not shuffled
        if (!isShuffled) {
          setOriginalOrder(newVideos);
        }

        // Set current video to the newly added video
        log.debug("Setting current video to newly added", {
          videoId: newVideo.id,
        });
        safeSetCurrentVideoId(newVideo.id);
        setIsPlaying(true);
        log.debug("Video added successfully", { videoId: newVideo.id });
        track(MEDIA_ANALYTICS.VIDEO_ADD, {
          appId: "videos",
          source: "url",
          videoCount: newVideos.length,
        });

        showStatus(t("apps.videos.status.videoAdded"));

        dispatchUi({
          type: "patch",
          payload: {
            urlInput: "",
            isAddDialogOpen: false,
          },
        });
      } catch (error) {
        console.error("Failed to add video:", error);
        showStatus(
          t("apps.videos.status.errorAdding", {
            error:
              error instanceof Error
                ? error.message
                : t("apps.videos.status.unknownError"),
          })
        );
        // Reset state on error to prevent inconsistent state
        if (videos.length > 0) {
          safeSetCurrentVideoId(videos[videos.length - 1].id);
        }
        setIsPlaying(false);
      } finally {
        setIsAddingVideo(false);
      }
    },
    [
      extractVideoId,
      isShuffled,
      setVideos,
      safeSetCurrentVideoId,
      setIsPlaying,
      showStatus,
      t,
      videos,
    ]
  );

  // Function to add and play video by ID
  const handleAddAndPlayVideoById = useCallback(
    async (videoId: string) => {
      const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
      try {
        await addVideo(youtubeUrl); // addVideo sets current index and plays

        // Check if on iOS Safari and show appropriate status message
        const ua = navigator.userAgent;
        const isIOS = /iP(hone|od|ad)/.test(ua);
        const isSafari =
          /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua);

        if (isIOS && isSafari) {
          showStatus(t("apps.videos.status.pressToPlay"));
        }
      } catch (error) {
        console.error(
          `[Videos] Error adding video for videoId ${videoId}:`,
          error
        );
        showStatus(t("apps.videos.status.failedToAddVideo"));
        throw error; // Re-throw to let caller handle
      }
    },
    [addVideo, showStatus, t]
  );

  // Function to process video ID (find or add/play)
  const processVideoId = useCallback(
    async (videoId: string) => {
      try {
        // Validate videoId format
        if (!videoId || typeof videoId !== "string" || videoId.length !== 11) {
          throw new Error(`Invalid video ID format: ${videoId}`);
        }

        const currentVideos = useVideoStore.getState().videos;
        const existingVideoIndex = currentVideos.findIndex(
          (video) => video.id === videoId
        );

        // --- Check for mobile Safari BEFORE setting playing state ---
        const ua = navigator.userAgent;
        const isIOS = /iP(hone|od|ad)/.test(ua);
        const isSafari =
          /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua);
        const shouldAutoplay = !(isIOS || isSafari);
        // --- End check ---

        if (existingVideoIndex !== -1) {
          log.debug("Video found in playlist", {
            videoId,
            shouldAutoplay,
          });
          safeSetCurrentVideoId(videoId);
          // --- Only set playing if allowed ---
          if (shouldAutoplay) {
            setIsPlaying(true);
          }
          // Optionally show status
          showStatus(
            t("apps.videos.status.playing", {
              title: currentVideos[existingVideoIndex].title,
            })
          );
        } else {
          log.debug("Video not found in playlist; adding", {
            videoId,
            shouldAutoplay,
          });
          await handleAddAndPlayVideoById(videoId);
          // Note: handleAddAndPlayVideoById already sets isPlaying to true
          // Only need to handle mobile Safari case here
          if (!shouldAutoplay) {
            setIsPlaying(false);
          }
        }
      } catch (error) {
        console.error(`[Videos] Error processing video ID ${videoId}:`, error);
        showStatus(t("apps.videos.status.failedToProcessVideo", { videoId }));
        throw error; // Re-throw to let caller handle
      }
    },
    [safeSetCurrentVideoId, setIsPlaying, handleAddAndPlayVideoById, showStatus, t]
  );

  const nextVideo = useCallback(() => {
    if (videos.length === 0) return;
    playButtonClick();
    startTrackSwitch(); // Guard against race conditions during track switch

    const currentIndex = getCurrentIndex();
    if (currentIndex === videos.length - 1) {
      if (loopAll) {
        showStatus(t("apps.videos.status.repeatingPlaylist"));
        updateCurrentVideoId(videos[0].id, "next");
      }
      // If not looping, stay on current video
    } else {
      showStatus(t("apps.videos.status.next"));
      updateCurrentVideoId(videos[currentIndex + 1].id, "next");
    }
    setIsPlaying(true);
  }, [
    videos,
    playButtonClick,
    startTrackSwitch,
    getCurrentIndex,
    loopAll,
    showStatus,
    t,
    updateCurrentVideoId,
    setIsPlaying,
  ]);

  const previousVideo = useCallback(() => {
    if (videos.length === 0) return;
    playButtonClick();
    startTrackSwitch(); // Guard against race conditions during track switch

    const currentIndex = getCurrentIndex();
    if (currentIndex === 0) {
      if (loopAll) {
        showStatus(t("apps.videos.status.repeatingPlaylist"));
        updateCurrentVideoId(videos[videos.length - 1].id, "prev");
      }
      // If not looping, stay on current video
    } else {
      showStatus(t("apps.videos.status.prev"));
      updateCurrentVideoId(videos[currentIndex - 1].id, "prev");
    }
    setIsPlaying(true);
  }, [
    videos,
    playButtonClick,
    startTrackSwitch,
    getCurrentIndex,
    loopAll,
    showStatus,
    t,
    updateCurrentVideoId,
    setIsPlaying,
  ]);

  const togglePlay = useCallback(() => {
    togglePlayStore();
    showStatus(
      !isPlaying ? t("apps.videos.status.play") : t("apps.videos.status.paused")
    );
    playVideoTape();
  }, [togglePlayStore, isPlaying, showStatus, t, playVideoTape]);

  const toggleShuffle = useCallback(() => {
    const nextShuffled = !isShuffled;
    if (nextShuffled) {
      // Snapshot the current order so un-shuffling can restore it, then shuffle.
      const currentVideos = useVideoStore.getState().videos;
      setOriginalOrder(currentVideos);
      originalOrderRef.current = currentVideos;
      setVideos([...currentVideos].sort(() => Math.random() - 0.5));
    } else {
      setVideos([...originalOrderRef.current]);
    }
    setIsShuffled(nextShuffled);
    showStatus(
      nextShuffled
        ? t("apps.videos.status.shuffleOn")
        : t("apps.videos.status.shuffleOff")
    );
  }, [isShuffled, setIsShuffled, setOriginalOrder, setVideos, showStatus, t]);

  const handleVideoEnd = useCallback(() => {
    if (loopCurrent) {
      playerRef.current?.seekTo(0);
      setIsPlaying(true);
    } else {
      nextVideo();
    }
  }, [loopCurrent, setIsPlaying, nextVideo]);

  const handleProgress = useCallback((state: { playedSeconds: number }) => {
    // Write straight to the store (not reducer state) so the ~1Hz tick only
    // re-renders the seek-bar + LCD-time leaf subscribers, not the whole
    // Videos tree.
    useVideoStore.getState().setPlaybackTime(state.playedSeconds);
  }, []);

  const handleDuration = useCallback((duration: number) => {
    setDuration(duration);
  }, []);

  const handleSeek = useCallback(
    (time: number) => {
      const activePlayer = isFullScreen
        ? fullScreenPlayerRef.current
        : playerRef.current;
      if (activePlayer) {
        activePlayer.seekTo(time, "seconds");
      }
    },
    [isFullScreen]
  );

  // Handlers for YouTube player state sync
  const handlePlay = useCallback(() => {
    confirmPlayback();
    // Don't update state if we're in the middle of a track/fullscreen switch
    if (isTrackSwitchingRef.current) {
      return;
    }
    const video = getCurrentVideo();
    if (video) {
      track(MEDIA_ANALYTICS.VIDEO_PLAY, {
        appId: "videos",
        videoId: video.id,
        hasArtist: Boolean(video.artist),
      });
    }
  }, [confirmPlayback]);

  const handlePause = useCallback(() => {
    // Don't update state if we're in the middle of a track/fullscreen switch
    if (isTrackSwitchingRef.current) {
      return;
    }
    setIsPlaying(false);
  }, [setIsPlaying]);

  // Main player pause handler - ignore pause when switching to fullscreen
  const handleMainPlayerPause = useCallback(() => {
    // Don't set isPlaying to false if we're in fullscreen mode or switching tracks
    // (the pause was triggered by switching players, not user action)
    if (!isFullScreen && !isTrackSwitchingRef.current) {
      setIsPlaying(false);
    }
  }, [isFullScreen, setIsPlaying]);

  const handleReady = useCallback(() => {
    // Always start from beginning but don't auto-play
    playerRef.current?.seekTo(0);
  }, []);

  const handlePlaybackAttemptFailed = useCallback(() => {
    setIsPlaying(false);
  }, [setIsPlaying]);

  const handleFullScreen = useCallback(() => {
    // Mark as track switching to prevent spurious play/pause events during sync
    startTrackSwitch();
    setIsFullScreen(true);
    track(MEDIA_ANALYTICS.FULLSCREEN, { appId: "videos", isOpen: true });
    showStatus(t("apps.videos.status.fullscreen"));
  }, [startTrackSwitch, showStatus, t]);

  const handleCloseFullScreen = useCallback(() => {
    // Mark as track switching to prevent spurious play/pause events during sync
    startTrackSwitch();
    setIsFullScreen(false);
    track(MEDIA_ANALYTICS.FULLSCREEN, { appId: "videos", isOpen: false });
    // Sync time from fullscreen player to regular player
    if (fullScreenPlayerRef.current && playerRef.current) {
      const currentTime = fullScreenPlayerRef.current.getCurrentTime();
      const wasPlaying = isPlaying;
      playerRef.current.seekTo(currentTime, "seconds");
      // Ensure playback state is preserved after sync
      if (wasPlaying) {
        setTimeout(() => {
          setIsPlaying(true);
        }, 100);
      }
    }
    // Exit browser fullscreen if active
    if (document.fullscreenElement) {
      document.exitFullscreen().catch((err) => {
        console.error("Error exiting fullscreen:", err);
      });
    }
  }, [startTrackSwitch, isPlaying, setIsPlaying]);

  const toggleFullScreen = useCallback(() => {
    if (isFullScreen) {
      handleCloseFullScreen();
    } else {
      handleFullScreen();
    }
  }, [isFullScreen, handleCloseFullScreen, handleFullScreen]);

  // Handler to open share dialog
  const handleShareVideo = useCallback(() => {
    if (videos.length > 0 && currentVideoId) {
      track(MEDIA_ANALYTICS.SHARE, { appId: "videos", itemType: "video" });
      setIsShareDialogOpen(true);
    }
  }, [videos.length, currentVideoId]);

  // Generate share URL function
  const videosGenerateShareUrl = useCallback((videoId: string): string => {
    return `${window.location.origin}/videos/${videoId}`;
  }, []);

  // Overlay pointer handlers
  const handleOverlayPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "touch") {
        touchGestureRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          moved: false,
          pointerId: e.pointerId,
        };
        // Show the seekbar immediately on touch start (user intent to interact)
        setIsVideoHovered(true);
      }
    },
    []
  );

  const handleOverlayPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType !== "touch" || !touchGestureRef.current) return;
      const dx = Math.abs(e.clientX - touchGestureRef.current.startX);
      const dy = Math.abs(e.clientY - touchGestureRef.current.startY);
      if (
        !touchGestureRef.current.moved &&
        (dx > SWIPE_MOVE_THRESHOLD || dy > SWIPE_MOVE_THRESHOLD)
      ) {
        touchGestureRef.current.moved = true;
        // Ensure seekbar visible while swiping
        setIsVideoHovered(true);
      }
    },
    []
  );

  const handleOverlayPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "touch") {
        // Prevent the synthetic mouse click that usually follows a touch so we don't double-trigger.
        e.preventDefault();
        e.stopPropagation();
        const wasSwipe = touchGestureRef.current?.moved;
        touchGestureRef.current = null;
        // Hide hover flag (SeekBar will auto-dismiss on its own timer)
        setIsVideoHovered(false);
        if (!wasSwipe) {
          // Treat as tap -> toggle play/pause
          togglePlay();
        } else {
          // Swipe: just show seekbar (already shown); do not toggle play/pause
          // No-op here.
        }
        return;
      }

      // Mouse / pen: behave like a normal click toggle
      togglePlay();
    },
    [togglePlay]
  );

  const handleOverlayPointerCancel = useCallback(() => {
    // Reset and allow SeekBar to dismiss
    touchGestureRef.current = null;
    setIsVideoHovered(false);
  }, []);

  // --- Prevent unwanted autoplay on Mobile Safari ---
  useEffect(() => {
    if (hasAutoplayCheckedRef.current) return;

    const ua = navigator.userAgent;
    const isIOS = /iP(hone|od|ad)/.test(ua);
    const isSafari =
      /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua);

    if (isPlaying && (isIOS || isSafari)) {
      setIsPlaying(false);
    }

    hasAutoplayCheckedRef.current = true;
    // dependency array intentionally empty to run once
  }, [isPlaying, setIsPlaying]);

  useEffect(() => {
    if (!isWindowOpen) {
      setIsPlaying(false);
    }
    return () => setIsPlaying(false);
  }, [isWindowOpen, setIsPlaying]);

  // Ensure currentVideoId is valid when videos change
  useEffect(() => {
    if (
      videos.length > 0 &&
      currentVideoId &&
      !videos.find((v) => v.id === currentVideoId)
    ) {
      console.warn(
        `[Videos] currentVideoId ${currentVideoId} not found in videos, resetting to first video`
      );
      safeSetCurrentVideoId(videos[0].id);
    } else if (videos.length > 0 && !currentVideoId) {
      safeSetCurrentVideoId(videos[0].id);
    }
  }, [videos, currentVideoId, safeSetCurrentVideoId]);

  // Reset the playback clock when changing tracks so the LCD readout and
  // seek-bar fill don't briefly show the previous track's position.
  useEffect(() => {
    useVideoStore.getState().resetPlaybackTime();
  }, [currentVideoId]);

  // Shuffle initialization: when shuffle was persisted as enabled, re-shuffle
  // once on mount so each session gets a fresh order. Toggling shuffle on/off
  // is handled directly in `toggleShuffle`, not reactively.
  const hasInitializedShuffleRef = useRef(false);
  useEffect(() => {
    if (hasInitializedShuffleRef.current) return;
    hasInitializedShuffleRef.current = true;
    if (useVideoStore.getState().isShuffled) {
      setVideos((prev) => [...prev].sort(() => Math.random() - 0.5));
    }
  }, [setVideos]);

  // Effect for initial data on mount
  useEffect(() => {
    if (
      isWindowOpen &&
      initialData?.videoId &&
      typeof initialData.videoId === "string"
    ) {
      // Skip if this videoId has already been processed
      if (lastProcessedVideoIdRef.current === initialData.videoId) return;
      const videoIdToProcess = initialData.videoId;
      log.debug("Processing initial video ID", { videoId: videoIdToProcess });

      toast.info(sharedVideoToastContent());

      // Process immediately without delay and with better error handling
      processVideoId(videoIdToProcess)
        .then(() => {
          // Use instanceId if available (new system), otherwise fallback to appId (legacy)
          if (instanceId) {
            clearInstanceInitialData(instanceId);
          }
          log.debug("Processed and cleared initial video ID", {
            videoId: videoIdToProcess,
          });
        })
        .catch((error) => {
          console.error(
            `[Videos] Error processing initial videoId ${videoIdToProcess}:`,
            error
          );
          toast.error(t("apps.videos.dialogs.failedToLoadSharedVideo"), {
            description: t("apps.videos.dialogs.videoId", {
              videoId: videoIdToProcess,
            }),
          });
        });

      // Mark this videoId as processed
      lastProcessedVideoIdRef.current = initialData.videoId;
    }
  }, [
    isWindowOpen,
    initialData,
    processVideoId,
    clearInstanceInitialData,
    instanceId,
    sharedVideoToastContent,
    t,
  ]);

  // Effect for updateApp event (when app is already open)
  useEffect(() => {
    return onAppUpdate((event) => {
      const updateInitialData = event.detail.initialData as
        | { videoId?: string }
        | undefined;

      if (
        event.detail.appId === "videos" &&
        updateInitialData?.videoId &&
        (!event.detail.instanceId || event.detail.instanceId === instanceId)
      ) {
        // Skip if this videoId has already been processed
        if (
          lastProcessedVideoIdRef.current === updateInitialData.videoId
        )
          return;
        const videoId = updateInitialData.videoId;
        log.debug("Received updateApp event with video ID", { videoId });
        if (instanceId) {
          bringInstanceToForeground(instanceId);
        }
        toast.info(sharedVideoToastContent());
        processVideoId(videoId).catch((error) => {
          console.error(
            `[Videos] Error processing videoId ${videoId} from updateApp event:`,
            error
          );
          toast.error(t("apps.videos.dialogs.failedToLoadSharedVideo"), {
            description: t("apps.videos.dialogs.videoId", { videoId }),
          });
        });
        // Mark this videoId as processed
        lastProcessedVideoIdRef.current = updateInitialData.videoId;
      }
    });
  }, [bringInstanceToForeground, instanceId, processVideoId, sharedVideoToastContent, t]);

  // Track paused -> playing transitions so we can auto-show the SeekBar
  useEffect(() => {
    const wasPlaying = prevIsPlayingRef.current;
    if (!wasPlaying && isPlaying) {
      // Just started playing -> force-show SeekBar briefly
      setIsVideoHovered(true);
      if (autoShowHoverResetRef.current) {
        clearTimeout(autoShowHoverResetRef.current);
      }
      // Release the hover flag shortly after so auto-dismiss can take over
      autoShowHoverResetRef.current = setTimeout(() => {
        setIsVideoHovered(false);
      }, 150); // small delay; SeekBar sets its own auto-dismiss timer on show
    }
    prevIsPlayingRef.current = isPlaying;
    return () => {
      if (autoShowHoverResetRef.current) {
        clearTimeout(autoShowHoverResetRef.current);
        autoShowHoverResetRef.current = null;
      }
    };
  }, [isPlaying]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
        statusTimeoutRef.current = null;
      }
      if (trackSwitchTimeoutRef.current) {
        clearTimeout(trackSwitchTimeoutRef.current);
        trackSwitchTimeoutRef.current = null;
      }
    };
  }, []);

  // Sync playback position when entering fullscreen
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

    if (isFullScreen && !prevFullScreenRef.current) {
      // Just entered fullscreen - sync position from main player to fullscreen player
      const currentTime =
        playerRef.current?.getCurrentTime() ||
        useVideoStore.getState().playedSeconds;
      const wasPlaying = isPlaying;

      // Wait for fullscreen player to be ready before seeking
      const checkAndSync = () => {
        const internalPlayer = fullScreenPlayerRef.current?.getInternalPlayer?.();
        if (
          internalPlayer &&
          typeof internalPlayer.getPlayerState === "function"
        ) {
          const playerState = internalPlayer.getPlayerState();
          // YouTube player states: -1 (unstarted), 0 (ended), 1 (playing), 2 (paused), 3 (buffering), 5 (video cued)
          // Wait until player is past the unstarted state
          if (playerState !== -1) {
            fullScreenPlayerRef.current?.seekTo(currentTime, "seconds");
            if (wasPlaying && typeof internalPlayer.playVideo === "function") {
              internalPlayer.playVideo();
            }
            // End track switch guard after sync complete
            if (trackSwitchTimeoutRef.current) {
              clearTimeout(trackSwitchTimeoutRef.current);
            }
            trackSwitchTimeoutRef.current = scheduleTimeout(() => {
              isTrackSwitchingRef.current = false;
            }, 500);
            return;
          }
        }
        // Player not ready yet, retry
        scheduleTimeout(checkAndSync, 100);
      };
      scheduleTimeout(checkAndSync, 100);
    }
    prevFullScreenRef.current = isFullScreen;
    return () => {
      timeoutIds.forEach((timeoutId) => clearTimeout(timeoutId));
      timeoutIds.clear();
    };
  }, [isFullScreen, isPlaying]);

  // Listen for App Menu fullscreen toggle
  useCustomEventListener<{ appId: string; instanceId: string }>(
    "toggleAppFullScreen",
    (event) => {
      if (event.detail.instanceId === instanceId) {
        toggleFullScreen();
      }
    }
  );

  return {
    // Translations
    t,
    // Translated help items
    translatedHelpItems,

    // Video store state
    videos,
    setVideos,
    currentVideoId,
    safeSetCurrentVideoId,
    getCurrentIndex,
    getCurrentVideo,
    loopCurrent,
    setLoopCurrent,
    loopAll,
    setLoopAll,
    isShuffled,
    setIsShuffled,
    isPlaying,
    playbackRequested,
    setIsPlaying,

    // Component state
    animationDirection,
    originalOrder,
    setOriginalOrder,
    urlInput,
    setUrlInput,
    isAddDialogOpen,
    setIsAddDialogOpen,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isConfirmClearOpen,
    setIsConfirmClearOpen,
    isConfirmResetOpen,
    setIsConfirmResetOpen,
    isAddingVideo,
    isFullScreen,
    statusMessage,
    isShareDialogOpen,
    setIsShareDialogOpen,
    duration,
    isVideoHovered,
    setIsVideoHovered,
    isDraggingSeek,
    setIsDraggingSeek,
    dragSeekTime,
    setDragSeekTime,

    // Refs
    playerRef,
    fullScreenPlayerRef,

    // Theme and audio
    currentTheme,
    isWindowsTheme,
    isMacOSTheme,
    masterVolume,

    // Callbacks
    nextVideo,
    previousVideo,
    togglePlay,
    toggleShuffle,
    handleVideoEnd,
    handleProgress,
    handleDuration,
    handleSeek,
    handlePlay,
    handlePause,
    handleMainPlayerPause,
    handleReady,
    handlePlaybackAttemptFailed,
    handleFullScreen,
    handleCloseFullScreen,
    toggleFullScreen,
    handleShareVideo,
    videosGenerateShareUrl,
    addVideo,
    processVideoId,
    showStatus,
    formatTime: formatSecondsMmSs,

    // Overlay handlers
    handleOverlayPointerDown,
    handleOverlayPointerMove,
    handleOverlayPointerUp,
    handleOverlayPointerCancel,

    // Constants
    DEFAULT_VIDEOS,
  };
}
