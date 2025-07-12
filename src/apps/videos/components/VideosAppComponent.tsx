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
              "shrink-0 font-geneva-12 px-2 transition-colors duration-300",
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
              "shrink-0 font-geneva-12 px-2 transition-colors duration-300",
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
  const [scanLineOffset, setScanLineOffset] = useState(0);

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

  // Animate scan lines
  useEffect(() => {
    const interval = setInterval(() => {
      setScanLineOffset((prev) => (prev + 1) % 2);
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div
        className="absolute inset-0"
        style={{
          background: "rgba(0,0,0,0.1)",
          opacity: 1 - brightness,
          transition: "opacity 0.05s linear",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(
            to bottom,
            rgba(0,0,0,0.1) 0%,
            rgba(0,0,0,0.1) 50%,
            rgba(0,0,0,0.1) 100%
          )`,
          transform: `translateY(${scanLineOffset}px)`,
          transition: "transform 0.1s linear",
        }}
      />
    </div>
  );
}

function StatusDisplay({ message }: { message: string }) {
  return (
    <div className="absolute top-4 left-4 pointer-events-none">
      <div className="relative">
        <div className="font-geneva-12 text-white text-xl relative z-10">
          {message}
        </div>
        <div
          className="font-geneva-12 text-black text-xl absolute inset-0"
          style={{
            WebkitTextStroke: "3px black",
            textShadow: "none",
          }}
        >
          {message}
        </div>
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
  const currentIndex = useVideoStore((s) => s.currentIndex);
  const setCurrentIndex = useVideoStore((s) => s.setCurrentIndex);
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

  // --- App Store hooks ---
  const bringToForeground = useAppStore((state) => state.bringToForeground);
  const clearInstanceInitialData = useAppStore(
    (state) => state.clearInstanceInitialData
  );

  // --- Prevent unwanted autoplay on Mobile Safari ---
  const hasAutoplayCheckedRef = useRef(false);
  // Track the last processed initialData to avoid duplicates
  const lastProcessedInitialDataRef = useRef<unknown>(null);
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

  // Update animation direction before changing currentIndex
  const updateCurrentIndex = (
    indexOrUpdater: number | ((prev: number) => number)
  ) => {
    const newIndex =
      typeof indexOrUpdater === "number"
        ? indexOrUpdater
        : indexOrUpdater(currentIndex);
    setAnimationDirection(newIndex > currentIndex ? "next" : "prev");
    setCurrentIndex(newIndex);
  };

  const nextVideo = () => {
    if (videos.length === 0) return;
    playButtonClick();
    updateCurrentIndex((prev: number) => {
      if (prev === videos.length - 1) {
        if (loopAll) {
          showStatus("REPEATING PLAYLIST");
          return 0;
        }
        return prev;
      }
      showStatus("NEXT ⏭");
      return prev + 1;
    });
    setIsPlaying(true);
  };

  const previousVideo = () => {
    if (videos.length === 0) return;
    playButtonClick();
    updateCurrentIndex((prev: number) => {
      if (prev === 0) {
        if (loopAll) {
          showStatus("REPEATING PLAYLIST");
          return videos.length - 1;
        }
        return prev;
      }
      showStatus("PREV ⏮");
      return prev - 1;
    });
    setIsPlaying(true);
  };

  // Reset elapsed time when changing tracks
  useEffect(() => {
    setElapsedTime(0);
  }, [currentIndex]);

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

      setVideos((prev) => {
        const newVideos = [...prev, newVideo];
        // Update original order if not shuffled
        if (!isShuffled) {
          setOriginalOrder(newVideos);
        }
        // Set current index and start playing the new video
        setCurrentIndex(newVideos.length - 1);
        setIsPlaying(true);
        return newVideos;
      });

      showStatus("VIDEO ADDED"); // Update status message

      setUrlInput("");
      setIsAddDialogOpen(false);
    } catch (error) {
      console.error("Failed to add video:", error);
      showStatus(
        `❌ Error adding: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    } finally {
      setIsAddingVideo(false);
    }
  };

  // --- NEW: Function to add and play video by ID ---
  const handleAddAndPlayVideoById = async (videoId: string) => {
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    try {
      await addVideo(youtubeUrl); // addVideo sets current index and plays
      showStatus(`▶ Playing shared video`);
    } catch (error) {
      console.error(
        `[Videos] Error adding video for videoId ${videoId}:`,
        error
      );
      showStatus(`❌ Error adding ${videoId}`);
    }
  };

  // --- NEW: Function to process video ID (find or add/play) ---
  const processVideoId = useCallback(
    async (videoId: string) => {
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
        console.log(`[Videos] Video ID ${videoId} found in playlist. Playing.`);
        setCurrentIndex(existingVideoIndex);
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
        // --- Only set playing if allowed ---
        if (shouldAutoplay) {
          const newIndex = useVideoStore.getState().currentIndex;
          const addedVideo = useVideoStore.getState().videos[newIndex];
          if (addedVideo?.id === videoId) {
            setIsPlaying(true);
          } else {
            console.warn(
              "[Videos] Index mismatch after adding video, autoplay skipped."
            );
          }
        }
      }
    },
    [setCurrentIndex, setIsPlaying, handleAddAndPlayVideoById, showStatus]
  );

  // --- NEW: Effect for initial data on mount ---
  useEffect(() => {
    if (
      isWindowOpen &&
      initialData?.videoId &&
      typeof initialData.videoId === "string"
    ) {
      // Skip if this initialData has already been processed
      if (lastProcessedInitialDataRef.current === initialData) return;
      
      const videoIdToProcess = initialData.videoId;
      
      // Validate videoId format
      if (!videoIdToProcess || videoIdToProcess.length !== 11) {
        console.error(`[Videos] Invalid videoId format: ${videoIdToProcess}`);
        toast.error("Invalid video ID format");
        if (instanceId) {
          clearInstanceInitialData(instanceId);
        }
        return;
      }
      
      console.log(
        `[Videos] Processing initialData.videoId on mount: ${videoIdToProcess}`
      );
      toast.info("Opening shared video...");
      setTimeout(() => {
        processVideoId(videoIdToProcess)
          .then(() => {
            // Use instanceId if available (new system), otherwise fallback to appId (legacy)
            if (instanceId) {
              clearInstanceInitialData(instanceId);
            }
            console.log(
              `[Videos] Cleared initialData after processing ${videoIdToProcess}`
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
            // Clear the corrupted initial data even on error
            if (instanceId) {
              clearInstanceInitialData(instanceId);
            }
          });
      }, 100);
      // Mark this initialData as processed
      lastProcessedInitialDataRef.current = initialData;
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
        // Skip if this initialData has already been processed
        if (lastProcessedInitialDataRef.current === event.detail.initialData)
          return;
        
        const videoId = event.detail.initialData.videoId;
        
        // Validate videoId format
        if (!videoId || typeof videoId !== 'string' || videoId.length !== 11) {
          console.error(`[Videos] Invalid videoId format in updateApp event: ${videoId}`);
          toast.error("Invalid video ID format");
          return;
        }
        
        console.log(
          `[Videos] Received updateApp event with videoId: ${videoId}`
        );
        bringToForeground("videos");
        toast.info("Opening shared video...");
        processVideoId(videoId).catch((error) => {
          console.error(
            `[Videos] Error processing videoId ${videoId} from updateApp event:`,
            error
          );
          toast.error("Failed to load shared video", {
            description: `Video ID: ${videoId}`,
          });
        });
        // Mark this initialData as processed
        lastProcessedInitialDataRef.current = event.detail.initialData;
      }
    };

    window.addEventListener("updateApp", handleUpdateApp as EventListener);
    return () => {
      window.removeEventListener("updateApp", handleUpdateApp as EventListener);
    };
  }, [processVideoId, bringToForeground]);

  const togglePlay = () => {
    togglePlayStore();
    showStatus(!isPlaying ? "PLAY ▶" : "PAUSED ❙❙");
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
    setElapsedTime(Math.floor(state.playedSeconds));
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
    if (videos.length > 0 && currentIndex >= 0) {
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

  if (!isWindowOpen) return null;

  return (
    <>
      <VideosMenuBar
        onClose={onClose}
        onShowHelp={() => setIsHelpDialogOpen(true)}
        onShowAbout={() => setIsAboutDialogOpen(true)}
        videos={videos}
        currentIndex={currentIndex}
        onPlayVideo={(index) => {
          setCurrentIndex(index);
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
        onNext={() => {
          if (currentIndex < videos.length - 1) {
            playButtonClick();
            setCurrentIndex(currentIndex + 1);
            setIsPlaying(true);
            showStatus("NEXT ⏭");
          }
        }}
        onPrevious={() => {
          if (currentIndex > 0) {
            playButtonClick();
            setCurrentIndex(currentIndex - 1);
            setIsPlaying(true);
            showStatus("PREV ⏮");
          }
        }}
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
      <WindowFrame
        title="Videos"
        onClose={onClose}
        isForeground={isForeground}
        appId="videos"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
      >
        <div className="flex flex-col w-full h-full bg-[#1a1a1a] text-white">
          <div className="flex-1 relative">
            {videos.length > 0 ? (
              <div className="w-full h-full overflow-hidden relative">
                <div
                  className="w-full pointer-events-none"
                  style={{ height: "calc(100% + 140px)", marginTop: "-70px" }}
                >
                  <ReactPlayer
                    ref={playerRef}
                    url={videos[currentIndex].url}
                    playing={isPlaying}
                    controls={false}
                    width="100%"
                    height="100%"
                    onEnded={handleVideoEnd}
                    onProgress={handleProgress}
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
                          autoplay: 0, // Ensure no autoplay
                        },
                      },
                    }}
                  />
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
                        className="absolute inset-0"
                      >
                        <WhiteNoiseEffect />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                {/* Clickable overlay for all browsers */}
                <div
                  className="absolute inset-0 cursor-pointer"
                  onClick={togglePlay}
                  aria-label={isPlaying ? "Pause" : "Play"}
                />
                {/* Status Display */}
                <AnimatePresence>
                  {statusMessage && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.2 }}
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
          <div className="p-4 bg-[#2a2a2a] border-t border-[#3a3a3a] flex flex-col gap-4">
            {/* LCD Display */}
            <div className="bg-black py-2 px-4 flex items-center justify-between w-full">
              <div className="flex items-center gap-8">
                <div
                  className={cn(
                    "font-geneva-12 text-[10px] transition-colors duration-300",
                    isPlaying ? "text-[#ff00ff]" : "text-gray-600"
                  )}
                >
                  <div>Track</div>
                  <div className="text-xl">
                    <AnimatedNumber number={currentIndex + 1} />
                  </div>
                </div>
                <div
                  className={cn(
                    "font-geneva-12 text-[10px] transition-colors duration-300",
                    isPlaying ? "text-[#ff00ff]" : "text-gray-600"
                  )}
                >
                  <div>Time</div>
                  <div className="text-xl">{formatTime(elapsedTime)}</div>
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
                        videos[currentIndex].artist
                          ? `${videos[currentIndex].title} - ${videos[currentIndex].artist}`
                          : videos[currentIndex].title
                      }
                      direction={animationDirection}
                      isPlaying={isPlaying}
                    />
                    {/* Fade effects */}
                    {isPlaying && (
                      <div className="absolute left-0 top-0 h-full w-4 bg-gradient-to-r from-black to-transparent" />
                    )}
                    <div className="absolute right-0 top-0 h-full w-4 bg-gradient-to-l from-black to-transparent" />
                  </div>
                )}
              </div>
            </div>

            {/* All Controls in One Row */}
            <div className="flex items-center justify-between">
              {/* Left Side: Playback Controls */}
              <div className="flex items-center gap-2">
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
              </div>

              {/* Right Side: Mode Switches */}
              <div className="flex items-center gap-2">
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
            setCurrentIndex(0);
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
            setCurrentIndex(0);
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
          itemIdentifier={videos[currentIndex]?.id || ""}
          title={videos[currentIndex]?.title}
          details={videos[currentIndex]?.artist}
          generateShareUrl={videosGenerateShareUrl}
        />
      </WindowFrame>
    </>
  );
}
