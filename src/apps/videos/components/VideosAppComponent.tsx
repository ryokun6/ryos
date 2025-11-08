import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactPlayer from "react-player";
import { cn } from "@/lib/utils";
import { AppProps, VideosInitialData } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { VideosMenuBar } from "./VideosMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { helpItems, appMetadata } from "..";
import { useVideoStore, DEFAULT_VIDEOS } from "@/stores/useVideoStore";
import { Button } from "@/components/ui/button";
import { useSound, Sounds } from "@/hooks/useSound";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { toast } from "sonner";
import { useAppStore } from "@/stores/useAppStore";
import { SeekBar } from "./SeekBar";
import { useThemeStore } from "@/stores/useThemeStore";

interface Video {
  id: string;
  url: string;
  title: string;
  artist?: string;
}

function AnimatedDigit({
  digit,
  direction,
}: {
  digit: string;
  direction: "next" | "prev";
}) {
  const yOffset = direction === "next" ? 30 : -30;

  return (
    <div className="relative w-[0.6em] h-[28px] overflow-hidden inline-block">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={digit}
          initial={{ y: yOffset, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: yOffset, opacity: 0 }}
          transition={{
            y: {
              type: "spring",
              stiffness: 300,
              damping: 30,
            },
            opacity: {
              duration: 0.2,
            },
          }}
          className="absolute inset-0 flex justify-center"
        >
          {digit}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function AnimatedNumber({ number }: { number: number }) {
  const [prevNumber, setPrevNumber] = useState(number);
  const direction = number > prevNumber ? "next" : "prev";

  useEffect(() => {
    setPrevNumber(number);
  }, [number]);

  const digits = String(number).padStart(2, "0").split("");
  return (
    <div className="flex">
      {digits.map((digit, index) => (
        <AnimatedDigit key={index} digit={digit} direction={direction} />
      ))}
    </div>
  );
}

function AnimatedTitle({
  title,
  direction,
  isPlaying,
}: {
  title: string;
  direction: "next" | "prev";
  isPlaying: boolean;
}) {
  const yOffset = direction === "next" ? 30 : -30;

  return (
    <div className="relative h-[22px] mb-[3px] overflow-hidden">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={title}
          initial={{ y: yOffset, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: yOffset, opacity: 0 }}
          transition={{
            y: {
              type: "spring",
              stiffness: 300,
              damping: 30,
            },
            opacity: {
              duration: 0.2,
            },
          }}
          className="absolute inset-0 flex whitespace-nowrap"
        >
          <motion.div
            initial={{ x: "0%" }}
            animate={{ x: isPlaying ? "-100%" : "0%" }}
            transition={
              isPlaying
                ? {
                    duration: 20,
                    ease: "linear",
                    repeat: Infinity,
                    repeatType: "loop",
                  }
                : {
                    duration: 0.3,
                  }
            }
            className={cn(
              "shrink-0 font-geneva-12 text-xl px-2 transition-colors duration-300 -mt-1 animated-title-text",
              isPlaying ? "text-[#ff00ff]" : "text-gray-600",
              !isPlaying && "opacity-50"
            )}
          >
            {title}
          </motion.div>
          <motion.div
            initial={{ x: "0%" }}
            animate={{ x: isPlaying ? "-100%" : "0%" }}
            transition={
              isPlaying
                ? {
                    duration: 20,
                    ease: "linear",
                    repeat: Infinity,
                    repeatType: "loop",
                  }
                : {
                    duration: 0.3,
                  }
            }
            className={cn(
              "shrink-0 font-geneva-12 text-xl px-2 transition-colors duration-300 -mt-1 animated-title-text",
              isPlaying ? "text-[#ff00ff]" : "text-gray-600",
              !isPlaying && "opacity-50"
            )}
            aria-hidden
          >
            {title}
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function WhiteNoiseEffect() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();
  const [brightness, setBrightness] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const drawNoise = () => {
      const imageData = ctx.createImageData(canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const value = Math.random() * 255 * brightness;
        data[i] = value; // R
        data[i + 1] = value; // G
        data[i + 2] = value; // B
        data[i + 3] = 255; // A
      }

      // Add scan lines
      for (let y = 0; y < canvas.height; y += 2) {
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          data[i] *= 0.8; // R
          data[i + 1] *= 0.8; // G
          data[i + 2] *= 0.8; // B
        }
      }

      ctx.putImageData(imageData, 0, 0);
      animationFrameRef.current = requestAnimationFrame(drawNoise);
    };

    const resizeCanvas = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    drawNoise();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [brightness]);

  // Animate brightness
  useEffect(() => {
    const duration = 1000; // 1 second animation
    const startTime = Date.now();
    const startBrightness = brightness;
    const targetBrightness = 1;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOut = 1 - Math.pow(1 - progress, 3); // Cubic ease out
      setBrightness(
        startBrightness + (targetBrightness - startBrightness) * easeOut
      );

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full pointer-events-none"
      style={{ position: "absolute", top: 0, left: 0 }}
    />
  );
}

function StatusDisplay({ message }: { message: string }) {
  return (
    <div className="relative videos-status">
      <div className="font-geneva-12 text-white text-xl relative z-10">
        {message}
      </div>
      <div
        className="font-geneva-12 text-black text-xl absolute inset-0"
        style={{
          textShadow: "none",
        }}
      >
        {message}
      </div>
    </div>
  );
}

export function VideosAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  initialData,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps<VideosInitialData>) {
  const { play: playVideoTape } = useSound(Sounds.VIDEO_TAPE);
  const { play: playButtonClick } = useSound(Sounds.BUTTON_CLICK);
  const videos = useVideoStore((s) => s.videos);
  const setVideos = useVideoStore((s) => s.setVideos);
  const currentVideoId = useVideoStore((s) => s.currentVideoId);
  const setCurrentVideoId = useVideoStore((s) => s.setCurrentVideoId);
  const getCurrentIndex = useVideoStore((s) => s.getCurrentIndex);
  const getCurrentVideo = useVideoStore((s) => s.getCurrentVideo);

  // Safe setter that ensures currentVideoId is valid
  const safeSetCurrentVideoId = (videoId: string | null) => {
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
  };
  const loopCurrent = useVideoStore((s) => s.loopCurrent);
  const setLoopCurrent = useVideoStore((s) => s.setLoopCurrent);
  const loopAll = useVideoStore((s) => s.loopAll);
  const setLoopAll = useVideoStore((s) => s.setLoopAll);
  const isShuffled = useVideoStore((s) => s.isShuffled);
  const setIsShuffled = useVideoStore((s) => s.setIsShuffled);
  const isPlaying = useVideoStore((s) => s.isPlaying);
  const togglePlayStore = useVideoStore((s) => s.togglePlay);
  const setIsPlaying = useVideoStore((s) => s.setIsPlaying);
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
  const playerRef = useRef<ReactPlayer>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const statusTimeoutRef = useRef<NodeJS.Timeout>();
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [duration, setDuration] = useState(0);
  const [playedSeconds, setPlayedSeconds] = useState(0);
  const [isVideoHovered, setIsVideoHovered] = useState(false);
  const [isDraggingSeek, setIsDraggingSeek] = useState(false);
  const [dragSeekTime, setDragSeekTime] = useState(0);

  // Ref to detect paused -> playing transitions so we can auto-show the SeekBar
  const prevIsPlayingRef = useRef(isPlaying);
  const autoShowHoverResetRef = useRef<NodeJS.Timeout | null>(null);

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

  // Track pointer/touch interactions on the video area so we can distinguish tap vs swipe on mobile.
  // If the user swipes (moves more than a small threshold), we'll reveal the SeekBar but NOT toggle play/pause.
  // If the user taps (no significant movement), we'll toggle play/pause as before.
  const touchGestureRef = useRef<{
    startX: number;
    startY: number;
    moved: boolean;
    pointerId: number | null;
  } | null>(null);
  const SWIPE_MOVE_THRESHOLD = 10; // px

  const handleOverlayPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
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
  };

  const handleOverlayPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
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
  };

  const handleOverlayPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
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
  };

  const handleOverlayPointerCancel = () => {
    // Reset and allow SeekBar to dismiss
    touchGestureRef.current = null;
    setIsVideoHovered(false);
  };

  // --- App Store hooks ---
  const bringToForeground = useAppStore((state) => state.bringToForeground);
  const clearInstanceInitialData = useAppStore(
    (state) => state.clearInstanceInitialData
  );

  // --- Prevent unwanted autoplay on Mobile Safari ---
  const hasAutoplayCheckedRef = useRef(false);
  // Track the last processed videoId to avoid duplicates
  const lastProcessedVideoIdRef = useRef<string | null>(null);
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

  // Function to show status message
  const showStatus = (message: string) => {
    setStatusMessage(message);
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
    }
    statusTimeoutRef.current = setTimeout(() => {
      setStatusMessage(null);
    }, 2000);
  };

  // Update animation direction before changing currentVideoId
  const updateCurrentVideoId = (
    videoId: string | null,
    direction: "next" | "prev"
  ) => {
    setAnimationDirection(direction);
    safeSetCurrentVideoId(videoId);
  };

  const nextVideo = () => {
    if (videos.length === 0) return;
    playButtonClick();

    const currentIndex = getCurrentIndex();
    if (currentIndex === videos.length - 1) {
      if (loopAll) {
        showStatus("REPEATING PLAYLIST");
        updateCurrentVideoId(videos[0].id, "next");
      }
      // If not looping, stay on current video
    } else {
      showStatus("NEXT ⏭");
      updateCurrentVideoId(videos[currentIndex + 1].id, "next");
    }
    setIsPlaying(true);
  };

  const previousVideo = () => {
    if (videos.length === 0) return;
    playButtonClick();

    const currentIndex = getCurrentIndex();
    if (currentIndex === 0) {
      if (loopAll) {
        showStatus("REPEATING PLAYLIST");
        updateCurrentVideoId(videos[videos.length - 1].id, "prev");
      }
      // If not looping, stay on current video
    } else {
      showStatus("PREV ⏮");
      updateCurrentVideoId(videos[currentIndex - 1].id, "prev");
    }
    setIsPlaying(true);
  };

  // Reset elapsed time when changing tracks
  useEffect(() => {
    setElapsedTime(0);
  }, [currentVideoId]);

  // Replace the existing useEffect for shuffle initialization
  useEffect(() => {
    if (isShuffled) {
      const shuffled = [...videos].sort(() => Math.random() - 0.5);
      setVideos(shuffled);
    } else {
      setVideos([...originalOrder]);
    }
  }, [isShuffled]); // Run when shuffle state changes

  // Keep original order in sync with new additions
  useEffect(() => {
    if (!isShuffled) {
      setOriginalOrder(videos);
    }
  }, [videos, isShuffled]);

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(
      remainingSeconds
    ).padStart(2, "0")}`;
  };

  const extractVideoId = (url: string): string | null => {
    const regExp =
      /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[7].length === 11 ? match[7] : null;
  };

  const addVideo = async (url: string) => {
    setIsAddingVideo(true);
    try {
      const videoId = extractVideoId(url);
      if (!videoId) {
        throw new Error("Invalid YouTube URL");
      }

      // 1. Fetch initial info from oEmbed
      const oembedResponse = await fetch(
        `https://www.youtube.com/oembed?url=http://www.youtube.com/watch?v=${videoId}&format=json`
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
        const parseResponse = await fetch("/api/parse-title", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: rawTitle,
            author_name: authorName,
          }),
        });

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

      showStatus("VIDEO ADDED"); // Update status message

      setUrlInput("");
      setIsAddDialogOpen(false);
    } catch (error) {
      console.error("Failed to add video:", error);
      showStatus(
        `Error adding: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      // Reset state on error to prevent inconsistent state
      if (videos.length > 0) {
        safeSetCurrentVideoId(videos[videos.length - 1].id);
      }
      setIsPlaying(false);
    } finally {
      setIsAddingVideo(false);
    }
  };

  // --- Simplified: Function to add and play video by ID ---
  const handleAddAndPlayVideoById = async (videoId: string) => {
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    try {
      await addVideo(youtubeUrl); // addVideo sets current index and plays

      // Check if on iOS Safari and show appropriate status message
      const ua = navigator.userAgent;
      const isIOS = /iP(hone|od|ad)/.test(ua);
      const isSafari =
        /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua);

      if (isIOS && isSafari) {
        showStatus("PRESS ⏯ TO PLAY");
      }
    } catch (error) {
      console.error(
        `[Videos] Error adding video for videoId ${videoId}:`,
        error
      );
      showStatus(`Failed to add video`);
      throw error; // Re-throw to let caller handle
    }
  };

  // --- Simplified: Function to process video ID (find or add/play) ---
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
          showStatus(`▶ Playing ${currentVideos[existingVideoIndex].title}`);
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
        showStatus(`Failed to process video: ${videoId}`);
        throw error; // Re-throw to let caller handle
      }
    },
    [safeSetCurrentVideoId, setIsPlaying, handleAddAndPlayVideoById, showStatus]
  );

  // --- Simplified: Effect for initial data on mount ---
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

      toast.info(
        <>
          Opened shared video. Press <span className="font-chicago">⏯</span> to
          start playing.
        </>
      );

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
          toast.error("Failed to load shared video", {
            description: `Video ID: ${videoIdToProcess}`,
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
  ]);

  // --- NEW: Effect for updateApp event (when app is already open) ---
  useEffect(() => {
    const handleUpdateApp = (
      event: CustomEvent<{ appId: string; initialData?: { videoId?: string } }>
    ) => {
      if (
        event.detail.appId === "videos" &&
        event.detail.initialData?.videoId
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
        bringToForeground("videos");
        toast.info(
          <>
            Opened shared video. Press <span className="font-chicago">⏯</span>{" "}
            to start playing.
          </>
        );
        processVideoId(videoId).catch((error) => {
          console.error(
            `[Videos] Error processing videoId ${videoId} from updateApp event:`,
            error
          );
          toast.error("Failed to load shared video", {
            description: `Video ID: ${videoId}`,
          });
        });
        // Mark this videoId as processed
        lastProcessedVideoIdRef.current = event.detail.initialData.videoId;
      }
    };

    window.addEventListener("updateApp", handleUpdateApp as EventListener);
    return () => {
      window.removeEventListener("updateApp", handleUpdateApp as EventListener);
    };
  }, [processVideoId, bringToForeground]);

  const togglePlay = () => {
    togglePlayStore();
    showStatus(!isPlaying ? "PLAY ▶" : "PAUSED ⏸");
    playVideoTape();
  };

  const toggleShuffle = () => {
    setIsShuffled(!isShuffled);
    showStatus(isShuffled ? "SHUFFLE OFF" : "SHUFFLE ON");
  };

  const handleVideoEnd = () => {
    if (loopCurrent) {
      playerRef.current?.seekTo(0);
      setIsPlaying(true);
    } else {
      nextVideo();
    }
  };

  const handleProgress = (state: { playedSeconds: number }) => {
    setPlayedSeconds(state.playedSeconds);
    setElapsedTime(Math.floor(state.playedSeconds));
  };

  const handleDuration = (duration: number) => {
    setDuration(duration);
  };

  const handleSeek = (time: number) => {
    if (playerRef.current) {
      playerRef.current.seekTo(time, "seconds");
    }
  };

  // Add new handlers for YouTube player state sync
  const handlePlay = () => {
    setIsPlaying(true);
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  const handleReady = () => {
    // Always start from beginning but don't auto-play
    playerRef.current?.seekTo(0);
    // setIsPlaying(false);
  };

  const handleFullScreen = () => {
    try {
      // First try to get the iframe element
      const playerElement = playerRef.current?.getInternalPlayer();

      // For YouTube videos, the player is inside an iframe
      if (playerElement) {
        // Try to find the iframe element
        const iframe = playerElement.getIframe
          ? playerElement.getIframe()
          : playerElement;

        if (iframe && iframe.requestFullscreen) {
          iframe.requestFullscreen();
          showStatus("FULLSCREEN");
          return;
        }
      }

      // Fallback: try to find the iframe directly in the DOM
      const playerContainer = document.querySelector(".react-player iframe");
      if (playerContainer && playerContainer.requestFullscreen) {
        playerContainer.requestFullscreen();
        showStatus("FULLSCREEN");
        return;
      }

      // Last resort: make the container fullscreen
      const container = document.querySelector(".react-player");
      if (container && container.requestFullscreen) {
        container.requestFullscreen();
        showStatus("FULLSCREEN");
      }
    } catch (error) {
      console.error("Fullscreen error:", error);
    }
  };

  // --- NEW: Handler to open share dialog ---
  const handleShareVideo = () => {
    if (videos.length > 0 && currentVideoId) {
      setIsShareDialogOpen(true);
    }
  };

  // --- NEW: Generate share URL function ---
  const videosGenerateShareUrl = (videoId: string): string => {
    return `${window.location.origin}/videos/${videoId}`;
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isMacOSTheme = currentTheme === "macosx";

  const menuBar = (
    <VideosMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      videos={videos}
      currentVideoId={currentVideoId}
      onPlayVideo={(videoId) => {
        safeSetCurrentVideoId(videoId);
        setIsPlaying(true);
      }}
      onClearPlaylist={() => {
        setIsConfirmClearOpen(true);
      }}
      onResetPlaylist={() => {
        setIsConfirmResetOpen(true);
      }}
      onShufflePlaylist={toggleShuffle}
      onToggleLoopAll={() => setLoopAll(!loopAll)}
      onToggleLoopCurrent={() => setLoopCurrent(!loopCurrent)}
      onTogglePlay={() => {
        togglePlay();
      }}
      onNext={nextVideo}
      onPrevious={previousVideo}
      onAddVideo={() => setIsAddDialogOpen(true)}
      onOpenVideo={() => {
        setIsAddDialogOpen(true);
      }}
      isPlaying={isPlaying}
      isLoopAll={loopAll}
      isLoopCurrent={loopCurrent}
      isShuffled={isShuffled}
      onFullScreen={handleFullScreen}
      onShareVideo={handleShareVideo}
    />
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title="Videos"
        onClose={onClose}
        isForeground={isForeground}
        appId="videos"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        <div className="flex flex-col w-full h-full bg-[#1a1a1a] text-white">
          <div className="flex-1 relative">
            {videos.length > 0 ? (
              <div
                className="w-full h-full overflow-hidden relative"
                onMouseEnter={() => setIsVideoHovered(true)}
                onMouseLeave={() => setIsVideoHovered(false)}
              >
                <div className="w-full h-[calc(100%+120px)] mt-[-60px] relative">
                  <ReactPlayer
                    ref={playerRef}
                    url={getCurrentVideo()?.url || ""}
                    playing={isPlaying}
                    controls={false}
                    width="100%"
                    height="100%"
                    onEnded={handleVideoEnd}
                    onProgress={handleProgress}
                    onDuration={handleDuration}
                    onPlay={handlePlay}
                    onPause={handlePause}
                    onReady={handleReady}
                    loop={loopCurrent}
                    playsinline
                    config={{
                      youtube: {
                        playerVars: {
                          modestbranding: 1,
                          rel: 0,
                          showinfo: 0,
                          iv_load_policy: 3,
                          fs: 0,
                          disablekb: 1,
                          playsinline: 1,
                          autoplay: 0,
                        },
                      },
                    }}
                  />
                  {/* White noise effect (z-10) */}
                  <AnimatePresence>
                    {!isPlaying && (
                      <motion.div
                        initial={{ opacity: 0, scale: 1.15 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.15 }}
                        transition={{
                          duration: 0.2,
                          delay: 0.1,
                          ease: [0.4, 0, 0.2, 1],
                        }}
                        className="absolute inset-0 z-10"
                      >
                        <WhiteNoiseEffect />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {/* Pointer-interaction overlay for play/pause + swipe-to-show-seekbar (z-20) */}
                  <div
                    className="absolute inset-0 cursor-pointer z-20"
                    aria-label={isPlaying ? "Pause" : "Play"}
                    onPointerDown={handleOverlayPointerDown}
                    onPointerMove={handleOverlayPointerMove}
                    onPointerUp={handleOverlayPointerUp}
                    onPointerCancel={handleOverlayPointerCancel}
                  />
                </div>
                {/* SeekBar positioned at the bottom (z-30) - moved outside oversized container */}
                <div className="absolute bottom-0 left-0 right-0 z-30">
                  <SeekBar
                    duration={duration}
                    currentTime={playedSeconds}
                    onSeek={handleSeek}
                    isPlaying={isPlaying}
                    isHovered={isVideoHovered}
                    onDragChange={(isDragging, seekTime) => {
                      setIsDraggingSeek(isDragging);
                      if (seekTime !== undefined) {
                        setDragSeekTime(seekTime);
                      }
                    }}
                  />
                </div>
                {/* Status Display (z-40) - moved outside oversized container */}
                <AnimatePresence>
                  {statusMessage && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="absolute top-4 left-4 z-40"
                    >
                      <StatusDisplay message={statusMessage} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400 font-geneva-12 text-sm">
                <a
                  onClick={() => setIsAddDialogOpen(true)}
                  className="text-[#ff00ff] hover:underline cursor-pointer"
                >
                  Add videos
                </a>
                &nbsp;to get started
              </div>
            )}
          </div>

          {/* Retro CD Player Controls */}
          <div
            className={cn(
              "p-4 bg-[#2a2a2a] border-t border-[#3a3a3a] flex flex-col gap-4",
              "os-toolbar-texture"
            )}
          >
            {/* LCD Display */}
            <div className="videos-lcd bg-black py-2 px-4 flex items-center justify-between w-full">
              <div className="flex items-center gap-8">
                <div
                  className={cn(
                    "font-geneva-12 text-[10px] transition-colors duration-300",
                    isPlaying ? "text-[#ff00ff]" : "text-gray-600"
                  )}
                >
                  <div>Track</div>
                  <div className="text-xl">
                    <AnimatedNumber number={getCurrentIndex() + 1} />
                  </div>
                </div>
                <div
                  className={cn(
                    "font-geneva-12 text-[10px] transition-colors duration-300",
                    isPlaying ? "text-[#ff00ff]" : "text-gray-600"
                  )}
                >
                  <div>Time</div>
                  <div className="text-xl">
                    {formatTime(
                      isDraggingSeek ? Math.floor(dragSeekTime) : elapsedTime
                    )}
                  </div>
                </div>
              </div>
              <div className="relative overflow-hidden flex-1 px-2">
                <div
                  className={cn(
                    "font-geneva-12 text-[10px] transition-colors duration-300 mb-[3px] pl-2",
                    isPlaying ? "text-[#ff00ff]" : "text-gray-600"
                  )}
                >
                  Title
                </div>
                {videos.length > 0 && (
                  <div className="relative overflow-hidden">
                    <AnimatedTitle
                      title={
                        getCurrentVideo()?.artist
                          ? `${getCurrentVideo()?.title} - ${
                              getCurrentVideo()?.artist
                            }`
                          : getCurrentVideo()?.title || ""
                      }
                      direction={animationDirection}
                      isPlaying={isPlaying}
                    />
                    {/* Fade effects */}
                    {isPlaying && (
                      <div className="absolute left-0 top-0 h-full w-4 bg-gradient-to-r from-black to-transparent videos-lcd-fade-left" />
                    )}
                    <div className="absolute right-0 top-0 h-full w-4 bg-gradient-to-l from-black to-transparent videos-lcd-fade-right" />
                  </div>
                )}
              </div>
            </div>

            {/* All Controls in One Row */}
            <div className="flex items-center justify-between videos-player-controls">
              {/* Left Side: Playback Controls */}
              <div className="flex items-center gap-2">
                {isMacOSTheme ? (
                  <div className="flex gap-0 aqua-select-group">
                    <Button
                      onClick={previousVideo}
                      variant="aqua_select"
                      disabled={videos.length === 0}
                      className="aqua-compact font-chicago"
                    >
                      <span className="translate-y-[2px] inline-block">⏮</span>
                    </Button>
                    <Button
                      onClick={togglePlay}
                      variant="aqua_select"
                      disabled={videos.length === 0}
                      className="aqua-compact-wide font-chicago"
                    >
                      <span className="translate-y-[2px] inline-block">{isPlaying ? "⏸" : "▶"}</span>
                    </Button>
                    <Button
                      onClick={nextVideo}
                      variant="aqua_select"
                      disabled={videos.length === 0}
                      className="aqua-compact font-chicago"
                    >
                      <span className="translate-y-[2px] inline-block">⏭</span>
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-0">
                    <button
                      onClick={previousVideo}
                      className={cn(
                        "flex items-center justify-center disabled:opacity-50 focus:outline-none",
                        "hover:brightness-75 active:brightness-50"
                      )}
                      disabled={videos.length === 0}
                    >
                      <img
                        src="/assets/videos/prev.png"
                        alt="Previous"
                        width={32}
                        height={22}
                        className="pointer-events-none"
                      />
                    </button>
                    <button
                      onClick={togglePlay}
                      className={cn(
                        "flex items-center justify-center disabled:opacity-50 focus:outline-none",
                        "hover:brightness-75 active:brightness-50"
                      )}
                      disabled={videos.length === 0}
                    >
                      <img
                        src={
                          isPlaying
                            ? "/assets/videos/pause.png"
                            : "/assets/videos/play.png"
                        }
                        alt={isPlaying ? "Pause" : "Play"}
                        width={50}
                        height={22}
                        className="pointer-events-none"
                      />
                    </button>
                    <button
                      onClick={nextVideo}
                      className={cn(
                        "flex items-center justify-center disabled:opacity-50 focus:outline-none",
                        "hover:brightness-75 active:brightness-50"
                      )}
                      disabled={videos.length === 0}
                    >
                      <img
                        src="/assets/videos/next.png"
                        alt="Next"
                        width={32}
                        height={22}
                        className="pointer-events-none"
                      />
                    </button>
                  </div>
                )}
              </div>

              {/* Right Side: Mode Switches */}
              <div className="flex items-center gap-2">
                {isMacOSTheme ? (
                  <>
                    <div className="flex gap-0 aqua-select-group">
                      <Button
                        onClick={toggleShuffle}
                        variant="aqua_select"
                        data-state={isShuffled ? "on" : "off"}
                        className="px-2 aqua-compact font-geneva-12 !text-[11px]"
                      >
                        SHUFFLE
                      </Button>
                      <Button
                        onClick={() => setLoopAll(!loopAll)}
                        variant="aqua_select"
                        data-state={loopAll ? "on" : "off"}
                        className="px-2 aqua-compact font-geneva-12 !text-[11px]"
                      >
                        REPEAT
                      </Button>
                      <Button
                        onClick={() => setLoopCurrent(!loopCurrent)}
                        variant="aqua_select"
                        data-state={loopCurrent ? "on" : "off"}
                        className="px-2 aqua-compact font-geneva-12 !text-[11px]"
                      >
                        {loopCurrent ? "↺" : "→"}
                      </Button>
                    </div>
                    <Button
                      onClick={() => setIsAddDialogOpen(true)}
                      variant="aqua_select"
                      className="px-2 aqua-compact font-geneva-12 !text-[11px]"
                    >
                      ADD
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="flex gap-0">
                      <Button
                        onClick={toggleShuffle}
                        variant="player"
                        data-state={isShuffled ? "on" : "off"}
                        className="h-[22px] px-2"
                      >
                        SHUFFLE
                      </Button>
                      <Button
                        onClick={() => setLoopAll(!loopAll)}
                        variant="player"
                        data-state={loopAll ? "on" : "off"}
                        className="h-[22px] px-2"
                      >
                        REPEAT
                      </Button>
                      <Button
                        onClick={() => setLoopCurrent(!loopCurrent)}
                        variant="player"
                        data-state={loopCurrent ? "on" : "off"}
                        className="h-[22px] px-2"
                      >
                        {loopCurrent ? "↺" : "→"}
                      </Button>
                    </div>
                    <Button
                      onClick={() => setIsAddDialogOpen(true)}
                      variant="player"
                      className="h-[22px] px-2"
                    >
                      ADD
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        <HelpDialog
          isOpen={isHelpDialogOpen}
          onOpenChange={setIsHelpDialogOpen}
          helpItems={helpItems}
          appName="Videos"
        />
        <AboutDialog
          isOpen={isAboutDialogOpen}
          onOpenChange={setIsAboutDialogOpen}
          metadata={appMetadata}
        />
        <ConfirmDialog
          isOpen={isConfirmClearOpen}
          onOpenChange={setIsConfirmClearOpen}
          onConfirm={() => {
            setVideos([]);
            safeSetCurrentVideoId(null);
            setIsPlaying(false);
            setIsConfirmClearOpen(false);
          }}
          title="Clear Playlist"
          description="Are you sure you want to clear the entire playlist? This action cannot be undone."
        />
        <ConfirmDialog
          isOpen={isConfirmResetOpen}
          onOpenChange={setIsConfirmResetOpen}
          onConfirm={() => {
            setVideos(DEFAULT_VIDEOS);
            safeSetCurrentVideoId(
              DEFAULT_VIDEOS.length > 0 ? DEFAULT_VIDEOS[0].id : null
            );
            setIsPlaying(false);
            setOriginalOrder(DEFAULT_VIDEOS);
            setIsConfirmResetOpen(false);
            showStatus("PLAYLIST RESET");
          }}
          title="Reset Playlist"
          description="Are you sure you want to reset the playlist to default videos? This will replace your current playlist."
        />
        <InputDialog
          isOpen={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
          onSubmit={addVideo}
          title="Add Video"
          description="Enter YouTube, Vimeo, or a video URL"
          value={urlInput}
          onChange={setUrlInput}
          isLoading={isAddingVideo}
        />
        {/* Add ShareItemDialog */}
        <ShareItemDialog
          isOpen={isShareDialogOpen}
          onClose={() => setIsShareDialogOpen(false)}
          itemType="Video"
          itemIdentifier={getCurrentVideo()?.id || ""}
          title={getCurrentVideo()?.title}
          details={getCurrentVideo()?.artist}
          generateShareUrl={videosGenerateShareUrl}
        />
      </WindowFrame>
    </>
  );
}
