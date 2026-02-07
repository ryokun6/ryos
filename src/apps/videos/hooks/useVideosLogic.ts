import React, { useState, useRef, useEffect, useCallback } from "react";
import ReactPlayer from "react-player";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useVideoStore, DEFAULT_VIDEOS } from "@/stores/useVideoStore";
import { useSound, Sounds } from "@/hooks/useSound";
import { useAppStore } from "@/stores/useAppStore";
import { getApiUrl } from "@/utils/platform";
import { useThemeStore } from "@/stores/useThemeStore";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { useCustomEventListener } from "@/hooks/useEventListener";
import { helpItems } from "..";
import type { VideosInitialData } from "../../base/types";
import { abortableFetch } from "@/utils/abortableFetch";

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
  const togglePlayStore = useVideoStore((s) => s.togglePlay);
  const setIsPlaying = useVideoStore((s) => s.setIsPlaying);

  // App store hooks
  const bringInstanceToForeground = useAppStore(
    (state) => state.bringInstanceToForeground
  );
  const clearInstanceInitialData = useAppStore(
    (state) => state.clearInstanceInitialData
  );

  // Theme and audio settings
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOSTheme = currentTheme === "macosx";
  const masterVolume = useAudioSettingsStore((state) => state.masterVolume);

  // Safe setter that ensures currentVideoId is valid
  const safeSetCurrentVideoId = useCallback(
    (videoId: string | null) => {
      // Get fresh state from store to avoid stale closure issues
      const currentVideos = useVideoStore.getState().videos;
      console.log(
        `[Videos] safeSetCurrentVideoId called with: ${videoId}. Videos in store: ${currentVideos.length}`
      );

      if (!videoId || currentVideos.length === 0) {
        const fallbackId = currentVideos.length > 0 ? currentVideos[0].id : null;
        console.log(
          `[Videos] No videoId or empty videos, setting to fallback: ${fallbackId}`
        );
        setCurrentVideoId(fallbackId);
        return;
      }

      const validVideo = currentVideos.find((v) => v.id === videoId);
      const resultId = validVideo
        ? videoId
        : currentVideos.length > 0
        ? currentVideos[0].id
        : null;
      console.log(
        `[Videos] Video ${videoId} ${
          validVideo ? "found" : "NOT FOUND"
        } in store. Setting currentVideoId to: ${resultId}`
      );
      setCurrentVideoId(resultId);
    },
    [setCurrentVideoId]
  );

  // Component state
  const [animationDirection, setAnimationDirection] = useState<"next" | "prev">(
    "next"
  );
  const [originalOrder, setOriginalOrder] = useState<Video[]>(videos);
  const [urlInput, setUrlInput] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);
  const [isAddingVideo, setIsAddingVideo] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [duration, setDuration] = useState(0);
  const [playedSeconds, setPlayedSeconds] = useState(0);
  const [isVideoHovered, setIsVideoHovered] = useState(false);
  const [isDraggingSeek, setIsDraggingSeek] = useState(false);
  const [dragSeekTime, setDragSeekTime] = useState(0);

  // Refs
  const playerRef = useRef<ReactPlayer | null>(null);
  const fullScreenPlayerRef = useRef<ReactPlayer | null>(null);
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTrackSwitchingRef = useRef(false);
  const trackSwitchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevIsPlayingRef = useRef(isPlaying);
  const autoShowHoverResetRef = useRef<NodeJS.Timeout | null>(null);
  const hasAutoplayCheckedRef = useRef(false);
  const lastProcessedVideoIdRef = useRef<string | null>(null);
  const prevFullScreenRef = useRef(isFullScreen);

  // Track pointer/touch interactions on the video area
  const touchGestureRef = useRef<{
    startX: number;
    startY: number;
    moved: boolean;
    pointerId: number | null;
  } | null>(null);
  const SWIPE_MOVE_THRESHOLD = 10; // px

  // Helper to mark track/fullscreen switch start and schedule end
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

  const formatTime = useCallback((seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(
      remainingSeconds
    ).padStart(2, "0")}`;
  }, []);

  const extractVideoId = useCallback((url: string): string | null => {
    const regExp =
      /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[7].length === 11 ? match[7] : null;
  }, []);

  const addVideo = useCallback(
    async (url: string) => {
      setIsAddingVideo(true);
      try {
        const videoId = extractVideoId(url);
        if (!videoId) {
          throw new Error("Invalid YouTube URL");
        }

        // 1. Fetch initial info from oEmbed
        const oembedResponse = await abortableFetch(
          `https://www.youtube.com/oembed?url=http://www.youtube.com/watch?v=${videoId}&format=json`,
          {
            timeout: 15000,
            throwOnHttpError: false,
            retry: { maxAttempts: 1, initialDelayMs: 250 },
          }
        );
        if (!oembedResponse.ok) {
          throw new Error(
            `Failed to fetch video info (${oembedResponse.status}). Please check the YouTube URL.`
          );
        }
        const oembedData = await oembedResponse.json();
        const rawTitle = oembedData.title || `Video ID: ${videoId}`;
        const authorName = oembedData.author_name;

        const videoInfo: Partial<Video> = {
          title: rawTitle,
          artist: undefined,
        };

        try {
          // 2. Call our API to parse the title using AI
          const parseResponse = await abortableFetch(
            getApiUrl("/api/parse-title"),
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                title: rawTitle,
                author_name: authorName,
              }),
              timeout: 15000,
              throwOnHttpError: false,
              retry: { maxAttempts: 1, initialDelayMs: 250 },
            }
          );

          if (parseResponse.ok) {
            const parsedData = await parseResponse.json();
            videoInfo.title = parsedData.title || rawTitle;
            videoInfo.artist = parsedData.artist;
          } else {
            console.warn(
              "Failed to parse title with AI, using raw title:",
              await parseResponse.text()
            );
          }
        } catch (parseError) {
          console.warn(
            "Error calling parse-title API, using raw title:",
            parseError
          );
        }

        const newVideo: Video = {
          id: videoId,
          url,
          title: videoInfo.title!,
          artist: videoInfo.artist,
        };

        // Add video to store
        const currentVideos = useVideoStore.getState().videos;
        const newVideos = [...currentVideos, newVideo];
        console.log(
          `[Videos] Adding video ${newVideo.id} (${newVideo.title}). Videos count: ${currentVideos.length} -> ${newVideos.length}`
        );
        setVideos(newVideos);

        // Update original order if not shuffled
        if (!isShuffled) {
          setOriginalOrder(newVideos);
        }

        // Set current video to the newly added video
        console.log(
          `[Videos] Setting current video to newly added: ${newVideo.id}`
        );
        safeSetCurrentVideoId(newVideo.id);
        setIsPlaying(true);
        console.log(
          `[Videos] Video added successfully. Current video should be: ${newVideo.id}`
        );

        showStatus(t("apps.videos.status.videoAdded"));

        setUrlInput("");
        setIsAddDialogOpen(false);
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
          console.log(
            `[Videos] Video ID ${videoId} found in playlist. Playing.`
          );
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
          console.log(
            `[Videos] Video ID ${videoId} not found. Adding and playing.`
          );
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
    setIsShuffled(!isShuffled);
    showStatus(
      isShuffled
        ? t("apps.videos.status.shuffleOff")
        : t("apps.videos.status.shuffleOn")
    );
  }, [isShuffled, setIsShuffled, showStatus, t]);

  const handleVideoEnd = useCallback(() => {
    if (loopCurrent) {
      playerRef.current?.seekTo(0);
      setIsPlaying(true);
    } else {
      nextVideo();
    }
  }, [loopCurrent, setIsPlaying, nextVideo]);

  const handleProgress = useCallback((state: { playedSeconds: number }) => {
    setPlayedSeconds(state.playedSeconds);
    setElapsedTime(Math.floor(state.playedSeconds));
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
    // Don't update state if we're in the middle of a track/fullscreen switch
    if (isTrackSwitchingRef.current) {
      return;
    }
    setIsPlaying(true);
  }, [setIsPlaying]);

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

  const handleFullScreen = useCallback(() => {
    // Mark as track switching to prevent spurious play/pause events during sync
    startTrackSwitch();
    setIsFullScreen(true);
    showStatus(t("apps.videos.status.fullscreen"));
  }, [startTrackSwitch, showStatus, t]);

  const handleCloseFullScreen = useCallback(() => {
    // Mark as track switching to prevent spurious play/pause events during sync
    startTrackSwitch();
    setIsFullScreen(false);
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

  // Reset elapsed time when changing tracks
  useEffect(() => {
    setElapsedTime(0);
  }, [currentVideoId]);

  // Shuffle initialization
  useEffect(() => {
    if (isShuffled) {
      const shuffled = [...videos].sort(() => Math.random() - 0.5);
      setVideos(shuffled);
    } else {
      setVideos([...originalOrder]);
    }
  }, [isShuffled]);

  // Keep original order in sync with new additions
  useEffect(() => {
    if (!isShuffled) {
      setOriginalOrder(videos);
    }
  }, [videos, isShuffled]);

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
      console.log(
        `[Videos] Processing initialData.videoId on mount: ${videoIdToProcess}`
      );

      toast.info(sharedVideoToastContent());

      // Process immediately without delay and with better error handling
      processVideoId(videoIdToProcess)
        .then(() => {
          // Use instanceId if available (new system), otherwise fallback to appId (legacy)
          if (instanceId) {
            clearInstanceInitialData(instanceId);
          }
          console.log(
            `[Videos] Successfully processed and cleared initialData for ${videoIdToProcess}`
          );
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
  useCustomEventListener<{
    appId: string;
    instanceId?: string;
    initialData?: { videoId?: string };
  }>(
    "updateApp",
    (event) => {
      if (
        event.detail.appId === "videos" &&
        event.detail.initialData?.videoId &&
        (!event.detail.instanceId || event.detail.instanceId === instanceId)
      ) {
        // Skip if this videoId has already been processed
        if (
          lastProcessedVideoIdRef.current === event.detail.initialData.videoId
        )
          return;
        const videoId = event.detail.initialData.videoId;
        console.log(
          `[Videos] Received updateApp event with videoId: ${videoId}`
        );
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
        lastProcessedVideoIdRef.current = event.detail.initialData.videoId;
      }
    }
  );

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
    if (isFullScreen && !prevFullScreenRef.current) {
      // Just entered fullscreen - sync position from main player to fullscreen player
      const currentTime = playerRef.current?.getCurrentTime() || playedSeconds;
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
            trackSwitchTimeoutRef.current = setTimeout(() => {
              isTrackSwitchingRef.current = false;
            }, 500);
            return;
          }
        }
        // Player not ready yet, retry
        setTimeout(checkAndSync, 100);
      };
      setTimeout(checkAndSync, 100);
    }
    prevFullScreenRef.current = isFullScreen;
  }, [isFullScreen, playedSeconds, isPlaying]);

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
    elapsedTime,
    statusMessage,
    isShareDialogOpen,
    setIsShareDialogOpen,
    duration,
    playedSeconds,
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
    isXpTheme,
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
    handleFullScreen,
    handleCloseFullScreen,
    toggleFullScreen,
    handleShareVideo,
    videosGenerateShareUrl,
    addVideo,
    processVideoId,
    showStatus,
    formatTime,

    // Overlay handlers
    handleOverlayPointerDown,
    handleOverlayPointerMove,
    handleOverlayPointerUp,
    handleOverlayPointerCancel,

    // Constants
    DEFAULT_VIDEOS,
  };
}
