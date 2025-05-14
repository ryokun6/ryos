import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import ReactPlayer from "react-player";
import { cn } from "@/lib/utils";
import { AppProps } from "../../base/types";
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
import { useIpodStore, Track } from "@/stores/useIpodStore";
import { useAppStore } from "@/stores/useAppStore";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { toast } from "sonner";

export function IpodAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  initialData,
}: AppProps) {
  const { play: playClickSound } = useSound(Sounds.BUTTON_CLICK);
  const { play: playScrollSound } = useSound(Sounds.MENU_OPEN);
  const vibrate = useVibration(100, 50);

  const tracks = useIpodStore((s) => s.tracks);
  const currentIndex = useIpodStore((s) => s.currentIndex);
  const loopCurrent = useIpodStore((s) => s.loopCurrent);
  const loopAll = useIpodStore((s) => s.loopAll);
  const isShuffled = useIpodStore((s) => s.isShuffled);
  const isPlaying = useIpodStore((s) => s.isPlaying);
  const showVideo = useIpodStore((s) => s.showVideo);
  const backlightOn = useIpodStore((s) => s.backlightOn);
  const theme = useIpodStore((s) => s.theme);
  const lcdFilterOn = useIpodStore((s) => s.lcdFilterOn);

  const setCurrentIndex = useIpodStore((s) => s.setCurrentIndex);
  const toggleLoopAll = useIpodStore((s) => s.toggleLoopAll);
  const toggleLoopCurrent = useIpodStore((s) => s.toggleLoopCurrent);
  const toggleShuffle = useIpodStore((s) => s.toggleShuffle);
  const togglePlay = useIpodStore((s) => s.togglePlay);
  const setIsPlaying = useIpodStore((s) => s.setIsPlaying);
  const toggleVideo = useIpodStore((s) => s.toggleVideo);
  const toggleBacklight = useIpodStore((s) => s.toggleBacklight);
  const setTheme = useIpodStore((s) => s.setTheme);
  const addTrackStore = useIpodStore((s) => s.addTrack);
  const clearLibrary = useIpodStore((s) => s.clearLibrary);
  const resetLibrary = useIpodStore((s) => s.resetLibrary);
  const nextTrack = useIpodStore((s) => s.nextTrack);
  const previousTrack = useIpodStore((s) => s.previousTrack);

  const [lastActivityTime, setLastActivityTime] = useState(Date.now());
  const backlightTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [urlInput, setUrlInput] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);
  const [isConfirmResetOpen, setIsConfirmResetOpen] = useState(false);
  const [isAddingTrack, setIsAddingTrack] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [menuMode, setMenuMode] = useState(false);
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
  const playerRef = useRef<ReactPlayer>(null);
  const skipOperationRef = useRef(false);

  const prevIsForeground = useRef(isForeground);
  const bringToForeground = useAppStore((state) => state.bringToForeground);
  const clearIpodInitialData = useAppStore((state) => state.clearInitialData);

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
    if (!useIpodStore.getState().backlightOn) {
      toggleBacklight();
    }
  }, [toggleBacklight]);

  const memoizedToggleShuffle = useCallback(() => {
    toggleShuffle();
    showStatus(useIpodStore.getState().isShuffled ? "Shuffle ON" : "Shuffle OFF");
    registerActivity();
  }, [toggleShuffle, showStatus, registerActivity]);

  const memoizedToggleBacklight = useCallback(() => {
    toggleBacklight();
    showStatus(useIpodStore.getState().backlightOn ? "Light ON" : "Light OFF");
    registerActivity();
  }, [toggleBacklight, showStatus, registerActivity]);

  const memoizedChangeTheme = useCallback((newTheme: string) => {
    setTheme(newTheme);
    showStatus(newTheme === "classic" ? "Theme: Classic" : "Theme: Black");
    registerActivity();
  }, [setTheme, showStatus, registerActivity]);

  const handleMenuItemAction = useCallback((action: () => void) => {
    registerActivity();
    action();
  }, [registerActivity]);

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
    const nextTheme = currentTheme === "classic" ? "black" : "classic";
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
    const tracksByArtist = tracks.reduce<Record<string, { track: typeof tracks[0]; index: number }[]>>(
      (acc, track, index) => {
        const artist = track.artist || 'Unknown Artist';
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
      a.localeCompare(b, undefined, { sensitivity: 'base' })
    );

    return [
      {
        label: "All Songs",
        action: () => {
          registerActivity();
          setMenuDirection("forward");
          const allTracksMenu = tracks.map((track, index) => ({
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
          }));
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
      ...artists.map(artist => ({
        label: artist,
        action: () => {
          registerActivity();
          setMenuDirection("forward");
          const artistTracks = tracksByArtist[artist].map(({ track, index }) => ({
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
          }));
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
      }))
    ];
  }, [tracks, registerActivity, setCurrentIndex, setIsPlaying, toggleVideo, showStatus]);

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
        value: currentTheme === "classic" ? "Classic" : "Black",
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
  }, [mainMenuItems, musicMenuItems, settingsMenuItems, menuHistory.length]);

  const extractVideoId = (url: string): string | null => {
    const regExp =
      /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[7].length === 11 ? match[7] : null;
  };

  const handleAddTrack = useCallback(async (url: string) => {
    setIsAddingTrack(true);
    try {
      const videoId = extractVideoId(url);
      if (!videoId) {
        throw new Error("Invalid YouTube URL");
      }

      const oembedResponse = await fetch(
        `https://www.youtube.com/oembed?url=http://www.youtube.com/watch?v=${videoId}&format=json`
      );
      if (!oembedResponse.ok) {
        console.warn("Failed to fetch oEmbed info, using default title");
      }
      const oembedData = oembedResponse.ok ? await oembedResponse.json() : {};
      const rawTitle = oembedData.title || `Video ID: ${videoId}`;

      let trackInfo: Partial<Track> = {
        title: rawTitle,
        artist: undefined,
        album: undefined,
      };

      try {
        const parseResponse = await fetch("/api/parse-title", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title: rawTitle }),
        });

        if (parseResponse.ok) {
          const parsedData = await parseResponse.json();
          trackInfo.title = parsedData.title || rawTitle;
          trackInfo.artist = parsedData.artist;
          trackInfo.album = parsedData.album;
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

      const newTrack: Track = {
        id: videoId,
        url,
        title: trackInfo.title!,
        artist: trackInfo.artist,
        album: trackInfo.album,
      };

      addTrackStore(newTrack);
      showStatus("♬ Added");
      setUrlInput("");
      setIsAddDialogOpen(false);
    } catch (error) {
      console.error("Failed to add track:", error);
      showStatus(`❌ Error adding: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsAddingTrack(false);
    }
  }, [addTrackStore, showStatus]);

  const handleAddAndPlayTrackByVideoId = useCallback(async (videoId: string) => {
    // Reuse handleAddTrack by constructing the URL
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    try {
      await handleAddTrack(youtubeUrl); // handleAddTrack is already useCallback
      // handleAddTrack internally calls showStatus, sets current index, and plays
    } catch (error) {
      console.error(`[iPod] Error adding track for videoId ${videoId}:`, error);
      // Optionally show an error status to the user
      showStatus(`❌ Error adding ${videoId}`);
    }
  }, [handleAddTrack, showStatus]);

  const processVideoId = useCallback(async (videoId: string) => {
    const currentTracks = useIpodStore.getState().tracks;
    const existingTrackIndex = currentTracks.findIndex(track => track.id === videoId);

    const ua = navigator.userAgent;
    const isIOS = /iP(hone|od|ad)/.test(ua);
    const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua);
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
      console.log(`[iPod] Video ID ${videoId} not found. Adding and playing.`);
      await handleAddAndPlayTrackByVideoId(videoId);
      if (shouldAutoplay) {
        const newIndex = useIpodStore.getState().currentIndex;
        const addedTrack = useIpodStore.getState().tracks[newIndex];
        if (addedTrack?.id === videoId) {
          setIsPlaying(true);
        } else {
          console.warn("[iPod] Index mismatch after adding track, autoplay skipped.");
        }
      }
    }
  }, [setCurrentIndex, setIsPlaying, setMenuMode, handleAddAndPlayTrackByVideoId]);

  // Effect for initial data on mount
  useEffect(() => {
    if (isWindowOpen && initialData?.videoId && typeof initialData.videoId === 'string') {
      const videoIdToProcess = initialData.videoId;
      console.log(`[iPod] Processing initialData.videoId on mount: ${videoIdToProcess}`);
      setTimeout(() => {
        processVideoId(videoIdToProcess).then(() => {
          clearIpodInitialData('ipod');
          console.log(`[iPod] Cleared initialData after processing ${videoIdToProcess}`);
        }).catch(error => {
          console.error(`[iPod] Error processing initial videoId ${videoIdToProcess}:`, error);
        });
      }, 100); // Small delay might help
    }
  }, [isWindowOpen, initialData, processVideoId, clearIpodInitialData]);


  // Effect for updateApp event (when app is already open)
  useEffect(() => {
    const handleUpdateApp = (event: CustomEvent<{ appId: string; initialData?: { videoId?: string } }>) => {
      if (event.detail.appId === 'ipod' && event.detail.initialData?.videoId) {
        const videoId = event.detail.initialData.videoId;
        console.log(`[iPod] Received updateApp event with videoId: ${videoId}`);
        bringToForeground('ipod');
        processVideoId(videoId).catch(error => {
           console.error(`[iPod] Error processing videoId ${videoId} from updateApp event:`, error);
           toast.error("Failed to load shared track", { description: `Video ID: ${videoId}` });
        });
      }
    };

    window.addEventListener('updateApp', handleUpdateApp as EventListener);
    return () => {
      window.removeEventListener('updateApp', handleUpdateApp as EventListener);
    };
  }, [processVideoId, bringToForeground]);

  const handleTrackEnd = useCallback(() => {
    if (loopCurrent) {
      playerRef.current?.seekTo(0);
      setIsPlaying(true);
    } else {
      nextTrack();
    }
  }, [loopCurrent, nextTrack, setIsPlaying]);

  const handleProgress = useCallback((state: { playedSeconds: number }) => {
    setElapsedTime(Math.floor(state.playedSeconds));
  }, []);

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
    showStatus("❙ ❙");
  }, [setIsPlaying, showStatus]);

  const handleReady = useCallback(() => {
    // Optional: Can perform actions when player is ready
    // if (isPlaying) {
    // }
  }, []);

  // Add a watchdog effect to revert play state if playback never starts
  // (e.g., blocked by Mobile Safari's autoplay restrictions).
  useEffect(() => {
    if (!isPlaying) return;

    const startElapsed = elapsedTime;
    const timer = setTimeout(() => {
      // If elapsedTime hasn't advanced while we thought we were playing,
      // assume playback was blocked and revert the state.
      if (useIpodStore.getState().isPlaying && elapsedTime === startElapsed) {
        setIsPlaying(false);
        showStatus("❙ ❙");
      }
    }, 3000); // 1-second grace period

    return () => clearTimeout(timer);
  }, [isPlaying, elapsedTime, setIsPlaying, showStatus]);

  // NEW: Ensure we exit video view whenever playback is paused.
  useEffect(() => {
    if (!isPlaying && showVideo) {
      toggleVideo();
    }
  }, [isPlaying, showVideo, toggleVideo]);

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

      const mainMenu = menuHistory.length > 0
        ? menuHistory[0]
        : { title: "iPod", items: mainMenuItems, selectedIndex: 0 };

      const musicSubmenu = musicMenuItems;
      
      if (cameFromNowPlayingMenuItem) {
        setMenuHistory([mainMenu]);
        setSelectedMenuItem(mainMenu?.selectedIndex || 0);
        setCameFromNowPlayingMenuItem(false);
      } else {
        
        // Group tracks by artist to find the right artist menu
        const tracksByArtist = tracks.reduce<Record<string, { track: typeof tracks[0]; index: number }[]>>(
          (acc, track, index) => {
            const artist = track.artist || 'Unknown Artist';
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
          items: tracks.map((track, index) => ({
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
          selectedIndex: currentTrackIndex
        };
        
        // If we have a lastPlayedMenuPath, use it to determine where to go back to
        if (lastPlayedMenuPath.length > 0 && lastPlayedMenuPath[1] !== "All Songs") {
          // We should return to an artist menu
          const artist = lastPlayedMenuPath[1];
          
          // Check if artist exists in our library
          if (tracksByArtist[artist]) {
            const artistTracks = tracksByArtist[artist];
            
            // Find the index of the current track in this artist's track list
            const artistTrackIndex = artistTracks.findIndex(item => item.index === currentTrackIndex);
            
            const artistMenu = {
              title: artist,
              items: artistTracks.map(({ track, index }) => ({
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
              })),
              selectedIndex: artistTrackIndex !== -1 ? artistTrackIndex : 0
            };
            
            setMenuHistory([
              mainMenu,
              {
                title: "Music",
                items: musicSubmenu,
                selectedIndex: musicSubmenu.findIndex(item => item.label === artist)
              },
              artistMenu
            ]);
            
            setSelectedMenuItem(artistTrackIndex !== -1 ? artistTrackIndex : 0);
          } else {
            // If artist no longer exists, fall back to All Songs
            setMenuHistory([
              mainMenu,
              {
                title: "Music",
                items: musicSubmenu,
                selectedIndex: 0
              },
              allTracksMenu
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
              selectedIndex: 0
            },
            allTracksMenu
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

  const handleWheelClick = useCallback((area: "top" | "right" | "bottom" | "left" | "center") => {
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
            } else {
              toggleVideo();
            }
          }
        }
        break;
    }
  }, [
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
  ]);

  const handleWheelRotation = useCallback((direction: "clockwise" | "counterclockwise") => {
    playScrollSound();
    vibrate();
    registerActivity();
    if (menuMode) {
      const currentMenu = menuHistory[menuHistory.length - 1];
      if (!currentMenu) return;
      const menuLength = currentMenu.items.length;
      if (menuLength === 0) return;

      let newIndex = selectedMenuItem;
      if (direction === "clockwise") {
        newIndex = Math.min(menuLength - 1, selectedMenuItem + 1);
      } else {
        newIndex = Math.max(0, selectedMenuItem - 1);
      }

      if (newIndex !== selectedMenuItem) {
        setSelectedMenuItem(newIndex);
        setMenuHistory((prev) => {
          const lastIndex = prev.length - 1;
          const updatedHistory = [...prev];
          updatedHistory[lastIndex] = {
            ...prev[lastIndex],
            selectedIndex: newIndex,
          };
          return updatedHistory;
        });
      }
    } else {
      const currentTime = playerRef.current?.getCurrentTime() || 0;
      const seekAmount = 5;
      if (direction === "clockwise") {
        playerRef.current?.seekTo(currentTime + seekAmount);
        showStatus(`⏩︎`);
      } else {
        playerRef.current?.seekTo(Math.max(0, currentTime - seekAmount));
        showStatus(`⏪︎`);
      }
    }
  }, [
    playScrollSound,
    vibrate,
    registerActivity,
    menuMode,
    menuHistory,
    selectedMenuItem,
    showStatus,
  ]);

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
      const newScale = Math.min(widthScale, heightScale, 1.5);
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
  const { ipodVolume } = useAppStore();

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
              isPlaying={isPlaying}
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
            />

            <IpodWheel
              theme={theme}
              onWheelClick={handleWheelClick}
              onWheelRotation={handleWheelRotation}
              onMenuButton={handleMenuButton}
            />
          </div>
        </div>

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
            resetLibrary();
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
