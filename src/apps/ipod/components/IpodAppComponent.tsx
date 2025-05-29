import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactPlayer from "react-player";
import { cn } from "@/lib/utils";
import { AppProps, IpodInitialData } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { IpodMenuBar } from "./IpodMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { helpItems, appMetadata } from "..";
import { useSound, Sounds } from "@/hooks/useSound";
import { useVibration } from "@/hooks/useVibration";
import { IpodScreen } from "./IpodScreen";
import { IpodWheel } from "./IpodWheel";
import { useIpodStore } from "@/stores/useIpodStore";
import { useShallow } from "zustand/react/shallow";
import { useIpodStoreShallow, useAppStoreShallow } from "@/stores/helpers";
import { useAppStore } from "@/stores/useAppStore";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { toast } from "sonner";
import { createPortal } from "react-dom";
import { LyricsDisplay } from "./LyricsDisplay";
import { useLyrics } from "@/hooks/useLyrics";

// Add this component definition before the IpodAppComponent
interface FullScreenPortalProps {
  children: React.ReactNode;
  onClose: () => void;
  togglePlay: () => void;
  nextTrack: () => void;
  previousTrack: () => void;
  seekTime: (delta: number) => void;
  showStatus: (message: string) => void;
  registerActivity: () => void;
  isPlaying: boolean;
  statusMessage: string | null;
}

function FullScreenPortal({
  children,
  onClose,
  togglePlay,
  nextTrack,
  previousTrack,
  seekTime,
  showStatus,
  registerActivity,
  isPlaying,
  statusMessage,
}: FullScreenPortalProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Use refs to store the latest values, avoiding stale closures
  const handlersRef = useRef({
    onClose,
    togglePlay,
    nextTrack,
    previousTrack,
    seekTime,
    showStatus,
    registerActivity,
  });

  // Update refs whenever props change
  useEffect(() => {
    handlersRef.current = {
      onClose,
      togglePlay,
      nextTrack,
      previousTrack,
      seekTime,
      showStatus,
      registerActivity,
    };
  }, [
    onClose,
    togglePlay,
    nextTrack,
    previousTrack,
    seekTime,
    showStatus,
    registerActivity,
  ]);

  // Touch handling for swipe gestures (left/right: navigate tracks, down: close fullscreen)
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(
    null
  );
  const SWIPE_THRESHOLD = 80; // Minimum swipe distance
  const MAX_SWIPE_TIME = 500; // Maximum time for a swipe (ms)
  const MAX_VERTICAL_DRIFT = 100; // Maximum cross-directional drift to still count as intended swipe

  // Stable event handlers using refs (no dependencies to avoid re-rendering)
  const handleTouchStart = useCallback((e: TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
  }, []);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (!touchStartRef.current) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const deltaTime = Date.now() - touchStartRef.current.time;

    // Check if this qualifies as a horizontal swipe
    const isHorizontalSwipe =
      Math.abs(deltaX) > SWIPE_THRESHOLD &&
      Math.abs(deltaY) < MAX_VERTICAL_DRIFT &&
      deltaTime < MAX_SWIPE_TIME;

    // Check if this qualifies as a downward swipe to close fullscreen
    const isDownwardSwipe =
      deltaY > SWIPE_THRESHOLD &&
      Math.abs(deltaX) < MAX_VERTICAL_DRIFT &&
      deltaTime < MAX_SWIPE_TIME;

    if (isHorizontalSwipe) {
      // Prevent default to avoid any conflicts
      e.preventDefault();

      const handlers = handlersRef.current;
      handlers.registerActivity();

      if (deltaX > 0) {
        // Swipe right - previous track
        handlers.previousTrack();
        // Show track info with symbol after small delay to allow state update
        setTimeout(() => {
          const currentTrackIndex = useIpodStore.getState().currentIndex;
          const currentTrack =
            useIpodStore.getState().tracks[currentTrackIndex];
          if (currentTrack) {
            const artistInfo = currentTrack.artist
              ? ` - ${currentTrack.artist}`
              : "";
            handlers.showStatus(`⏮ ${currentTrack.title}${artistInfo}`);
          }
        }, 100);
      } else {
        // Swipe left - next track
        handlers.nextTrack();
        // Show track info with symbol after small delay to allow state update
        setTimeout(() => {
          const currentTrackIndex = useIpodStore.getState().currentIndex;
          const currentTrack =
            useIpodStore.getState().tracks[currentTrackIndex];
          if (currentTrack) {
            const artistInfo = currentTrack.artist
              ? ` - ${currentTrack.artist}`
              : "";
            handlers.showStatus(`⏭ ${currentTrack.title}${artistInfo}`);
          }
        }, 100);
      }
    } else if (isDownwardSwipe) {
      // Swipe down - close fullscreen
      e.preventDefault();
      handlersRef.current.onClose();
    }

    touchStartRef.current = null;
  }, []);

  // Effect to request fullscreen when component mounts
  useEffect(() => {
    // Need a small delay to ensure the portal is mounted
    const timeoutId = setTimeout(() => {
      if (containerRef.current) {
        containerRef.current.requestFullscreen().catch((err) => {
          console.error("Error attempting to enable fullscreen:", err);
        });
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, []);

  // Effect to set up touch event listeners for swipe gestures
  // Now with stable handlers that don't change
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Use non-passive listeners so we can call preventDefault
    container.addEventListener("touchstart", handleTouchStart);
    container.addEventListener("touchend", handleTouchEnd);

    return () => {
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchend", handleTouchEnd);
    };
  }, []); // Empty dependency array - handlers are stable

  // Close full screen with Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const handlers = handlersRef.current;
      handlers.registerActivity();

      if (e.key === "Escape") {
        handlers.onClose();
      } else if (e.key === " ") {
        e.preventDefault(); // Prevent scrolling if space is pressed
        handlers.togglePlay();
        handlers.showStatus(isPlaying ? "❙ ❙" : "▶");
      } else if (e.key === "ArrowLeft") {
        // Seek backward instead of previous track
        handlers.seekTime(-5);
      } else if (e.key === "ArrowRight") {
        // Seek forward instead of next track
        handlers.seekTime(5);
      } else if (e.key === "ArrowUp") {
        // Use up arrow for previous track
        handlers.previousTrack();
        // Then show track info with symbol after a small delay to allow state update
        setTimeout(() => {
          const currentTrackIndex = useIpodStore.getState().currentIndex;
          const currentTrack =
            useIpodStore.getState().tracks[currentTrackIndex];
          if (currentTrack) {
            const artistInfo = currentTrack.artist
              ? ` - ${currentTrack.artist}`
              : "";
            handlers.showStatus(`⏮ ${currentTrack.title}${artistInfo}`);
          }
        }, 800);
      } else if (e.key === "ArrowDown") {
        // Use down arrow for next track
        handlers.nextTrack();
        // Then show track info with symbol after a small delay to allow state update
        setTimeout(() => {
          const currentTrackIndex = useIpodStore.getState().currentIndex;
          const currentTrack =
            useIpodStore.getState().tracks[currentTrackIndex];
          if (currentTrack) {
            const artistInfo = currentTrack.artist
              ? ` - ${currentTrack.artist}`
              : "";
            handlers.showStatus(`⏭ ${currentTrack.title}${artistInfo}`);
          }
        }, 800);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying]); // Only isPlaying as dependency

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9999] bg-black select-none"
    >
      <div className="absolute top-6 right-6 z-[10001] pointer-events-auto">
        <button
          onClick={onClose}
          className="rounded-full backdrop-blur-sm bg-neutral-800/20 p-2 transition-all duration-200 text-white/40 hover:text-white hover:bg-neutral-900 focus:outline-none"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      {/* Status Display */}
      <AnimatePresence>
        {statusMessage && (
          <motion.div
            className="absolute inset-0 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="absolute md:top-24 md:left-24 top-8 left-8 pointer-events-none">
              <div className="relative">
                <div className="font-chicago text-white text-[min(5vw,5vh)] relative z-10">
                  {statusMessage}
                </div>
                <div
                  className="font-chicago text-black text-[min(5vw,5vh)] absolute inset-0"
                  style={{
                    WebkitTextStroke: "5px black",
                    textShadow: "none",
                  }}
                >
                  {statusMessage}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {children}
    </div>,
    document.body
  );
}

export function IpodAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  initialData,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps<IpodInitialData>) {
  const { play: playClickSound } = useSound(Sounds.BUTTON_CLICK);
  const { play: playScrollSound } = useSound(Sounds.MENU_OPEN);
  const vibrate = useVibration(100, 50);

  const {
    tracks,
    currentIndex,
    loopCurrent,
    loopAll,
    isShuffled,
    isPlaying,
    showVideo,
    backlightOn,
  } = useIpodStore(
    useShallow((s) => ({
      tracks: s.tracks,
      currentIndex: s.currentIndex,
      loopCurrent: s.loopCurrent,
      loopAll: s.loopAll,
      isShuffled: s.isShuffled,
      isPlaying: s.isPlaying,
      showVideo: s.showVideo,
      backlightOn: s.backlightOn,
    }))
  );
  const {
    theme,
    lcdFilterOn,
    showLyrics,
    lyricsAlignment,
    chineseVariant,
    koreanDisplay,
    lyricsTranslationRequest,
    isFullScreen,
    toggleFullScreen,
    setCurrentIndex,
    toggleLoopAll,
    toggleLoopCurrent,
    toggleShuffle,
    togglePlay,
    setIsPlaying,
    toggleVideo,
    toggleBacklight,
    setTheme,
    clearLibrary,
    resetLibrary,
    nextTrack,
    previousTrack,
  } = useIpodStoreShallow((s) => ({
    theme: s.theme,
    lcdFilterOn: s.lcdFilterOn,
    showLyrics: s.showLyrics,
    lyricsAlignment: s.lyricsAlignment,
    chineseVariant: s.chineseVariant,
    koreanDisplay: s.koreanDisplay,
    lyricsTranslationRequest: s.lyricsTranslationRequest,
    isFullScreen: s.isFullScreen,
    toggleFullScreen: s.toggleFullScreen,
    setCurrentIndex: s.setCurrentIndex,
    toggleLoopAll: s.toggleLoopAll,
    toggleLoopCurrent: s.toggleLoopCurrent,
    toggleShuffle: s.toggleShuffle,
    togglePlay: s.togglePlay,
    setIsPlaying: s.setIsPlaying,
    toggleVideo: s.toggleVideo,
    toggleBacklight: s.toggleBacklight,
    setTheme: s.setTheme,
    clearLibrary: s.clearLibrary,
    resetLibrary: s.resetLibrary,
    nextTrack: s.nextTrack,
    previousTrack: s.previousTrack,
  }));

  const lyricOffset = useIpodStore(
    (s) => s.tracks[s.currentIndex]?.lyricOffset ?? 0
  );

  const prevIsForeground = useRef(isForeground);
  const { bringToForeground, clearIpodInitialData } = useAppStoreShallow(
    (state) => ({
      bringToForeground: state.bringToForeground,
      clearIpodInitialData: state.clearInstanceInitialData,
    })
  );
  // Track the last processed initialData to avoid duplicates
  const lastProcessedInitialDataRef = useRef<unknown>(null);

  const [lastActivityTime, setLastActivityTime] = useState(Date.now());
  const backlightTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [elapsedTime, setElapsedTime] = useState(() =>
    useIpodStore.getState().elapsedTime
  );
  const [totalTime, setTotalTime] = useState(0);
  const [urlInput, setUrlInput] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);
  const [isAddingTrack, setIsAddingTrack] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);

  const initialMenuMode = useMemo(() => {
    const storeState = useIpodStore.getState();
    // Default to Now Playing if there are tracks and a valid index
    return !(
      storeState.tracks.length > 0 &&
      storeState.currentIndex >= 0 &&
      storeState.currentIndex < storeState.tracks.length
    );
  }, []); // Empty dependency array means this runs once on mount

  const [menuMode, setMenuMode] = useState(initialMenuMode);
  const [selectedMenuItem, setSelectedMenuItem] = useState(0);
  const [menuDirection, setMenuDirection] = useState<"forward" | "backward">(
    "forward"
  );
  const [menuHistory, setMenuHistory] = useState<
    {
      title: string;
      items: {
        label: string;
        action: () => void;
        showChevron?: boolean;
        value?: string;
      }[];
      selectedIndex: number;
    }[]
  >([]);
  const [cameFromNowPlayingMenuItem, setCameFromNowPlayingMenuItem] =
    useState(false);
  // Ref for the in-window (small) player inside IpodScreen
  const playerRef = useRef<ReactPlayer>(null);
  // Separate ref for the full-screen player rendered in the portal
  const fullScreenPlayerRef = useRef<ReactPlayer>(null);
  const skipOperationRef = useRef(false);
  const userHasInteractedRef = useRef(false);

  const ua = navigator.userAgent;
  const isIOS = /iP(hone|od|ad)/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua);
  const isIOSSafari = isIOS && isSafari;

  const showStatus = useCallback((message: string) => {
    setStatusMessage(message);
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
    }
    statusTimeoutRef.current = setTimeout(() => {
      setStatusMessage(null);
    }, 2000);
  }, []);

  const registerActivity = useCallback(() => {
    setLastActivityTime(Date.now());
    userHasInteractedRef.current = true;
    if (!useIpodStore.getState().backlightOn) {
      toggleBacklight();
    }
  }, [toggleBacklight]);

  const memoizedToggleShuffle = useCallback(() => {
    toggleShuffle();
    showStatus(
      useIpodStore.getState().isShuffled ? "Shuffle ON" : "Shuffle OFF"
    );
    registerActivity();
  }, [toggleShuffle, showStatus, registerActivity]);

  const memoizedToggleBacklight = useCallback(() => {
    toggleBacklight();
    const isOn = useIpodStore.getState().backlightOn;
    showStatus(isOn ? "Light ON" : "Light OFF");

    // Only call registerActivity when turning the backlight on to avoid
    // immediately re-enabling it after the user turns it off via the menu.
    if (isOn) {
      registerActivity();
    } else {
      // Mimic the parts of registerActivity that update activity tracking
      setLastActivityTime(Date.now());
      userHasInteractedRef.current = true;
    }
  }, [toggleBacklight, showStatus, registerActivity, setLastActivityTime]);

  const memoizedChangeTheme = useCallback(
    (newTheme: "classic" | "black" | "u2") => {
      setTheme(newTheme);
      showStatus(
        newTheme === "classic"
          ? "Theme: Classic"
          : newTheme === "black"
          ? "Theme: Black"
          : "Theme: U2"
      );
      registerActivity();
    },
    [setTheme, showStatus, registerActivity]
  );

  const handleMenuItemAction = useCallback(
    (action: () => void) => {
      if (action === memoizedToggleBacklight) {
        action();
      } else {
        registerActivity();
        action();
      }
    },
    [registerActivity, memoizedToggleBacklight]
  );

  const memoizedToggleRepeat = useCallback(() => {
    registerActivity();
    const currentLoopAll = useIpodStore.getState().loopAll;
    const currentLoopCurrent = useIpodStore.getState().loopCurrent;

    if (currentLoopCurrent) {
      toggleLoopCurrent();
      showStatus("Repeat OFF");
    } else if (currentLoopAll) {
      toggleLoopAll();
      toggleLoopCurrent();
      showStatus("Repeat ONE");
    } else {
      toggleLoopAll();
      showStatus("Repeat ALL");
    }
  }, [registerActivity, toggleLoopAll, toggleLoopCurrent, showStatus]);

  const memoizedHandleThemeChange = useCallback(() => {
    const currentTheme = useIpodStore.getState().theme;
    const nextTheme =
      currentTheme === "classic"
        ? "black"
        : currentTheme === "black"
        ? "u2"
        : "classic";
    memoizedChangeTheme(nextTheme);
  }, [memoizedChangeTheme]);

  useEffect(() => {
    if (backlightTimerRef.current) {
      clearTimeout(backlightTimerRef.current);
    }

    if (backlightOn) {
      backlightTimerRef.current = setTimeout(() => {
        const currentShowVideo = useIpodStore.getState().showVideo;
        const currentIsPlaying = useIpodStore.getState().isPlaying;
        if (
          Date.now() - lastActivityTime >= 5000 &&
          !(currentShowVideo && currentIsPlaying)
        ) {
          toggleBacklight();
        }
      }, 5000);
    }

    return () => {
      if (backlightTimerRef.current) {
        clearTimeout(backlightTimerRef.current);
      }
    };
  }, [backlightOn, lastActivityTime, toggleBacklight]);

  useEffect(() => {
    if (isForeground && !prevIsForeground.current) {
      if (!useIpodStore.getState().backlightOn) {
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

  useEffect(() => {
    setElapsedTime(0);
    useIpodStore.getState().setElapsedTime(0);
    // Clear any previously fetched lyrics immediately when the track changes
    // so the AI chat doesn't use lyrics from the previous song as context
    useIpodStore.setState({ currentLyrics: null });
  }, [currentIndex]);

  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  const [lastPlayedMenuPath, setLastPlayedMenuPath] = useState<string[]>([]);

  const musicMenuItems = useMemo(() => {
    // Group tracks by artist
    const tracksByArtist = tracks.reduce<
      Record<string, { track: (typeof tracks)[0]; index: number }[]>
    >(
      (
        acc: Record<string, { track: (typeof tracks)[0]; index: number }[]>,
        track: (typeof tracks)[0],
        index: number
      ) => {
        const artist = track.artist || "Unknown Artist";
        if (!acc[artist]) {
          acc[artist] = [];
        }
        acc[artist].push({ track, index });
        return acc;
      },
      {}
    );

    // Get sorted list of artists
    const artists = Object.keys(tracksByArtist).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );

    return [
      {
        label: "All Songs",
        action: () => {
          registerActivity();
          setMenuDirection("forward");
          const allTracksMenu = tracks.map(
            (track: (typeof tracks)[0], index: number) => ({
              label: track.title,
              action: () => {
                registerActivity();
                setCurrentIndex(index);
                setIsPlaying(true);
                setMenuDirection("forward");
                setMenuMode(false);
                setCameFromNowPlayingMenuItem(false);
                setLastPlayedMenuPath(["Music", "All Songs"]);
                if (useIpodStore.getState().showVideo) {
                  toggleVideo();
                }
              },
              showChevron: false,
            })
          );
          setMenuHistory((prev) => [
            ...prev,
            {
              title: "All Songs",
              items: allTracksMenu,
              selectedIndex: 0,
            },
          ]);
          setSelectedMenuItem(0);
        },
        showChevron: true,
      },
      ...artists.map((artist) => ({
        label: artist,
        action: () => {
          registerActivity();
          setMenuDirection("forward");
          const artistTracks = tracksByArtist[artist].map(
            ({
              track,
              index,
            }: {
              track: (typeof tracks)[0];
              index: number;
            }) => ({
              label: track.title,
              action: () => {
                registerActivity();
                setCurrentIndex(index);
                setIsPlaying(true);
                setMenuDirection("forward");
                setMenuMode(false);
                setCameFromNowPlayingMenuItem(false);
                setLastPlayedMenuPath(["Music", artist]);
                if (useIpodStore.getState().showVideo) {
                  toggleVideo();
                }
              },
              showChevron: false,
            })
          );
          setMenuHistory((prev) => [
            ...prev,
            {
              title: artist,
              items: artistTracks,
              selectedIndex: 0,
            },
          ]);
          setSelectedMenuItem(0);
        },
        showChevron: true,
      })),
    ];
  }, [
    tracks,
    registerActivity,
    setCurrentIndex,
    setIsPlaying,
    toggleVideo,
    showStatus,
  ]);

  const settingsMenuItems = useMemo(() => {
    const currentLoopCurrent = loopCurrent;
    const currentLoopAll = loopAll;
    const currentIsShuffled = isShuffled;
    const currentBacklightOn = backlightOn;
    const currentTheme = theme;

    return [
      {
        label: "Repeat",
        action: memoizedToggleRepeat,
        showChevron: false,
        value: currentLoopCurrent ? "One" : currentLoopAll ? "All" : "Off",
      },
      {
        label: "Shuffle",
        action: memoizedToggleShuffle,
        showChevron: false,
        value: currentIsShuffled ? "On" : "Off",
      },
      {
        label: "Backlight",
        action: memoizedToggleBacklight,
        showChevron: false,
        value: currentBacklightOn ? "On" : "Off",
      },
      {
        label: "Theme",
        action: memoizedHandleThemeChange,
        showChevron: false,
        value:
          currentTheme === "classic"
            ? "Classic"
            : currentTheme === "black"
            ? "Black"
            : "U2",
      },
    ];
  }, [
    loopCurrent,
    loopAll,
    isShuffled,
    backlightOn,
    theme,
    memoizedToggleRepeat,
    memoizedToggleShuffle,
    memoizedToggleBacklight,
    memoizedHandleThemeChange,
  ]);

  const mainMenuItems = useMemo(() => {
    return [
      {
        label: "Music",
        action: () => {
          registerActivity();
          if (useIpodStore.getState().showVideo) {
            toggleVideo();
          }
          setMenuDirection("forward");
          setMenuHistory((prev) => [
            ...prev,
            {
              title: "Music",
              items: musicMenuItems,
              selectedIndex: 0,
            },
          ]);
          setSelectedMenuItem(0);
        },
        showChevron: true,
      },
      {
        label: "Extras",
        action: () => {
          registerActivity();
          if (useIpodStore.getState().showVideo) {
            toggleVideo();
          }
          setIsAddDialogOpen(true);
        },
        showChevron: true,
      },
      {
        label: "Settings",
        action: () => {
          registerActivity();
          if (useIpodStore.getState().showVideo) {
            toggleVideo();
          }
          setMenuDirection("forward");
          setMenuHistory((prev) => [
            ...prev,
            {
              title: "Settings",
              items: settingsMenuItems,
              selectedIndex: 0,
            },
          ]);
          setSelectedMenuItem(0);
        },
        showChevron: true,
      },
      {
        label: "Shuffle Songs",
        action: () => {
          registerActivity();
          if (useIpodStore.getState().showVideo) {
            toggleVideo();
          }
          memoizedToggleShuffle();
          setMenuMode(false);
        },
        showChevron: false,
      },
      {
        label: "Backlight",
        action: () => {
          memoizedToggleBacklight();
        },
        showChevron: false,
      },
      {
        label: "Now Playing",
        action: () => {
          registerActivity();
          setMenuDirection("forward");
          setMenuMode(false);
          setCameFromNowPlayingMenuItem(true);
        },
        showChevron: true,
      },
    ];
  }, [
    registerActivity,
    toggleVideo,
    musicMenuItems,
    settingsMenuItems,
    memoizedToggleShuffle,
    memoizedToggleBacklight,
    showStatus,
  ]);

  useEffect(() => {
    if (menuHistory.length === 0) {
      setMenuHistory([
        { title: "iPod", items: mainMenuItems, selectedIndex: 0 },
      ]);
    }
  }, []);

  useEffect(() => {
    setMenuHistory((prevHistory) => {
      if (prevHistory.length === 0) return prevHistory;

      const currentMenuIndex = prevHistory.length - 1;
      const currentMenu = prevHistory[currentMenuIndex];
      let latestItems: typeof currentMenu.items | null = null;

      if (currentMenu.title === "iPod") {
        latestItems = mainMenuItems;
      } else if (currentMenu.title === "Music") {
        latestItems = musicMenuItems;
      } else if (currentMenu.title === "Settings") {
        latestItems = settingsMenuItems;
      } else if (currentMenu.title === "All Songs") {
        // Regenerate All Songs menu when tracks change
        latestItems = tracks.map(
          (track: (typeof tracks)[0], index: number) => ({
            label: track.title,
            action: () => {
              registerActivity();
              setCurrentIndex(index);
              setIsPlaying(true);
              setMenuDirection("forward");
              setMenuMode(false);
              setCameFromNowPlayingMenuItem(false);
              setLastPlayedMenuPath(["Music", "All Songs"]);
              if (useIpodStore.getState().showVideo) {
                toggleVideo();
              }
            },
            showChevron: false,
          })
        );
      } else {
        // Check if this is an artist submenu
        const tracksByArtist = tracks.reduce<
          Record<string, { track: (typeof tracks)[0]; index: number }[]>
        >(
          (
            acc: Record<string, { track: (typeof tracks)[0]; index: number }[]>,
            track: (typeof tracks)[0],
            index: number
          ) => {
            const artist = track.artist || "Unknown Artist";
            if (!acc[artist]) {
              acc[artist] = [];
            }
            acc[artist].push({ track, index });
            return acc;
          },
          {}
        );

        if (tracksByArtist[currentMenu.title]) {
          // This is an artist submenu, regenerate it
          const artistTracks = tracksByArtist[currentMenu.title];
          latestItems = artistTracks.map(
            ({
              track,
              index,
            }: {
              track: (typeof tracks)[0];
              index: number;
            }) => ({
              label: track.title,
              action: () => {
                registerActivity();
                setCurrentIndex(index);
                setIsPlaying(true);
                setMenuDirection("forward");
                setMenuMode(false);
                setCameFromNowPlayingMenuItem(false);
                setLastPlayedMenuPath(["Music", currentMenu.title]);
                if (useIpodStore.getState().showVideo) {
                  toggleVideo();
                }
              },
              showChevron: false,
            })
          );
        }
      }

      if (latestItems && currentMenu.items !== latestItems) {
        const updatedHistory = [...prevHistory];
        updatedHistory[currentMenuIndex] = {
          ...currentMenu,
          items: latestItems,
        };
        return updatedHistory;
      }

      return prevHistory;
    });
  }, [
    mainMenuItems,
    musicMenuItems,
    settingsMenuItems,
    menuHistory.length,
    tracks,
    registerActivity,
    setCurrentIndex,
    setIsPlaying,
    toggleVideo,
  ]);

  const handleAddTrack = useCallback(
    async (url: string) => {
      setIsAddingTrack(true);
      try {
        const addedTrack = await useIpodStore
          .getState()
          .addTrackFromVideoId(url);
        if (addedTrack) {
          showStatus("♬ Added");
          setUrlInput("");
          setIsAddDialogOpen(false);
        } else {
          throw new Error("Failed to add track");
        }
      } catch (error) {
        console.error("Failed to add track:", error);
        showStatus(
          `❌ Error adding: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      } finally {
        setIsAddingTrack(false);
      }
    },
    [showStatus]
  );

  const handleAddAndPlayTrackByVideoId = useCallback(
    async (videoId: string) => {
      // Reuse handleAddTrack by constructing the URL
      const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
      try {
        await handleAddTrack(youtubeUrl); // handleAddTrack is already useCallback
        // handleAddTrack internally calls showStatus, sets current index, and plays
      } catch (error) {
        console.error(
          `[iPod] Error adding track for videoId ${videoId}:`,
          error
        );
        // Optionally show an error status to the user
        showStatus(`❌ Error adding ${videoId}`);
      }
    },
    [handleAddTrack, showStatus]
  );

  const processVideoId = useCallback(
    async (videoId: string) => {
      const currentTracks = useIpodStore.getState().tracks;
      const existingTrackIndex = currentTracks.findIndex(
        (track) => track.id === videoId
      );

      const ua = navigator.userAgent;
      const isIOS = /iP(hone|od|ad)/.test(ua);
      const isSafari =
        /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua);
      const shouldAutoplay = !(isIOS || isSafari);

      if (existingTrackIndex !== -1) {
        toast.info("Opening shared track...");
        console.log(`[iPod] Video ID ${videoId} found in tracks. Playing.`);
        setCurrentIndex(existingTrackIndex);
        if (shouldAutoplay) {
          setIsPlaying(true);
        }
        setMenuMode(false);
      } else {
        toast.info("Adding new track from URL...");
        console.log(
          `[iPod] Video ID ${videoId} not found. Adding and playing.`
        );
        await handleAddAndPlayTrackByVideoId(videoId);
        if (shouldAutoplay) {
          const newIndex = useIpodStore.getState().currentIndex;
          const addedTrack = useIpodStore.getState().tracks[newIndex];
          if (addedTrack?.id === videoId) {
            setIsPlaying(true);
          } else {
            console.warn(
              "[iPod] Index mismatch after adding track, autoplay skipped."
            );
          }
        }
      }
    },
    [setCurrentIndex, setIsPlaying, setMenuMode, handleAddAndPlayTrackByVideoId]
  );

  // Effect for initial data on mount
  useEffect(() => {
    if (
      isWindowOpen &&
      initialData?.videoId &&
      typeof initialData.videoId === "string"
    ) {
      // Skip if this initialData has already been processed
      if (lastProcessedInitialDataRef.current === initialData) return;

      const videoIdToProcess = initialData.videoId;
      console.log(
        `[iPod] Processing initialData.videoId on mount: ${videoIdToProcess}`
      );
      setTimeout(() => {
        processVideoId(videoIdToProcess)
          .then(() => {
            // Use instanceId if available (new system), otherwise skip (legacy)
            if (instanceId) {
              clearIpodInitialData(instanceId);
            }
            console.log(
              `[iPod] Cleared initialData after processing ${videoIdToProcess}`
            );
          })
          .catch((error) => {
            console.error(
              `[iPod] Error processing initial videoId ${videoIdToProcess}:`,
              error
            );
          });
      }, 100); // Small delay might help
      // Mark this initialData as processed
      lastProcessedInitialDataRef.current = initialData;
    }
  }, [
    isWindowOpen,
    initialData,
    processVideoId,
    clearIpodInitialData,
    instanceId,
  ]);

  // Effect for updateApp event (when app is already open)
  useEffect(() => {
    const handleUpdateApp = (
      event: CustomEvent<{ appId: string; initialData?: { videoId?: string } }>
    ) => {
      if (event.detail.appId === "ipod" && event.detail.initialData?.videoId) {
        // Skip if this initialData has already been processed
        if (lastProcessedInitialDataRef.current === event.detail.initialData)
          return;

        const videoId = event.detail.initialData.videoId;
        console.log(`[iPod] Received updateApp event with videoId: ${videoId}`);
        bringToForeground("ipod");
        processVideoId(videoId).catch((error) => {
          console.error(
            `[iPod] Error processing videoId ${videoId} from updateApp event:`,
            error
          );
          toast.error("Failed to load shared track", {
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

  const handleTrackEnd = useCallback(() => {
    if (loopCurrent) {
      // Choose the active player based on fullscreen state
      const activePlayer = isFullScreen
        ? fullScreenPlayerRef.current
        : playerRef.current;
      activePlayer?.seekTo(0);
      setElapsedTime(0);
      useIpodStore.getState().setElapsedTime(0);
      setIsPlaying(true);
    } else {
      nextTrack();
    }
  }, [loopCurrent, nextTrack, setIsPlaying, isFullScreen]);

  const handleProgress = useCallback(
    (state: { playedSeconds: number }) => {
      const time = Math.floor(state.playedSeconds);
      setElapsedTime(time);
      useIpodStore.getState().setElapsedTime(time);
    },
    []
  );

  const handleDuration = useCallback((duration: number) => {
    setTotalTime(duration);
  }, []);

  const handlePlay = useCallback(() => {
    // Always sync playing state when ReactPlayer reports a play event.
    setIsPlaying(true);
    if (!skipOperationRef.current) {
      showStatus("▶");
    }
    skipOperationRef.current = false;
  }, [isPlaying, setIsPlaying, showStatus]);

  const handlePause = useCallback(() => {
    // Always sync playing state when ReactPlayer reports a pause.
    // This unconditional update prevents the app state from getting
    // stuck in "play" when Mobile Safari blocks autoplay.
    setIsPlaying(false);
    showStatus("⏸︎");
  }, [setIsPlaying, showStatus]);

  const handleReady = useCallback(() => {
    // Seek to persisted elapsed time when the player becomes ready
    if (elapsedTime > 0) {
      const player = isFullScreen ? fullScreenPlayerRef.current : playerRef.current;
      player?.seekTo(elapsedTime, "seconds");
    }
  }, [elapsedTime, isFullScreen]);

  // Add a watchdog effect to revert play state if playback never starts
  // (e.g., blocked by Mobile Safari's autoplay restrictions).
  useEffect(() => {
    // Only apply this effect on iOS Safari when no user interaction has occurred yet
    if (!isPlaying || !isIOSSafari || userHasInteractedRef.current) return;

    const startElapsed = elapsedTime;
    const timer = setTimeout(() => {
      // If elapsedTime hasn't advanced while we thought we were playing,
      // assume playback was blocked and revert the state.
      if (useIpodStore.getState().isPlaying && elapsedTime === startElapsed) {
        setIsPlaying(false);
        showStatus("⏸");
      }
    }, 1200);

    return () => clearTimeout(timer);
  }, [isPlaying, elapsedTime, setIsPlaying, showStatus, isIOSSafari]);

  const handleMenuButton = useCallback(() => {
    playClickSound();
    vibrate();
    registerActivity();

    if (showVideo) {
      toggleVideo();
    }

    if (menuMode) {
      if (menuHistory.length > 1) {
        setMenuDirection("backward");
        setMenuHistory((prev) => prev.slice(0, -1));
        const previousMenu = menuHistory[menuHistory.length - 2];
        if (previousMenu) {
          setSelectedMenuItem(previousMenu.selectedIndex);
        }
      } else {
        playClickSound();
      }
    } else {
      setMenuDirection("backward");
      const currentTrackIndex = useIpodStore.getState().currentIndex;

      const mainMenu =
        menuHistory.length > 0
          ? menuHistory[0]
          : { title: "iPod", items: mainMenuItems, selectedIndex: 0 };

      const musicSubmenu = musicMenuItems;

      if (cameFromNowPlayingMenuItem) {
        setMenuHistory([mainMenu]);
        setSelectedMenuItem(mainMenu?.selectedIndex || 0);
        setCameFromNowPlayingMenuItem(false);
      } else {
        // Group tracks by artist to find the right artist menu
        const tracksByArtist = tracks.reduce<
          Record<string, { track: (typeof tracks)[0]; index: number }[]>
        >(
          (
            acc: Record<string, { track: (typeof tracks)[0]; index: number }[]>,
            track: (typeof tracks)[0],
            index: number
          ) => {
            const artist = track.artist || "Unknown Artist";
            if (!acc[artist]) {
              acc[artist] = [];
            }
            acc[artist].push({ track, index });
            return acc;
          },
          {}
        );

        // Create track menus
        const allTracksMenu = {
          title: "All Songs",
          items: tracks.map((track: (typeof tracks)[0], index: number) => ({
            label: track.title,
            action: () => {
              registerActivity();
              setCurrentIndex(index);
              setIsPlaying(true);
              setMenuDirection("forward");
              setMenuMode(false);
              setCameFromNowPlayingMenuItem(false);
              setLastPlayedMenuPath(["Music", "All Songs"]);
              if (useIpodStore.getState().showVideo) {
                toggleVideo();
              }
            },
            showChevron: false,
          })),
          selectedIndex: currentTrackIndex,
        };

        // If we have a lastPlayedMenuPath, use it to determine where to go back to
        if (
          lastPlayedMenuPath.length > 0 &&
          lastPlayedMenuPath[1] !== "All Songs"
        ) {
          // We should return to an artist menu
          const artist = lastPlayedMenuPath[1];

          // Check if artist exists in our library
          if (tracksByArtist[artist]) {
            const artistTracks = tracksByArtist[artist];

            // Find the index of the current track in this artist's track list
            const artistTrackIndex = artistTracks.findIndex(
              (item: { track: (typeof tracks)[0]; index: number }) =>
                item.index === currentTrackIndex
            );

            const artistMenu = {
              title: artist,
              items: artistTracks.map(
                ({
                  track,
                  index,
                }: {
                  track: (typeof tracks)[0];
                  index: number;
                }) => ({
                  label: track.title,
                  action: () => {
                    registerActivity();
                    setCurrentIndex(index);
                    setIsPlaying(true);
                    setMenuDirection("forward");
                    setMenuMode(false);
                    setCameFromNowPlayingMenuItem(false);
                    setLastPlayedMenuPath(["Music", artist]);
                    if (useIpodStore.getState().showVideo) {
                      toggleVideo();
                    }
                  },
                  showChevron: false,
                })
              ),
              selectedIndex: artistTrackIndex !== -1 ? artistTrackIndex : 0,
            };

            setMenuHistory([
              mainMenu,
              {
                title: "Music",
                items: musicSubmenu,
                selectedIndex: musicSubmenu.findIndex(
                  (item) => item.label === artist
                ),
              },
              artistMenu,
            ]);

            setSelectedMenuItem(artistTrackIndex !== -1 ? artistTrackIndex : 0);
          } else {
            // If artist no longer exists, fall back to All Songs
            setMenuHistory([
              mainMenu,
              {
                title: "Music",
                items: musicSubmenu,
                selectedIndex: 0,
              },
              allTracksMenu,
            ]);
            setSelectedMenuItem(currentTrackIndex);
          }
        } else {
          // Default behavior: go to All Songs
          setMenuHistory([
            mainMenu,
            {
              title: "Music",
              items: musicSubmenu,
              selectedIndex: 0,
            },
            allTracksMenu,
          ]);
          setSelectedMenuItem(currentTrackIndex);
        }
      }
      setMenuMode(true);
    }
  }, [
    playClickSound,
    vibrate,
    registerActivity,
    showVideo,
    toggleVideo,
    menuMode,
    menuHistory,
    mainMenuItems,
    musicMenuItems,
    tracks,
    cameFromNowPlayingMenuItem,
    lastPlayedMenuPath,
  ]);

  const handleWheelClick = useCallback(
    (area: "top" | "right" | "bottom" | "left" | "center") => {
      playClickSound();
      vibrate();
      registerActivity();
      switch (area) {
        case "top":
          handleMenuButton();
          break;
        case "right":
          skipOperationRef.current = true;
          nextTrack();
          showStatus("⏭");
          break;
        case "bottom":
          togglePlay();
          showStatus(useIpodStore.getState().isPlaying ? "▶" : "⏸");
          break;
        case "left":
          skipOperationRef.current = true;
          previousTrack();
          showStatus("⏮");
          break;
        case "center":
          if (menuMode) {
            const currentMenu = menuHistory[menuHistory.length - 1];
            if (currentMenu && currentMenu.items[selectedMenuItem]) {
              currentMenu.items[selectedMenuItem].action();
            }
          } else {
            if (tracks[currentIndex]) {
              if (!isPlaying) {
                togglePlay();
                showStatus("▶");
                setTimeout(() => {
                  if (!useIpodStore.getState().showVideo) {
                    toggleVideo();
                  }
                }, 200);
              } else {
                toggleVideo();
              }
            }
          }
          break;
      }
    },
    [
      playClickSound,
      vibrate,
      registerActivity,
      nextTrack,
      showStatus,
      togglePlay,
      previousTrack,
      menuMode,
      menuHistory,
      selectedMenuItem,
      tracks,
      currentIndex,
      isPlaying,
      toggleVideo,
      handleMenuButton,
    ]
  );

  const handleWheelRotation = useCallback(
    (direction: "clockwise" | "counterclockwise") => {
      playScrollSound();
      vibrate();
      registerActivity();

      if (menuMode) {
        const currentMenu = menuHistory[menuHistory.length - 1];
        if (!currentMenu) return;
        const menuLength = currentMenu.items.length;
        if (menuLength === 0) return;

        let committedIndex: number | null = null; // track the index we commit to state

        // Update the selected menu item using a functional state update to avoid stale closures
        setSelectedMenuItem((prevIndex) => {
          let newIndex = prevIndex;
          if (direction === "clockwise") {
            newIndex = Math.min(menuLength - 1, prevIndex + 1);
          } else {
            newIndex = Math.max(0, prevIndex - 1);
          }

          // Record the new index so we can update menu history afterwards
          committedIndex = newIndex;
          return newIndex;
        });

        // If the committed index changed, reflect it in the menu history
        if (committedIndex !== null) {
          setMenuHistory((prev) => {
            const lastIndex = prev.length - 1;
            const updatedHistory = [...prev];
            updatedHistory[lastIndex] = {
              ...prev[lastIndex],
              selectedIndex: committedIndex!,
            };
            return updatedHistory;
          });
        }
      } else {
        const activePlayer = isFullScreen
          ? fullScreenPlayerRef.current
          : playerRef.current;
        const currentTime = activePlayer?.getCurrentTime() || 0;
        const seekAmount = 5;
        let newTime = currentTime;
        if (direction === "clockwise") {
          newTime = currentTime + seekAmount;
          activePlayer?.seekTo(newTime);
          showStatus(
            `⏩︎ ${Math.floor(newTime / 60)}:${String(
              Math.floor(newTime % 60)
            ).padStart(2, "0")}`
          );
        } else {
          newTime = Math.max(0, currentTime - seekAmount);
          activePlayer?.seekTo(newTime);
          showStatus(
            `⏪︎ ${Math.floor(newTime / 60)}:${String(
              Math.floor(newTime % 60)
            ).padStart(2, "0")}`
          );
        }
      }
    },
    [
      playScrollSound,
      vibrate,
      registerActivity,
      menuMode,
      menuHistory,
      showStatus,
      isFullScreen,
    ]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current) return;
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      const baseWidth = 250;
      const baseHeight = 400;
      const availableWidth = containerWidth - 50;
      const availableHeight = containerHeight - 50;
      const widthScale = availableWidth / baseWidth;
      const heightScale = availableHeight / baseHeight;
      const newScale = Math.min(widthScale, heightScale, 2);
      setScale(Math.max(1, newScale));
    };

    handleResize();
    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    return () => {
      resizeObserver.disconnect();
    };
  }, [isWindowOpen]);

  const handleShareSong = useCallback(() => {
    if (tracks.length > 0 && currentIndex >= 0) {
      setIsShareDialogOpen(true);
    }
  }, [tracks, currentIndex]);

  const ipodGenerateShareUrl = (videoId: string): string => {
    return `${window.location.origin}/ipod/${videoId}`;
  };

  // Volume control
  const { ipodVolume } = useAppStoreShallow((state) => ({
    ipodVolume: state.ipodVolume,
  }));

  // Derived state for translation
  const currentTrackId = tracks[currentIndex]?.id;
  const translateToForLyricsHook =
    lyricsTranslationRequest &&
    lyricsTranslationRequest.songId === currentTrackId
      ? lyricsTranslationRequest.language
      : null;

  // Always call useLyrics at the top level, outside of any conditional logic
  const fullScreenLyricsControls = useLyrics({
    title: tracks[currentIndex]?.title ?? "",
    artist: tracks[currentIndex]?.artist ?? "",
    album: tracks[currentIndex]?.album ?? "",
    currentTime: elapsedTime + (tracks[currentIndex]?.lyricOffset ?? 0) / 1000,
    translateTo:
      lyricsTranslationRequest?.songId === tracks[currentIndex]?.id
        ? lyricsTranslationRequest?.language
        : null,
  });

  // Add a ref to track the previous fullscreen state
  const prevFullScreenRef = useRef(isFullScreen);

  // Effect to synchronise playback time when entering and exiting fullscreen
  useEffect(() => {
    if (isFullScreen !== prevFullScreenRef.current) {
      if (isFullScreen) {
        // Entering fullscreen - sync from small player to fullscreen player
        const currentTime = playerRef.current?.getCurrentTime() || elapsedTime;
        useIpodStore.getState().setElapsedTime(Math.floor(currentTime));
        // Small delay to ensure the fullscreen player is mounted
        setTimeout(() => {
          fullScreenPlayerRef.current?.seekTo(currentTime);
        }, 100);
      } else {
        // Exiting fullscreen - sync from fullscreen player back to small player
        const currentTime =
          fullScreenPlayerRef.current?.getCurrentTime() || elapsedTime;
        useIpodStore.getState().setElapsedTime(Math.floor(currentTime));
        const wasPlaying = isPlaying;

        // Longer delay to ensure the regular player is properly mounted after fullscreen exit
        setTimeout(() => {
          if (playerRef.current) {
            playerRef.current.seekTo(currentTime);
            // Only update play state if needed, after seeking is complete
            setTimeout(() => {
              if (wasPlaying && !useIpodStore.getState().isPlaying) {
                setIsPlaying(true);
              }
            }, 50);
          }
        }, 200);
      }
      prevFullScreenRef.current = isFullScreen;
    }
  }, [isFullScreen, elapsedTime, isPlaying, setIsPlaying]);

  // Add a seekTime function for fullscreen seeking
  const seekTime = useCallback(
    (delta: number) => {
      if (fullScreenPlayerRef.current) {
        const currentTime = fullScreenPlayerRef.current.getCurrentTime() || 0;
        const newTime = Math.max(0, currentTime + delta);
        fullScreenPlayerRef.current.seekTo(newTime);
        setElapsedTime(Math.floor(newTime));
        useIpodStore.getState().setElapsedTime(Math.floor(newTime));
        showStatus(
          `${delta > 0 ? "⏩︎" : "⏪︎"} ${Math.floor(newTime / 60)}:${String(
            Math.floor(newTime % 60)
          ).padStart(2, "0")}`
        );
      }
    },
    [showStatus]
  );

  // Add fullscreen change event handler
  useEffect(() => {
    const handleFullscreenChange = () => {
      // If browser fullscreen is exited (e.g. by pressing Escape)
      // and our app thinks we're still in fullscreen mode, update the app state
      if (!document.fullscreenElement && isFullScreen) {
        toggleFullScreen();
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [isFullScreen, toggleFullScreen]);

  if (!isWindowOpen) return null;

  return (
    <>
      <IpodMenuBar
        onClose={onClose}
        onShowHelp={() => setIsHelpDialogOpen(true)}
        onShowAbout={() => setIsAboutDialogOpen(true)}
        onClearLibrary={() => {
          setIsConfirmClearOpen(true);
        }}
        onResetLibrary={() => {
          setIsConfirmResetOpen(true);
        }}
        onAddTrack={() => setIsAddDialogOpen(true)}
        onShareSong={handleShareSong}
      />

      <WindowFrame
        title="iPod"
        onClose={onClose}
        isForeground={isForeground}
        appId="ipod"
        transparentBackground
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
      >
        <div
          ref={containerRef}
          className="flex flex-col items-center justify-center w-full h-full bg-gradient-to-b from-gray-100/20 to-gray-300/20 backdrop-blur-lg p-4 select-none"
        >
          <div
            className={cn(
              "w-[250px] h-[400px] rounded-2xl shadow-xl border border-black/40 flex flex-col items-center p-4 pb-8",
              theme === "classic" ? "bg-white/85" : "bg-black/85"
            )}
            style={{
              transform: `scale(${scale})`,
              transformOrigin: "center",
              transition: "transform 0.2s ease",
            }}
          >
            <IpodScreen
              currentTrack={tracks[currentIndex] || null}
              isPlaying={isPlaying && !isFullScreen}
              elapsedTime={elapsedTime}
              totalTime={totalTime}
              menuMode={menuMode}
              menuHistory={menuHistory}
              selectedMenuItem={selectedMenuItem}
              onSelectMenuItem={setSelectedMenuItem}
              currentIndex={currentIndex}
              tracksLength={tracks.length}
              backlightOn={backlightOn}
              menuDirection={menuDirection}
              onMenuItemAction={handleMenuItemAction}
              showVideo={showVideo}
              playerRef={playerRef}
              handleTrackEnd={handleTrackEnd}
              handleProgress={handleProgress}
              handleDuration={handleDuration}
              handlePlay={handlePlay}
              handlePause={handlePause}
              handleReady={handleReady}
              loopCurrent={loopCurrent}
              statusMessage={statusMessage}
              onToggleVideo={toggleVideo}
              lcdFilterOn={lcdFilterOn}
              ipodVolume={ipodVolume}
              showStatusCallback={showStatus}
              showLyrics={showLyrics}
              lyricsAlignment={lyricsAlignment}
              chineseVariant={chineseVariant}
              koreanDisplay={koreanDisplay}
              lyricOffset={lyricOffset ?? 0}
              adjustLyricOffset={(delta) =>
                useIpodStore.getState().adjustLyricOffset(currentIndex, delta)
              }
              translateToForLyrics={translateToForLyricsHook}
              registerActivity={registerActivity}
              isFullScreen={isFullScreen}
              lyricsControls={fullScreenLyricsControls}
            />

            <IpodWheel
              theme={theme}
              onWheelClick={handleWheelClick}
              onWheelRotation={handleWheelRotation}
              onMenuButton={handleMenuButton}
            />
          </div>
        </div>

        {/* Render the full screen portal when isFullScreen is true */}
        {isFullScreen && (
          <FullScreenPortal
            onClose={() => {
              // Just toggle fullscreen state - synchronization is handled in useEffect
              toggleFullScreen();
            }}
            togglePlay={togglePlay}
            nextTrack={() => {
              skipOperationRef.current = true;
              nextTrack();

              // Show track info with symbol after small delay to allow state update
              setTimeout(() => {
                const newTrack = tracks[useIpodStore.getState().currentIndex];
                if (newTrack) {
                  const artistInfo = newTrack.artist
                    ? ` - ${newTrack.artist}`
                    : "";
                  showStatus(`⏭ ${newTrack.title}${artistInfo}`);
                }
              }, 100);
            }}
            previousTrack={() => {
              skipOperationRef.current = true;
              previousTrack();

              // Show track info with symbol after small delay to allow state update
              setTimeout(() => {
                const newTrack = tracks[useIpodStore.getState().currentIndex];
                if (newTrack) {
                  const artistInfo = newTrack.artist
                    ? ` - ${newTrack.artist}`
                    : "";
                  showStatus(`⏮ ${newTrack.title}${artistInfo}`);
                }
              }, 100);
            }}
            seekTime={seekTime}
            showStatus={showStatus}
            registerActivity={registerActivity}
            isPlaying={isPlaying}
            statusMessage={statusMessage}
          >
            <div className="flex flex-col w-full h-full">
              {/* The player and lyrics content */}
              <div className="relative w-full h-full overflow-hidden">
                {/* The player and lyrics content */}
                <div className="w-full h-[calc(100%+230px)] mt-[-120px] relative">
                  {tracks[currentIndex] && (
                    <>
                      <div
                        className={`w-full h-full ${
                          isPlaying && !isIOSSafari
                            ? "pointer-events-none"
                            : "pointer-events-auto"
                        }`}
                      >
                        <ReactPlayer
                          ref={fullScreenPlayerRef}
                          url={tracks[currentIndex].url}
                          playing={isPlaying && isFullScreen} // Only play when in fullscreen mode
                          controls
                          width="100%"
                          height="100%"
                          volume={
                            ipodVolume * useAppStore.getState().masterVolume
                          }
                          loop={loopCurrent}
                          onEnded={handleTrackEnd}
                          onProgress={handleProgress}
                          onDuration={handleDuration}
                          onPlay={handlePlay}
                          onPause={handlePause}
                          onReady={handleReady}
                          config={{
                            youtube: {
                              playerVars: {
                                modestbranding: 1, // Minimal YouTube branding
                                rel: 0, // Do not show related videos at the end
                                showinfo: 0, // Hide video title
                                iv_load_policy: 3, // Hide annotations
                                cc_load_policy: 0, // Disable captions by default
                                fs: 1, // Allow fullscreen toggle inside YouTube player
                                playsinline: 1, // iOS inline playback
                              },
                            },
                          }}
                        />
                      </div>

                      {/* Dark overlay when lyrics are shown */}
                      {showLyrics && tracks[currentIndex] && (
                        <div className="absolute inset-0 bg-black/50 z-10 pointer-events-none" />
                      )}

                      {/* Lyrics Overlay */}
                      {showLyrics && (
                        <div className="absolute bottom-0 inset-0 pointer-events-none z-20">
                          {/* Use the hook result from the top level */}
                          <LyricsDisplay
                            lines={fullScreenLyricsControls.lines}
                            currentLine={fullScreenLyricsControls.currentLine}
                            isLoading={fullScreenLyricsControls.isLoading}
                            error={fullScreenLyricsControls.error}
                            visible={true}
                            videoVisible={true}
                            alignment={lyricsAlignment}
                            chineseVariant={chineseVariant}
                            koreanDisplay={koreanDisplay}
                            onAdjustOffset={(delta) => {
                              // Update store with the adjusted offset
                              useIpodStore
                                .getState()
                                .adjustLyricOffset(currentIndex, delta);

                              // Display status message
                              const newOffset =
                                (tracks[currentIndex]?.lyricOffset ?? 0) +
                                delta;
                              const sign =
                                newOffset > 0 ? "+" : newOffset < 0 ? "" : "";
                              showStatus(
                                `Offset ${sign}${(newOffset / 1000).toFixed(
                                  2
                                )}s`
                              );

                              // Force immediate update of lyrics display with new offset
                              const updatedTime =
                                elapsedTime + newOffset / 1000;
                              fullScreenLyricsControls.updateCurrentTimeManually(
                                updatedTime
                              );
                            }}
                            isTranslating={
                              fullScreenLyricsControls.isTranslating
                            }
                            textSizeClass="text-[min(8vw,8vh)]"
                            interactive={isIOSSafari ? false : isPlaying}
                            bottomPaddingClass="pb-42"
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </FullScreenPortal>
        )}

        <HelpDialog
          isOpen={isHelpDialogOpen}
          onOpenChange={setIsHelpDialogOpen}
          helpItems={helpItems}
          appName="iPod"
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
            clearLibrary();
            setIsConfirmClearOpen(false);
            showStatus("Library Cleared");
          }}
          title="Clear Library"
          description="Are you sure you want to clear your entire music library? This action cannot be undone."
        />
        <ConfirmDialog
          isOpen={isConfirmResetOpen}
          onOpenChange={setIsConfirmResetOpen}
          onConfirm={() => {
            void resetLibrary();
            setIsConfirmResetOpen(false);
            showStatus("Library Reset");
          }}
          title="Reset Library"
          description="Are you sure you want to reset your music library to the default tracks? This will replace your current library."
        />
        <InputDialog
          isOpen={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
          onSubmit={handleAddTrack}
          title="Add Song"
          description="Paste a YouTube link to add to your iPod"
          value={urlInput}
          onChange={setUrlInput}
          isLoading={isAddingTrack}
        />
        <ShareItemDialog
          isOpen={isShareDialogOpen}
          onClose={() => setIsShareDialogOpen(false)}
          itemType="Song"
          itemIdentifier={tracks[currentIndex]?.id || ""}
          title={tracks[currentIndex]?.title}
          details={tracks[currentIndex]?.artist}
          generateShareUrl={ipodGenerateShareUrl}
        />
      </WindowFrame>
    </>
  );
}
