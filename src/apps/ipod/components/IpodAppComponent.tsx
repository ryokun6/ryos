import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import ReactPlayer from "react-player";
import { cn } from "@/lib/utils";
import { AppProps, IpodInitialData } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { IpodMenuBar } from "./IpodMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { helpItems, appMetadata } from "..";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useSound, Sounds } from "@/hooks/useSound";
import { useVibration } from "@/hooks/useVibration";
import { IpodScreen } from "./IpodScreen";
import { IpodWheel } from "./IpodWheel";
import { PipPlayer } from "./PipPlayer";
import { FullScreenPortal } from "./FullScreenPortal";
import { LyricsDisplay } from "./LyricsDisplay";
import { CoverFlow, CoverFlowRef } from "./CoverFlow";
import { LyricsSyncMode } from "@/components/shared/LyricsSyncMode";
import { useIpodStore, Track, getEffectiveTranslationLanguage, flushPendingLyricOffsetSave } from "@/stores/useIpodStore";
import { useShallow } from "zustand/react/shallow";
import { useIpodStoreShallow, useAppStoreShallow, useAudioSettingsStoreShallow } from "@/stores/helpers";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { LyricsSearchDialog } from "@/components/dialogs/LyricsSearchDialog";
import { SongSearchDialog, SongSearchResult } from "@/components/dialogs/SongSearchDialog";
import { toast } from "sonner";
import { useLyrics } from "@/hooks/useLyrics";
import { useFurigana } from "@/hooks/useFurigana";
import { useLibraryUpdateChecker } from "../hooks/useLibraryUpdateChecker";
import { useThemeStore } from "@/stores/useThemeStore";
import { LyricsAlignment, LyricsFont, getLyricsFontClassName } from "@/types/lyrics";
import { track } from "@vercel/analytics";
import { getTranslatedAppName } from "@/utils/i18n";
import { IPOD_ANALYTICS } from "@/utils/analytics";
import { useOffline } from "@/hooks/useOffline";
import { useTranslation } from "react-i18next";
import { saveSongMetadataFromTrack } from "@/utils/songMetadataCache";
import { useChatsStore } from "@/stores/useChatsStore";
import { BACKLIGHT_TIMEOUT_MS, SEEK_AMOUNT_SECONDS, getYouTubeVideoId, formatKugouImageUrl } from "../constants";
import type { WheelArea, RotationDirection } from "../types";
import { useActivityState } from "@/hooks/useActivityState";
import { useLyricsErrorToast } from "@/hooks/useLyricsErrorToast";

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
  const { t, i18n } = useTranslation();
  const { play: playClickSound } = useSound(Sounds.BUTTON_CLICK);
  const { play: playScrollSound } = useSound(Sounds.IPOD_CLICK_WHEEL);
  const vibrate = useVibration(100, 50);
  const isOffline = useOffline();
  const translatedHelpItems = useTranslatedHelpItems("ipod", helpItems);

  // Store state
  const {
    tracks,
    currentSongId,
    loopCurrent,
    loopAll,
    isShuffled,
    isPlaying,
    showVideo,
    backlightOn,
  } = useIpodStore(
    useShallow((s) => ({
      tracks: s.tracks,
      currentSongId: s.currentSongId,
      loopCurrent: s.loopCurrent,
      loopAll: s.loopAll,
      isShuffled: s.isShuffled,
      isPlaying: s.isPlaying,
      showVideo: s.showVideo,
      backlightOn: s.backlightOn,
    }))
  );

  // Compute currentIndex from currentSongId
  const currentIndex = useMemo(() => {
    if (!currentSongId) return tracks.length > 0 ? 0 : -1;
    const index = tracks.findIndex((t) => t.id === currentSongId);
    return index >= 0 ? index : (tracks.length > 0 ? 0 : -1);
  }, [tracks, currentSongId]);

  const {
    theme,
    lcdFilterOn,
    showLyrics,
    lyricsAlignment,
    lyricsFont,
    koreanDisplay,
    japaneseFurigana,
    romanization,
    setRomanization,
    lyricsTranslationLanguage,
    isFullScreen,
    toggleFullScreen,
    setCurrentSongId,
    toggleLoopAll,
    toggleLoopCurrent,
    toggleShuffle,
    togglePlay,
    setIsPlaying,
    toggleVideo,
    toggleBacklight,
    setTheme,
    clearLibrary,
    nextTrack,
    previousTrack,
    refreshLyrics,
    setTrackLyricsSource,
    clearTrackLyricsSource,
    setLyricOffset,
    setCurrentFuriganaMap,
  } = useIpodStoreShallow((s) => ({
    theme: s.theme,
    lcdFilterOn: s.lcdFilterOn,
    showLyrics: s.showLyrics,
    lyricsAlignment: s.lyricsAlignment,
    lyricsFont: s.lyricsFont,
    koreanDisplay: s.koreanDisplay,
    japaneseFurigana: s.japaneseFurigana,
    romanization: s.romanization,
    setRomanization: s.setRomanization,
    lyricsTranslationLanguage: s.lyricsTranslationLanguage,
    isFullScreen: s.isFullScreen,
    toggleFullScreen: s.toggleFullScreen,
    setCurrentSongId: s.setCurrentSongId,
    toggleLoopAll: s.toggleLoopAll,
    toggleLoopCurrent: s.toggleLoopCurrent,
    toggleShuffle: s.toggleShuffle,
    togglePlay: s.togglePlay,
    setIsPlaying: s.setIsPlaying,
    toggleVideo: s.toggleVideo,
    toggleBacklight: s.toggleBacklight,
    setTheme: s.setTheme,
    clearLibrary: s.clearLibrary,
    nextTrack: s.nextTrack,
    previousTrack: s.previousTrack,
    refreshLyrics: s.refreshLyrics,
    setTrackLyricsSource: s.setTrackLyricsSource,
    clearTrackLyricsSource: s.clearTrackLyricsSource,
    setLyricOffset: s.setLyricOffset,
    setCurrentFuriganaMap: s.setCurrentFuriganaMap,
  }));

  // Auth for protected operations (force refresh, change lyrics source)
  const { username, authToken } = useChatsStore(
    useShallow((s) => ({ username: s.username, authToken: s.authToken }))
  );
  const auth = useMemo(
    () => (username && authToken ? { username, authToken } : undefined),
    [username, authToken]
  );

  const lyricOffset = useIpodStore(
    (s) => {
      const track = s.currentSongId 
        ? s.tracks.find((t) => t.id === s.currentSongId) 
        : s.tracks[0];
      return track?.lyricOffset ?? 0;
    }
  );

  const prevIsForeground = useRef(isForeground);
  const { bringToForeground, clearIpodInitialData, instances, restoreInstance } =
    useAppStoreShallow((state) => ({
      bringToForeground: state.bringToForeground,
      clearIpodInitialData: state.clearInstanceInitialData,
      instances: state.instances,
      restoreInstance: state.restoreInstance,
    }));

  const isMinimized = instanceId
    ? instances[instanceId]?.isMinimized ?? false
    : false;
  const lastProcessedInitialDataRef = useRef<unknown>(null);

  // Status management
  const [lastActivityTime, setLastActivityTime] = useState(Date.now());
  const backlightTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const userHasInteractedRef = useRef(false);

  // Dialog state
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isLyricsSearchDialogOpen, setIsLyricsSearchDialogOpen] = useState(false);
  const [isSongSearchDialogOpen, setIsSongSearchDialogOpen] = useState(false);
  const [isSyncModeOpen, setIsSyncModeOpen] = useState(false);
  const [isAddingSong, setIsAddingSong] = useState(false);
  
  // Cover Flow state
  const [isCoverFlowOpen, setIsCoverFlowOpen] = useState(false);

  // Playback state
  const [elapsedTime, setElapsedTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const playerRef = useRef<ReactPlayer | null>(null);
  const fullScreenPlayerRef = useRef<ReactPlayer | null>(null);
  const lastTrackedSongRef = useRef<{ trackId: string; elapsedTime: number } | null>(null);
  const skipOperationRef = useRef(false);
  const coverFlowRef = useRef<CoverFlowRef | null>(null);
  
  // Screen long press for CoverFlow toggle
  const screenLongPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const screenLongPressFiredRef = useRef(false);
  const screenLongPressStartPos = useRef<{ x: number; y: number } | null>(null);
  const SCREEN_LONG_PRESS_MOVE_THRESHOLD = 10; // pixels - cancel if moved more than this
  
  // Track switching state to prevent race conditions
  const isTrackSwitchingRef = useRef(false);
  const trackSwitchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Menu state
  const initialMenuMode = useMemo(() => {
    const storeState = useIpodStore.getState();
    const hasValidTrack = storeState.tracks.length > 0 && (
      !storeState.currentSongId || 
      storeState.tracks.some((t) => t.id === storeState.currentSongId)
    );
    return !hasValidTrack;
  }, []);

  const [menuMode, setMenuMode] = useState(initialMenuMode);
  const [selectedMenuItem, setSelectedMenuItem] = useState(0);
  const [menuDirection, setMenuDirection] = useState<"forward" | "backward">("forward");
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
  const [cameFromNowPlayingMenuItem, setCameFromNowPlayingMenuItem] = useState(false);
  // Save menu history before entering Now Playing from a song selection
  const menuHistoryBeforeNowPlayingRef = useRef<typeof menuHistory | null>(null);

  // Library update checker
  const { manualSync } = useLibraryUpdateChecker(
    isWindowOpen && (isForeground ?? false)
  );

  // iOS Safari detection
  const ua = navigator.userAgent;
  const isIOS = /iP(hone|od|ad)/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua) && !/CriOS/.test(ua);
  const isIOSSafari = isIOS && isSafari;

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
  }, [showStatus, t]);

  const registerActivity = useCallback(() => {
    setLastActivityTime(Date.now());
    userHasInteractedRef.current = true;
    if (!useIpodStore.getState().backlightOn) {
      toggleBacklight();
    }
  }, [toggleBacklight]);

  // Memoized toggle functions
  const memoizedToggleShuffle = useCallback(() => {
    toggleShuffle();
    showStatus(
      useIpodStore.getState().isShuffled
        ? t("apps.ipod.status.shuffleOn")
        : t("apps.ipod.status.shuffleOff")
    );
    registerActivity();
  }, [toggleShuffle, showStatus, registerActivity, t]);

  const memoizedToggleBacklight = useCallback(() => {
    toggleBacklight();
    const isOn = useIpodStore.getState().backlightOn;
    showStatus(isOn ? t("apps.ipod.status.lightOn") : t("apps.ipod.status.lightOff"));
    if (isOn) {
      registerActivity();
    } else {
      setLastActivityTime(Date.now());
      userHasInteractedRef.current = true;
    }
  }, [toggleBacklight, showStatus, registerActivity, t]);

  const memoizedChangeTheme = useCallback(
    (newTheme: "classic" | "black" | "u2") => {
      setTheme(newTheme);
      showStatus(
        newTheme === "classic"
          ? t("apps.ipod.status.themeClassic")
          : newTheme === "black"
          ? t("apps.ipod.status.themeBlack")
          : t("apps.ipod.status.themeU2")
      );
      registerActivity();
    },
    [setTheme, showStatus, registerActivity, t]
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
      showStatus(t("apps.ipod.status.repeatOff"));
    } else if (currentLoopAll) {
      toggleLoopAll();
      toggleLoopCurrent();
      showStatus(t("apps.ipod.status.repeatOne"));
    } else {
      toggleLoopAll();
      showStatus(t("apps.ipod.status.repeatAll"));
    }
  }, [registerActivity, toggleLoopAll, toggleLoopCurrent, showStatus, t]);

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

  // Backlight timer
  useEffect(() => {
    if (backlightTimerRef.current) {
      clearTimeout(backlightTimerRef.current);
    }

    if (backlightOn) {
      backlightTimerRef.current = setTimeout(() => {
        const currentShowVideo = useIpodStore.getState().showVideo;
        const currentIsPlaying = useIpodStore.getState().isPlaying;
        if (
          Date.now() - lastActivityTime >= BACKLIGHT_TIMEOUT_MS &&
          !(currentShowVideo && currentIsPlaying)
        ) {
          toggleBacklight();
        }
      }, BACKLIGHT_TIMEOUT_MS);
    }

    return () => {
      if (backlightTimerRef.current) {
        clearTimeout(backlightTimerRef.current);
      }
    };
  }, [backlightOn, lastActivityTime, toggleBacklight]);

  // Foreground handling
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

  // Reset elapsed time on track change and set track switching guard
  // This catches track changes from any source (AI tools, shared URLs, menu selections, etc.)
  const prevCurrentIndexRef = useRef(currentIndex);
  useEffect(() => {
    setElapsedTime(0);
    useIpodStore.setState({ currentLyrics: null });
    // Only trigger track switch guard if index actually changed (not on initial render)
    if (prevCurrentIndexRef.current !== currentIndex) {
      isTrackSwitchingRef.current = true;
      if (trackSwitchTimeoutRef.current) {
        clearTimeout(trackSwitchTimeoutRef.current);
      }
      trackSwitchTimeoutRef.current = setTimeout(() => {
        isTrackSwitchingRef.current = false;
      }, 2000);
    }
    prevCurrentIndexRef.current = currentIndex;
  }, [currentIndex]);

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

  // Menu items
  const musicMenuItems = useMemo(() => {
    const tracksByArtist = tracks.reduce<
      Record<string, { track: Track; index: number }[]>
    >((acc, track, index) => {
      const artist = track.artist || t("apps.ipod.menu.unknownArtist");
      if (!acc[artist]) {
        acc[artist] = [];
      }
      acc[artist].push({ track, index });
      return acc;
    }, {});

    const artists = Object.keys(tracksByArtist).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );

    return [
      {
        label: t("apps.ipod.menuItems.allSongs"),
        action: () => {
          registerActivity();
          setMenuDirection("forward");
          const allSongsLabel = t("apps.ipod.menuItems.allSongs");
          const allTracksMenu = tracks.map((track, index) => ({
            label: track.title,
            action: () => {
              registerActivity();
              if (isOffline) {
                showOfflineStatus();
                return;
              }
              // Save current menu history with the selected index before entering Now Playing
              setMenuHistory((prev) => {
                const updatedHistory = [...prev];
                if (updatedHistory.length > 0) {
                  updatedHistory[updatedHistory.length - 1] = {
                    ...updatedHistory[updatedHistory.length - 1],
                    selectedIndex: index,
                  };
                }
                menuHistoryBeforeNowPlayingRef.current = updatedHistory;
                return updatedHistory;
              });
              setCurrentSongId(track.id);
              setIsPlaying(true);
              setMenuDirection("forward");
              setMenuMode(false);
              setCameFromNowPlayingMenuItem(false);
              if (useIpodStore.getState().showVideo) {
                toggleVideo();
              }
            },
            showChevron: false,
          }));
          setMenuHistory((prev) => [
            ...prev,
            { title: allSongsLabel, items: allTracksMenu, selectedIndex: 0 },
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
          const artistTracks = tracksByArtist[artist].map(({ track }, trackListIndex) => ({
            label: track.title,
            action: () => {
              registerActivity();
              // Save current menu history with the selected index before entering Now Playing
              setMenuHistory((prev) => {
                const updatedHistory = [...prev];
                if (updatedHistory.length > 0) {
                  updatedHistory[updatedHistory.length - 1] = {
                    ...updatedHistory[updatedHistory.length - 1],
                    selectedIndex: trackListIndex,
                  };
                }
                menuHistoryBeforeNowPlayingRef.current = updatedHistory;
                return updatedHistory;
              });
              setCurrentSongId(track.id);
              setIsPlaying(true);
              setMenuDirection("forward");
              setMenuMode(false);
              setCameFromNowPlayingMenuItem(false);
              if (useIpodStore.getState().showVideo) {
                toggleVideo();
              }
            },
            showChevron: false,
          }));
          setMenuHistory((prev) => [
            ...prev,
            { title: artist, items: artistTracks, selectedIndex: 0 },
          ]);
          setSelectedMenuItem(0);
        },
        showChevron: true,
      })),
    ];
  }, [tracks, registerActivity, setCurrentSongId, setIsPlaying, toggleVideo, isOffline, showOfflineStatus, t]);

  const settingsMenuItems = useMemo(() => {
    return [
      {
        label: t("apps.ipod.menuItems.repeat"),
        action: memoizedToggleRepeat,
        showChevron: false,
        value: loopCurrent
          ? t("apps.ipod.menuItems.one")
          : loopAll
          ? t("apps.ipod.menuItems.all")
          : t("apps.ipod.menuItems.off"),
      },
      {
        label: t("apps.ipod.menuItems.shuffle"),
        action: memoizedToggleShuffle,
        showChevron: false,
        value: isShuffled ? t("apps.ipod.menuItems.on") : t("apps.ipod.menuItems.off"),
      },
      {
        label: t("apps.ipod.menuItems.backlight"),
        action: memoizedToggleBacklight,
        showChevron: false,
        value: backlightOn ? t("apps.ipod.menuItems.on") : t("apps.ipod.menuItems.off"),
      },
      {
        label: t("apps.ipod.menuItems.theme"),
        action: memoizedHandleThemeChange,
        showChevron: false,
        value:
          theme === "classic"
            ? t("apps.ipod.menu.classic")
            : theme === "black"
            ? t("apps.ipod.menu.black")
            : t("apps.ipod.menu.u2"),
      },
    ];
  }, [loopCurrent, loopAll, isShuffled, backlightOn, theme, memoizedToggleRepeat, memoizedToggleShuffle, memoizedToggleBacklight, memoizedHandleThemeChange, t]);

  const mainMenuItems = useMemo(() => {
    const musicLabel = t("apps.ipod.menuItems.music");
    const settingsLabel = t("apps.ipod.menuItems.settings");
    return [
      {
        label: musicLabel,
        action: () => {
          registerActivity();
          if (useIpodStore.getState().showVideo) toggleVideo();
          setMenuDirection("forward");
          setMenuHistory((prev) => [
            ...prev,
            { title: musicLabel, items: musicMenuItems, selectedIndex: 0 },
          ]);
          setSelectedMenuItem(0);
        },
        showChevron: true,
      },
      {
        label: t("apps.ipod.menuItems.extras"),
        action: () => {
          registerActivity();
          if (useIpodStore.getState().showVideo) toggleVideo();
          setIsSongSearchDialogOpen(true);
        },
        showChevron: true,
      },
      {
        label: settingsLabel,
        action: () => {
          registerActivity();
          if (useIpodStore.getState().showVideo) toggleVideo();
          setMenuDirection("forward");
          setMenuHistory((prev) => [
            ...prev,
            { title: settingsLabel, items: settingsMenuItems, selectedIndex: 0 },
          ]);
          setSelectedMenuItem(0);
        },
        showChevron: true,
      },
      {
        label: t("apps.ipod.menuItems.shuffleSongs"),
        action: () => {
          registerActivity();
          if (useIpodStore.getState().showVideo) toggleVideo();
          memoizedToggleShuffle();
          setMenuMode(false);
        },
        showChevron: false,
      },
      {
        label: t("apps.ipod.menuItems.backlight"),
        action: () => memoizedToggleBacklight(),
        showChevron: false,
      },
      {
        label: t("apps.ipod.menuItems.nowPlaying"),
        action: () => {
          registerActivity();
          setMenuDirection("forward");
          setMenuMode(false);
          setCameFromNowPlayingMenuItem(true);
        },
        showChevron: true,
      },
    ];
  }, [registerActivity, toggleVideo, musicMenuItems, settingsMenuItems, memoizedToggleShuffle, memoizedToggleBacklight, t]);

  // Initialize menu history
  useEffect(() => {
    if (menuHistory.length === 0) {
      setMenuHistory([
        { title: t("apps.ipod.menuItems.ipod"), items: mainMenuItems, selectedIndex: 0 },
      ]);
    }
  }, [t, mainMenuItems, menuHistory.length]);

  // Helper function to rebuild menu items based on current tracks
  const rebuildMenuItems = useCallback((menu: typeof menuHistory[0]): typeof menuHistory[0]["items"] | null => {
    if (menu.title === t("apps.ipod.menuItems.ipod")) {
      return mainMenuItems;
    } else if (menu.title === t("apps.ipod.menuItems.music")) {
      return musicMenuItems;
    } else if (menu.title === t("apps.ipod.menuItems.settings")) {
      return settingsMenuItems;
    } else if (menu.title === t("apps.ipod.menuItems.allSongs")) {
      // Rebuild "All Songs" submenu from current tracks
      return tracks.map((track, trackIndex) => ({
        label: track.title,
        action: () => {
          registerActivity();
          if (isOffline) {
            showOfflineStatus();
            return;
          }
          setMenuHistory((prev) => {
            const updatedHist = [...prev];
            if (updatedHist.length > 0) {
              updatedHist[updatedHist.length - 1] = {
                ...updatedHist[updatedHist.length - 1],
                selectedIndex: trackIndex,
              };
            }
            menuHistoryBeforeNowPlayingRef.current = updatedHist;
            return updatedHist;
          });
          setCurrentSongId(track.id);
          setIsPlaying(true);
          setMenuDirection("forward");
          setMenuMode(false);
          setCameFromNowPlayingMenuItem(false);
          if (useIpodStore.getState().showVideo) {
            toggleVideo();
          }
        },
        showChevron: false,
      }));
    } else {
      // Check if this is an artist submenu by looking for matching artist in tracks
      const artistTracks = tracks.filter(
        (track) => (track.artist || t("apps.ipod.menu.unknownArtist")) === menu.title
      );
      if (artistTracks.length > 0) {
        // This is an artist submenu, rebuild it
        return artistTracks.map((track, trackListIndex) => ({
          label: track.title,
          action: () => {
            registerActivity();
            setMenuHistory((prev) => {
              const updatedHist = [...prev];
              if (updatedHist.length > 0) {
                updatedHist[updatedHist.length - 1] = {
                  ...updatedHist[updatedHist.length - 1],
                  selectedIndex: trackListIndex,
                };
              }
              menuHistoryBeforeNowPlayingRef.current = updatedHist;
              return updatedHist;
            });
            setCurrentSongId(track.id);
            setIsPlaying(true);
            setMenuDirection("forward");
            setMenuMode(false);
            setCameFromNowPlayingMenuItem(false);
            if (useIpodStore.getState().showVideo) {
              toggleVideo();
            }
          },
          showChevron: false,
        }));
      }
    }
    return null;
  }, [mainMenuItems, musicMenuItems, settingsMenuItems, tracks, t, registerActivity, isOffline, showOfflineStatus, setCurrentSongId, setIsPlaying, toggleVideo]);

  // Update menu when items change - update ALL menus in history, not just the current one
  // Also update the saved menu history ref that's used when returning from Now Playing
  useEffect(() => {
    // Helper to update a menu history array with fresh items
    const updateHistory = (history: typeof menuHistory): { updated: typeof menuHistory; hasChanges: boolean } => {
      let hasChanges = false;
      const updatedHistory = history.map((menu) => {
        const latestItems = rebuildMenuItems(menu);

        if (latestItems && menu.items !== latestItems) {
          hasChanges = true;
          // Preserve selected index but clamp it to valid range
          const clampedSelectedIndex = Math.min(menu.selectedIndex, latestItems.length - 1);
          return { ...menu, items: latestItems, selectedIndex: Math.max(0, clampedSelectedIndex) };
        }
        return menu;
      });
      return { updated: updatedHistory, hasChanges };
    };

    // Update the main menu history
    setMenuHistory((prevHistory) => {
      if (prevHistory.length === 0) return prevHistory;
      
      const { updated, hasChanges } = updateHistory(prevHistory);

      // Also clamp the selectedMenuItem state if we're on the current menu
      if (hasChanges) {
        const currentMenu = updated[updated.length - 1];
        if (currentMenu && selectedMenuItem >= currentMenu.items.length) {
          setSelectedMenuItem(Math.max(0, currentMenu.items.length - 1));
        }
      }

      return hasChanges ? updated : prevHistory;
    });

    // Also update the saved menu history ref (used when returning from Now Playing)
    // This ensures that if a track was added while in Now Playing, the menu will be updated when going back
    if (menuHistoryBeforeNowPlayingRef.current && menuHistoryBeforeNowPlayingRef.current.length > 0) {
      const { updated, hasChanges } = updateHistory(menuHistoryBeforeNowPlayingRef.current);
      if (hasChanges) {
        menuHistoryBeforeNowPlayingRef.current = updated;
      }
    }
  }, [rebuildMenuItems, selectedMenuItem]);

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
      const currentTracks = useIpodStore.getState().tracks;
      const existingTrack = currentTracks.find((track) => track.id === videoId);
      const shouldAutoplay = !(isIOS || isSafari);

      if (existingTrack) {
        toast.info(t("apps.ipod.dialogs.openedSharedTrack"));
        startTrackSwitch();
        setCurrentSongId(videoId);
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
    [setCurrentSongId, setIsPlaying, handleAddTrack, isOffline, showOfflineStatus, t, isIOS, isSafari, startTrackSwitch]
  );

  // Initial data handling
  useEffect(() => {
    if (isWindowOpen && initialData?.videoId && typeof initialData.videoId === "string") {
      if (lastProcessedInitialDataRef.current === initialData) return;

      const videoIdToProcess = initialData.videoId;
      setTimeout(() => {
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
  }, [isWindowOpen, initialData, processVideoId, clearIpodInitialData, instanceId]);

  // Update app event handling
  useEffect(() => {
    const handleUpdateApp = (
      event: CustomEvent<{ appId: string; initialData?: { videoId?: string } }>
    ) => {
      if (event.detail.appId === "ipod" && event.detail.initialData?.videoId) {
        if (lastProcessedInitialDataRef.current === event.detail.initialData) return;

        const videoId = event.detail.initialData.videoId;
        bringToForeground("ipod");
        processVideoId(videoId).catch((error) => {
          console.error(`Error processing videoId ${videoId}:`, error);
          toast.error("Failed to load shared track", { description: `Video ID: ${videoId}` });
        });
        lastProcessedInitialDataRef.current = event.detail.initialData;
      }
    };

    window.addEventListener("updateApp", handleUpdateApp as EventListener);
    return () => window.removeEventListener("updateApp", handleUpdateApp as EventListener);
  }, [processVideoId, bringToForeground]);

  // Handle closing sync mode - flush pending offset saves
  const closeSyncMode = useCallback(async () => {
    // Flush any pending lyric offset save for the current track
    const currentTrackId = tracks[currentIndex]?.id;
    if (currentTrackId) {
      await flushPendingLyricOffsetSave(currentTrackId);
    }
    setIsSyncModeOpen(false);
  }, [tracks, currentIndex]);

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
    setElapsedTime(state.playedSeconds);
  }, []);

  const handleDuration = useCallback((duration: number) => {
    setTotalTime(duration);
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

  // Menu button handler
  const handleMenuButton = useCallback(() => {
    playClickSound();
    vibrate();
    registerActivity();

    // Exit Cover Flow if open
    if (isCoverFlowOpen) {
      setIsCoverFlowOpen(false);
      return;
    }

    if (showVideo) toggleVideo();

    if (menuMode) {
      if (menuHistory.length > 1) {
        setMenuDirection("backward");
        setMenuHistory((prev) => prev.slice(0, -1));
        const previousMenu = menuHistory[menuHistory.length - 2];
        if (previousMenu) setSelectedMenuItem(previousMenu.selectedIndex);
      } else {
        playClickSound();
      }
    } else {
      setMenuDirection("backward");
      const mainMenu =
        menuHistory.length > 0
          ? menuHistory[0]
          : { title: t("apps.ipod.menuItems.ipod"), items: mainMenuItems, selectedIndex: 0 };

      if (cameFromNowPlayingMenuItem) {
        setMenuHistory([mainMenu]);
        setSelectedMenuItem(mainMenu?.selectedIndex || 0);
        setCameFromNowPlayingMenuItem(false);
      } else if (menuHistoryBeforeNowPlayingRef.current && menuHistoryBeforeNowPlayingRef.current.length > 0) {
        // Restore the menu history that was saved when entering Now Playing
        const savedHistory = menuHistoryBeforeNowPlayingRef.current;
        setMenuHistory(savedHistory);
        const lastMenu = savedHistory[savedHistory.length - 1];
        setSelectedMenuItem(lastMenu?.selectedIndex || 0);
      } else {
        // Fallback: go to All Songs menu with current track selected
        // This happens when restored from persisted state in Now Playing mode
        const allSongsLabel = t("apps.ipod.menuItems.allSongs");
        const allSongsMenu = tracks.map((track, trackIndex) => ({
          label: track.title,
          action: () => {
            registerActivity();
            if (isOffline) {
              showOfflineStatus();
              return;
            }
            setMenuHistory((prev) => {
              const updatedHist = [...prev];
              if (updatedHist.length > 0) {
                updatedHist[updatedHist.length - 1] = {
                  ...updatedHist[updatedHist.length - 1],
                  selectedIndex: trackIndex,
                };
              }
              menuHistoryBeforeNowPlayingRef.current = updatedHist;
              return updatedHist;
            });
            setCurrentSongId(track.id);
            setIsPlaying(true);
            setMenuDirection("forward");
            setMenuMode(false);
            setCameFromNowPlayingMenuItem(false);
            if (useIpodStore.getState().showVideo) {
              toggleVideo();
            }
          },
          showChevron: false,
        }));
        setMenuHistory([
          mainMenu,
          { title: t("apps.ipod.menuItems.music"), items: musicMenuItems, selectedIndex: 0 },
          { title: allSongsLabel, items: allSongsMenu, selectedIndex: currentIndex },
        ]);
        setSelectedMenuItem(currentIndex);
      }
      setMenuMode(true);
    }
  }, [playClickSound, vibrate, registerActivity, isCoverFlowOpen, showVideo, toggleVideo, menuMode, menuHistory, mainMenuItems, musicMenuItems, tracks, currentIndex, cameFromNowPlayingMenuItem, isOffline, showOfflineStatus, setCurrentSongId, setIsPlaying, t]);

  // Cover Flow handlers
  const handleCenterLongPress = useCallback(() => {
    // Toggle cover flow on long press of center button
    playClickSound();
    vibrate();
    registerActivity();

    if (isCoverFlowOpen) {
      // Exit cover flow
      setIsCoverFlowOpen(false);
    } else if (!menuMode && tracks.length > 0) {
      // Enter cover flow only when in Now Playing mode
      setIsCoverFlowOpen(true);
    }
  }, [playClickSound, vibrate, registerActivity, isCoverFlowOpen, menuMode, tracks.length]);

  const handleCoverFlowSelect = useCallback((index: number) => {
    playClickSound();
    vibrate();
    registerActivity();
    
    // Switch to the selected track
    const track = tracks[index];
    if (track) {
      startTrackSwitch();
      setCurrentSongId(track.id);
      setIsPlaying(true);
      setIsCoverFlowOpen(false);
      
      // Show video for the new track
      if (!showVideo) {
        toggleVideo();
      }
    }
  }, [playClickSound, vibrate, registerActivity, tracks, startTrackSwitch, setCurrentSongId, setIsPlaying, showVideo, toggleVideo]);

  const handleCoverFlowExit = useCallback(() => {
    playClickSound();
    vibrate();
    setIsCoverFlowOpen(false);
  }, [playClickSound, vibrate]);

  const handleCoverFlowRotation = useCallback(() => {
    playScrollSound();
  }, [playScrollSound]);

  // Wheel click handler
  const handleWheelClick = useCallback(
    (area: WheelArea) => {
      playClickSound();
      vibrate();
      registerActivity();

      switch (area) {
        case "top":
          handleMenuButton();
          break;
        case "right":
          if (isOffline) {
            showOfflineStatus();
          } else {
            skipOperationRef.current = true;
            startTrackSwitch();
            nextTrack();
            showStatus("⏭");
          }
          break;
        case "bottom":
          if (isOffline) {
            showOfflineStatus();
          } else {
            togglePlay();
            showStatus(useIpodStore.getState().isPlaying ? "▶" : "⏸");
          }
          break;
        case "left":
          if (isOffline) {
            showOfflineStatus();
          } else {
            skipOperationRef.current = true;
            startTrackSwitch();
            previousTrack();
            showStatus("⏮");
          }
          break;
        case "center":
          // Handle Cover Flow selection
          if (isCoverFlowOpen && coverFlowRef.current) {
            coverFlowRef.current.selectCurrent();
            return;
          }
          
          if (menuMode) {
            const currentMenu = menuHistory[menuHistory.length - 1];
            if (currentMenu?.items[selectedMenuItem]) {
              currentMenu.items[selectedMenuItem].action();
            }
          } else {
            if (tracks[currentIndex]) {
              if (!isPlaying) {
                if (isOffline) {
                  showOfflineStatus();
                } else {
                  togglePlay();
                  showStatus("▶");
                  setTimeout(() => {
                    if (!useIpodStore.getState().showVideo) toggleVideo();
                  }, 200);
                }
              } else {
                if (!isOffline) toggleVideo();
              }
            }
          }
          break;
      }
    },
    [playClickSound, vibrate, registerActivity, nextTrack, showStatus, togglePlay, previousTrack, menuMode, menuHistory, selectedMenuItem, tracks, currentIndex, isPlaying, toggleVideo, handleMenuButton, isOffline, showOfflineStatus, startTrackSwitch, isCoverFlowOpen]
  );

  // Wheel rotation handler
  const handleWheelRotation = useCallback(
    (direction: RotationDirection) => {
      playScrollSound();
      registerActivity();

      // Handle Cover Flow navigation
      if (isCoverFlowOpen && coverFlowRef.current) {
        if (direction === "clockwise") {
          coverFlowRef.current.navigateNext();
        } else {
          coverFlowRef.current.navigatePrevious();
        }
        return;
      }

      if (menuMode) {
        const currentMenu = menuHistory[menuHistory.length - 1];
        if (!currentMenu) return;
        const menuLength = currentMenu.items.length;
        if (menuLength === 0) return;

        setSelectedMenuItem((prevIndex) => {
          let newIndex = prevIndex;
          if (direction === "clockwise") {
            newIndex = Math.min(menuLength - 1, prevIndex + 1);
          } else {
            newIndex = Math.max(0, prevIndex - 1);
          }
          return newIndex;
        });
      } else {
        const activePlayer = isFullScreen ? fullScreenPlayerRef.current : playerRef.current;
        const currentTime = activePlayer?.getCurrentTime() || 0;
        let newTime = currentTime;
        if (direction === "clockwise") {
          newTime = currentTime + SEEK_AMOUNT_SECONDS;
          activePlayer?.seekTo(newTime);
        } else {
          newTime = Math.max(0, currentTime - SEEK_AMOUNT_SECONDS);
          activePlayer?.seekTo(newTime);
        }
        showStatus(
          `${direction === "clockwise" ? "⏩︎" : "⏪︎"} ${Math.floor(newTime / 60)}:${String(Math.floor(newTime % 60)).padStart(2, "0")}`
        );
      }
    },
    [playScrollSound, registerActivity, menuMode, menuHistory, isFullScreen, showStatus, isCoverFlowOpen]
  );

  // Scaling
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const prevMinimizedRef = useRef(isMinimized);

  useEffect(() => {
    let timeoutId: number;

    const handleResize = () => {
      if (!containerRef.current) return;

      requestAnimationFrame(() => {
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
        const finalScale = Math.max(1, newScale);

        setScale((prevScale) => {
          if (Math.abs(prevScale - finalScale) > 0.01) return finalScale;
          return prevScale;
        });
      });
    };

    timeoutId = window.setTimeout(handleResize, 10);

    if (prevMinimizedRef.current && !isMinimized) {
      [50, 100, 200, 300, 500].forEach((delay) => {
        window.setTimeout(handleResize, delay);
      });
    }
    prevMinimizedRef.current = isMinimized;

    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(handleResize, 10);
    });

    if (containerRef.current) resizeObserver.observe(containerRef.current);

    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
    };
  }, [isWindowOpen, isMinimized]);

  // Share and lyrics handlers
  const handleShareSong = useCallback(() => {
    if (tracks.length > 0 && currentIndex >= 0) {
      const track = tracks[currentIndex];
      // Save song metadata to cache when sharing (requires auth)
      // Pass isShare: true to update createdBy (if allowed)
      if (track) {
        const { username, authToken } = useChatsStore.getState();
        const auth = username && authToken ? { username, authToken } : null;
        saveSongMetadataFromTrack(track, auth, { isShare: true }).catch((error) => {
          console.error("[iPod] Error saving song metadata to cache:", error);
        });
      }
      setIsShareDialogOpen(true);
    }
  }, [tracks, currentIndex]);

  // Song search/add handlers
  const handleAddSong = useCallback(() => {
    setIsSongSearchDialogOpen(true);
  }, []);

  const handleSongSearchSelect = useCallback(
    async (result: SongSearchResult) => {
      try {
        const url = `https://www.youtube.com/watch?v=${result.videoId}`;
        await handleAddTrack(url);
      } catch (error) {
        console.error("Error adding track from search:", error);
        showStatus(`❌ ${t("apps.ipod.dialogs.errorAdding")} ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    },
    [handleAddTrack, showStatus, t]
  );

  const handleAddUrl = useCallback(
    async (url: string) => {
      await handleAddTrack(url);
    },
    [handleAddTrack]
  );

  const currentTrack = tracks[currentIndex];
  const lyricsSourceOverride = currentTrack?.lyricsSource;

  // Cover URL for paused state overlay in fullscreen
  const fullscreenCoverUrl = useMemo(() => {
    if (!currentTrack) return null;
    const videoId = getYouTubeVideoId(currentTrack.url);
    const youtubeThumbnail = videoId
      ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
      : null;
    return formatKugouImageUrl(currentTrack.cover, 1080) ?? youtubeThumbnail;
  }, [currentTrack]);

  const handleRefreshLyrics = useCallback(() => {
    if (tracks.length > 0 && currentIndex >= 0) setIsLyricsSearchDialogOpen(true);
  }, [tracks, currentIndex]);

  const handleLyricsSearchSelect = useCallback(
    (result: { hash: string; albumId: string | number; title: string; artist: string; album?: string }) => {
      const track = tracks[currentIndex];
      if (track) {
        setTrackLyricsSource(track.id, result);
        refreshLyrics();
      }
    },
    [tracks, currentIndex, setTrackLyricsSource, refreshLyrics]
  );

  const handleLyricsSearchReset = useCallback(() => {
    const track = tracks[currentIndex];
    if (track) {
      clearTrackLyricsSource(track.id);
      refreshLyrics();
    }
  }, [tracks, currentIndex, clearTrackLyricsSource, refreshLyrics]);

  const ipodGenerateShareUrl = (videoId: string): string => {
    return `${window.location.origin}/ipod/${videoId}`;
  };

  // Volume from audio settings store
  const { ipodVolume } = useAudioSettingsStoreShallow((state) => ({ ipodVolume: state.ipodVolume }));

  // Lyrics hook
  const selectedMatchForLyrics = useMemo(() => {
    if (!lyricsSourceOverride) return undefined;
    return {
      hash: lyricsSourceOverride.hash,
      albumId: lyricsSourceOverride.albumId,
      title: lyricsSourceOverride.title,
      artist: lyricsSourceOverride.artist,
      album: lyricsSourceOverride.album,
    };
  }, [lyricsSourceOverride]);

  // Resolve "auto" translation language to actual ryOS locale
  const effectiveTranslationLanguage = useMemo(
    () => getEffectiveTranslationLanguage(lyricsTranslationLanguage),
    [lyricsTranslationLanguage, i18n.language]
  );

  const fullScreenLyricsControls = useLyrics({
    songId: currentTrack?.id ?? "",
    title: currentTrack?.title ?? "",
    artist: currentTrack?.artist ?? "",
    currentTime: elapsedTime + (currentTrack?.lyricOffset ?? 0) / 1000,
    translateTo: effectiveTranslationLanguage,
    selectedMatch: selectedMatchForLyrics,
    includeFurigana: true, // Fetch furigana info with lyrics to reduce API calls
    // Always include soramimi in request to avoid hydration timing issues
    // (default setting is false, but user's saved setting might be true after hydration)
    // The server only returns cached soramimi data, doesn't generate anything here
    includeSoramimi: true,
    // Pass target language so server returns correct cached soramimi data
    soramimiTargetLanguage: romanization.soramamiTargetLanguage ?? "zh-TW",
    // Auth for force refresh / changing lyrics source
    auth,
  });

  // Show toast with Search button when lyrics fetch fails
  useLyricsErrorToast({
    error: fullScreenLyricsControls.error,
    songId: currentTrack?.id,
    onSearchClick: () => setIsLyricsSearchDialogOpen(true),
    t,
    appId: "ipod",
  });

  // Fetch furigana for lyrics and store in shared state
  // Use pre-fetched info from lyrics request to skip extra API call
  const { 
    furiganaMap, 
    soramimiMap, 
    isFetchingFurigana,
    isFetchingSoramimi,
    furiganaProgress,
    soramimiProgress,
  } = useFurigana({
    songId: currentTrack?.id ?? "",
    lines: fullScreenLyricsControls.originalLines,
    isShowingOriginal: true,
    romanization,
    prefetchedInfo: fullScreenLyricsControls.furiganaInfo,
    prefetchedSoramimiInfo: fullScreenLyricsControls.soramimiInfo,
    auth,
  });

  // Consolidated activity state for loading indicators
  const activityState = useActivityState({
    lyricsState: {
      isLoading: fullScreenLyricsControls.isLoading,
      isTranslating: fullScreenLyricsControls.isTranslating,
      translationProgress: fullScreenLyricsControls.translationProgress,
    },
    furiganaState: {
      isFetchingFurigana,
      furiganaProgress,
      isFetchingSoramimi,
      soramimiProgress,
    },
    translationLanguage: effectiveTranslationLanguage,
    isAddingSong,
  });

  // Convert furiganaMap to Record for storage - only when content actually changes
  const furiganaRecord = useMemo(() => {
    if (furiganaMap.size === 0) return null;
    const record: Record<string, import("@/utils/romanization").FuriganaSegment[]> = {};
    furiganaMap.forEach((value, key) => {
      record[key] = value;
    });
    return record;
  }, [furiganaMap]);

  // Ref to track last stored value to avoid redundant updates
  const lastFuriganaRecordRef = useRef<typeof furiganaRecord>(null);
  
  // Update shared store when furiganaMap changes
  useEffect(() => {
    // Skip if value hasn't actually changed (avoid unnecessary store updates)
    if (furiganaRecord === lastFuriganaRecordRef.current) return;
    lastFuriganaRecordRef.current = furiganaRecord;
    setCurrentFuriganaMap(furiganaRecord);
  }, [furiganaRecord, setCurrentFuriganaMap]);

  // Fullscreen sync
  const prevFullScreenRef = useRef(isFullScreen);

  useEffect(() => {
    if (isFullScreen !== prevFullScreenRef.current) {
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
              trackSwitchTimeoutRef.current = setTimeout(() => {
                isTrackSwitchingRef.current = false;
              }, 500);
              return;
            }
          }
          // Player not ready, retry
          setTimeout(checkAndSync, 100);
        };
        setTimeout(checkAndSync, 100);
      } else {
        const currentTime = fullScreenPlayerRef.current?.getCurrentTime() || elapsedTime;
        const wasPlaying = isPlaying;

        setTimeout(() => {
          if (playerRef.current) {
            playerRef.current.seekTo(currentTime);
            if (wasPlaying && !useIpodStore.getState().isPlaying) {
              setIsPlaying(true);
            }
          }
          // End track switch after sync complete
          trackSwitchTimeoutRef.current = setTimeout(() => {
            isTrackSwitchingRef.current = false;
          }, 500);
        }, 200);
      }
      prevFullScreenRef.current = isFullScreen;
    }
  }, [isFullScreen, elapsedTime, isPlaying, setIsPlaying, isIOSSafari]);

  // Seek time for fullscreen (delta)
  const seekTime = useCallback(
    (delta: number) => {
      if (fullScreenPlayerRef.current) {
        const currentTime = fullScreenPlayerRef.current.getCurrentTime() || 0;
        const newTime = Math.max(0, currentTime + delta);
        fullScreenPlayerRef.current.seekTo(newTime);
        showStatus(`${delta > 0 ? "⏩︎" : "⏪︎"} ${Math.floor(newTime / 60)}:${String(Math.floor(newTime % 60)).padStart(2, "0")}`);
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
        
        // Start playing if paused - also call playVideo() directly for iOS Safari
        if (!isPlaying) {
          setIsPlaying(true);
          // Directly call playVideo on the internal player to ensure it plays
          const internalPlayer = fullScreenPlayerRef.current?.getInternalPlayer?.();
          if (internalPlayer && typeof internalPlayer.playVideo === "function") {
            internalPlayer.playVideo();
          }
        }
        showStatus(`▶ ${Math.floor(newTime / 60)}:${String(Math.floor(newTime % 60)).padStart(2, "0")}`);
        
        // Clear guard after a short delay to allow seek + play to complete
        trackSwitchTimeoutRef.current = setTimeout(() => {
          isTrackSwitchingRef.current = false;
        }, 500);
      }
    },
    [showStatus, isPlaying, lyricOffset]
  );

  // Fullscreen callbacks
  const handleSelectTranslation = useCallback((code: string | null) => {
    useIpodStore.getState().setLyricsTranslationLanguage(code);
  }, []);

  const cycleAlignment = useCallback(() => {
    const store = useIpodStore.getState();
    const curr = store.lyricsAlignment;
    let next: LyricsAlignment;
    if (curr === LyricsAlignment.FocusThree) next = LyricsAlignment.Center;
    else if (curr === LyricsAlignment.Center) next = LyricsAlignment.Alternating;
    else next = LyricsAlignment.FocusThree;
    store.setLyricsAlignment(next);
    showStatus(
      next === LyricsAlignment.FocusThree
        ? t("apps.ipod.status.layoutFocus")
        : next === LyricsAlignment.Center
        ? t("apps.ipod.status.layoutCenter")
        : t("apps.ipod.status.layoutAlternating")
    );
  }, [showStatus, t]);

  const cycleLyricsFont = useCallback(() => {
    const store = useIpodStore.getState();
    const curr = store.lyricsFont;
    let next: LyricsFont;
    if (curr === LyricsFont.Rounded) next = LyricsFont.SansSerif;
    else if (curr === LyricsFont.SansSerif) next = LyricsFont.Serif;
    else next = LyricsFont.Rounded;
    store.setLyricsFont(next);
    showStatus(
      next === LyricsFont.Rounded
        ? t("apps.ipod.status.fontRounded")
        : next === LyricsFont.SansSerif
        ? t("apps.ipod.status.fontSansSerif")
        : t("apps.ipod.status.fontSerif")
    );
  }, [showStatus, t]);

  // Get CSS class name for current lyrics font
  const lyricsFontClassName = getLyricsFontClassName(lyricsFont);

  // Fullscreen change handler
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isFullScreen) {
        toggleFullScreen();
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [isFullScreen, toggleFullScreen]);

  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  const menuBar = (
    <IpodMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onClearLibrary={() => setIsConfirmClearOpen(true)}
      onSyncLibrary={manualSync}
      onAddSong={handleAddSong}
      onShareSong={handleShareSong}
      onRefreshLyrics={handleRefreshLyrics}
      onAdjustTiming={() => setIsSyncModeOpen(true)}
      onToggleCoverFlow={() => setIsCoverFlowOpen(!isCoverFlowOpen)}
    />
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={getTranslatedAppName("ipod")}
        onClose={onClose}
        isForeground={isForeground}
        appId="ipod"
        material="transparent"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
        keepMountedWhenMinimized
      >
        <div
          ref={containerRef}
          className="ipod-force-font flex flex-col items-center justify-center w-full h-full bg-gradient-to-b from-gray-100/20 to-gray-300/20 backdrop-blur-lg p-4 select-none"
          style={{ position: "relative", overflow: "hidden", contain: "layout style paint" }}
        >
          <div
            className={cn(
              "ipod-force-font w-[250px] h-[400px] rounded-2xl shadow-xl border border-black/40 flex flex-col items-center p-4 pb-8",
              theme === "classic" ? "bg-white/85" : "bg-black/85"
            )}
            style={{
              transform: `scale(${scale})`,
              transformOrigin: "center",
              transition: "transform 0.2s ease",
              minWidth: "250px",
              minHeight: "400px",
              maxWidth: "250px",
              maxHeight: "400px",
              contain: "layout style paint",
              willChange: "transform",
              backfaceVisibility: "hidden",
            }}
          >
            {/* Screen container with Cover Flow overlay */}
            <div 
              className="relative w-full" 
              style={{ height: "150px", minHeight: "150px", maxHeight: "150px" }}
              onMouseDown={(e) => {
                // Start long press timer for CoverFlow toggle
                if (screenLongPressTimerRef.current) clearTimeout(screenLongPressTimerRef.current);
                screenLongPressFiredRef.current = false;
                screenLongPressStartPos.current = { x: e.clientX, y: e.clientY };
                screenLongPressTimerRef.current = setTimeout(() => {
                  screenLongPressFiredRef.current = true;
                  handleCenterLongPress();
                }, 500);
              }}
              onMouseMove={(e) => {
                // Cancel long press if moved too far from start position
                if (screenLongPressStartPos.current && screenLongPressTimerRef.current) {
                  const dx = e.clientX - screenLongPressStartPos.current.x;
                  const dy = e.clientY - screenLongPressStartPos.current.y;
                  if (Math.abs(dx) > SCREEN_LONG_PRESS_MOVE_THRESHOLD || Math.abs(dy) > SCREEN_LONG_PRESS_MOVE_THRESHOLD) {
                    clearTimeout(screenLongPressTimerRef.current);
                    screenLongPressTimerRef.current = null;
                    screenLongPressStartPos.current = null;
                  }
                }
              }}
              onMouseUp={() => {
                if (screenLongPressTimerRef.current) {
                  clearTimeout(screenLongPressTimerRef.current);
                  screenLongPressTimerRef.current = null;
                }
                screenLongPressStartPos.current = null;
              }}
              onMouseLeave={() => {
                if (screenLongPressTimerRef.current) {
                  clearTimeout(screenLongPressTimerRef.current);
                  screenLongPressTimerRef.current = null;
                }
                screenLongPressStartPos.current = null;
              }}
              onTouchStart={(e) => {
                if (screenLongPressTimerRef.current) clearTimeout(screenLongPressTimerRef.current);
                screenLongPressFiredRef.current = false;
                const touch = e.touches[0];
                screenLongPressStartPos.current = { x: touch.clientX, y: touch.clientY };
                screenLongPressTimerRef.current = setTimeout(() => {
                  screenLongPressFiredRef.current = true;
                  handleCenterLongPress();
                }, 500);
              }}
              onTouchMove={(e) => {
                // Cancel long press if moved too far from start position
                if (screenLongPressStartPos.current && screenLongPressTimerRef.current) {
                  const touch = e.touches[0];
                  const dx = touch.clientX - screenLongPressStartPos.current.x;
                  const dy = touch.clientY - screenLongPressStartPos.current.y;
                  if (Math.abs(dx) > SCREEN_LONG_PRESS_MOVE_THRESHOLD || Math.abs(dy) > SCREEN_LONG_PRESS_MOVE_THRESHOLD) {
                    clearTimeout(screenLongPressTimerRef.current);
                    screenLongPressTimerRef.current = null;
                    screenLongPressStartPos.current = null;
                  }
                }
              }}
              onTouchEnd={() => {
                if (screenLongPressTimerRef.current) {
                  clearTimeout(screenLongPressTimerRef.current);
                  screenLongPressTimerRef.current = null;
                }
                screenLongPressStartPos.current = null;
              }}
              onTouchCancel={() => {
                if (screenLongPressTimerRef.current) {
                  clearTimeout(screenLongPressTimerRef.current);
                  screenLongPressTimerRef.current = null;
                }
                screenLongPressStartPos.current = null;
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
                koreanDisplay={koreanDisplay}
                japaneseFurigana={japaneseFurigana}
                lyricOffset={lyricOffset ?? 0}
                adjustLyricOffset={(delta) =>
                  useIpodStore.getState().adjustLyricOffset(currentIndex, delta)
                }
                registerActivity={registerActivity}
                isFullScreen={isFullScreen}
                lyricsControls={fullScreenLyricsControls}
                furiganaMap={furiganaMap}
                soramimiMap={soramimiMap}
                activityState={activityState}
                onNextTrack={() => {
                  if (isOffline) {
                    showOfflineStatus();
                  } else {
                    skipOperationRef.current = true;
                    startTrackSwitch();
                    nextTrack();
                    showStatus("⏭");
                  }
                }}
                onPreviousTrack={() => {
                  if (isOffline) {
                    showOfflineStatus();
                  } else {
                    skipOperationRef.current = true;
                    startTrackSwitch();
                    previousTrack();
                    showStatus("⏮");
                  }
                }}
              />

              {/* Cover Flow overlay - positioned within screen bounds */}
              <CoverFlow
                ref={coverFlowRef}
                tracks={tracks}
                currentIndex={currentIndex}
                onSelectTrack={handleCoverFlowSelect}
                onExit={handleCoverFlowExit}
                onRotation={handleCoverFlowRotation}
                isVisible={isCoverFlowOpen}
              />
            </div>

            <IpodWheel
              theme={theme}
              onWheelClick={handleWheelClick}
              onWheelRotation={handleWheelRotation}
              onMenuButton={handleMenuButton}
              onCenterLongPress={handleCenterLongPress}
            />
          </div>
        </div>

        {/* Full screen portal */}
        {isFullScreen && (
          <FullScreenPortal
            onClose={() => toggleFullScreen()}
            togglePlay={togglePlay}
            nextTrack={() => {
              skipOperationRef.current = true;
              startTrackSwitch();
              nextTrack();
              // Read from iPod store (which has the updated currentSongId)
              const state = useIpodStore.getState();
              const newTrack = state.currentSongId 
                ? state.tracks.find((t) => t.id === state.currentSongId) 
                : state.tracks[0];
              if (newTrack) {
                const artistInfo = newTrack.artist ? ` - ${newTrack.artist}` : "";
                showStatus(`⏭ ${newTrack.title}${artistInfo}`);
              }
            }}
            previousTrack={() => {
              skipOperationRef.current = true;
              startTrackSwitch();
              previousTrack();
              // Read from iPod store (which has the updated currentSongId)
              const state = useIpodStore.getState();
              const newTrack = state.currentSongId 
                ? state.tracks.find((t) => t.id === state.currentSongId) 
                : state.tracks[0];
              if (newTrack) {
                const artistInfo = newTrack.artist ? ` - ${newTrack.artist}` : "";
                showStatus(`⏮ ${newTrack.title}${artistInfo}`);
              }
            }}
            seekTime={seekTime}
            showStatus={showStatus}
            showOfflineStatus={showOfflineStatus}
            registerActivity={registerActivity}
            isPlaying={isPlaying}
            statusMessage={statusMessage}
            currentTranslationCode={lyricsTranslationLanguage}
            onSelectTranslation={handleSelectTranslation}
            currentAlignment={lyricsAlignment}
            onCycleAlignment={cycleAlignment}
            currentLyricsFont={lyricsFont}
            onCycleLyricsFont={cycleLyricsFont}
            romanization={romanization}
            onRomanizationChange={setRomanization}
            onSyncMode={() => setIsSyncModeOpen((prev) => !prev)}
            isSyncModeOpen={isSyncModeOpen}
            syncModeContent={
              fullScreenLyricsControls.originalLines.length > 0 ? (
                <LyricsSyncMode
                  lines={fullScreenLyricsControls.originalLines}
                  currentTimeMs={elapsedTime * 1000}
                  durationMs={totalTime * 1000}
                  currentOffset={lyricOffset}
                  romanization={romanization}
                  furiganaMap={furiganaMap}
                  onSetOffset={(offsetMs) => {
                    setLyricOffset(currentIndex, offsetMs);
                    showStatus(
                      `${t("apps.ipod.status.offset")} ${offsetMs >= 0 ? "+" : ""}${(offsetMs / 1000).toFixed(2)}s`
                    );
                  }}
                  onAdjustOffset={(deltaMs) => {
                    useIpodStore.getState().adjustLyricOffset(currentIndex, deltaMs);
                    const newOffset = lyricOffset + deltaMs;
                    showStatus(
                      `${t("apps.ipod.status.offset")} ${newOffset >= 0 ? "+" : ""}${(newOffset / 1000).toFixed(2)}s`
                    );
                  }}
                  onSeek={(timeMs) => {
                    const activePlayer = isFullScreen ? fullScreenPlayerRef.current : playerRef.current;
                    activePlayer?.seekTo(timeMs / 1000);
                  }}
                  onClose={closeSyncMode}
                />
              ) : undefined
            }
            fullScreenPlayerRef={fullScreenPlayerRef}
            activityState={activityState}
          >
            {({ controlsVisible }) => (
              <div className="flex flex-col w-full h-full">
                <div className="relative w-full h-full overflow-visible">
                  <div
                    className="w-full relative"
                    style={{
                      height: "calc(100% + clamp(480px, 60dvh, 800px))",
                      transform: "translateY(-240px)",
                    }}
                  >
                    {tracks[currentIndex] && (
                      <div className="w-full h-full pointer-events-none">
                        <ReactPlayer
                          ref={fullScreenPlayerRef}
                          url={tracks[currentIndex].url}
                          playing={isPlaying && isFullScreen}
                          controls
                          width="100%"
                          height="100%"
                          volume={ipodVolume * useAudioSettingsStore.getState().masterVolume}
                          loop={loopCurrent}
                          onEnded={handleTrackEnd}
                          onProgress={handleProgress}
                          progressInterval={100}
                          onDuration={handleDuration}
                          onPlay={handlePlay}
                          onPause={handlePause}
                          onReady={handleReady}
                          config={{
                            youtube: {
                              playerVars: {
                                modestbranding: 1,
                                rel: 0,
                                showinfo: 0,
                                iv_load_policy: 3,
                                cc_load_policy: 0,
                                fs: 1,
                                playsinline: 1,
                                enablejsapi: 1,
                                origin: window.location.origin,
                              },
                              embedOptions: {
                                referrerPolicy: "strict-origin-when-cross-origin",
                              },
                            },
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Paused cover overlay */}
                  <AnimatePresence>
                    {tracks[currentIndex] && !isPlaying && fullscreenCoverUrl && (
                      <motion.div
                        className="absolute inset-0 z-15"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePlay();
                        }}
                      >
                        <motion.img
                          src={fullscreenCoverUrl}
                          alt={tracks[currentIndex]?.title}
                          className="w-full h-full object-cover brightness-50 pointer-events-none"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.3 }}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Lyrics overlays - positioned relative to viewport, not video container */}
                  {showLyrics && tracks[currentIndex] && (
                    <div className="fixed inset-0 bg-black/50 z-10 pointer-events-none" />
                  )}

                  {showLyrics && tracks[currentIndex] && (
                    <div className="absolute inset-0 z-20 pointer-events-none" data-lyrics>
                      <LyricsDisplay
                        lines={fullScreenLyricsControls.lines}
                        originalLines={fullScreenLyricsControls.originalLines}
                        currentLine={fullScreenLyricsControls.currentLine}
                        isLoading={fullScreenLyricsControls.isLoading}
                        error={fullScreenLyricsControls.error}
                        visible={true}
                        videoVisible={true}
                        alignment={lyricsAlignment}
                        koreanDisplay={koreanDisplay}
                        japaneseFurigana={japaneseFurigana}
                        fontClassName={lyricsFontClassName}
                        onAdjustOffset={(delta) => {
                          useIpodStore.getState().adjustLyricOffset(currentIndex, delta);
                          const newOffset = (tracks[currentIndex]?.lyricOffset ?? 0) + delta;
                          const sign = newOffset > 0 ? "+" : newOffset < 0 ? "" : "";
                          showStatus(`${t("apps.ipod.status.offset")} ${sign}${(newOffset / 1000).toFixed(2)}s`);
                          fullScreenLyricsControls.updateCurrentTimeManually(elapsedTime + newOffset / 1000);
                        }}
                        onSwipeUp={() => {
                          if (isOffline) {
                            showOfflineStatus();
                          } else {
                            skipOperationRef.current = true;
                            startTrackSwitch();
                          nextTrack();
                          // Read state synchronously after store update
                          const state = useIpodStore.getState();
                          const newTrack = state.getCurrentTrack();
                            if (newTrack) {
                              const artistInfo = newTrack.artist ? ` - ${newTrack.artist}` : "";
                              showStatus(`⏭ ${newTrack.title}${artistInfo}`);
                            }
                          }
                        }}
                        onSwipeDown={() => {
                          if (isOffline) {
                            showOfflineStatus();
                          } else {
                            skipOperationRef.current = true;
                            startTrackSwitch();
                          previousTrack();
                          // Read state synchronously after store update
                          const state = useIpodStore.getState();
                          const newTrack = state.getCurrentTrack();
                            if (newTrack) {
                              const artistInfo = newTrack.artist ? ` - ${newTrack.artist}` : "";
                              showStatus(`⏮ ${newTrack.title}${artistInfo}`);
                            }
                          }
                        }}
                        isTranslating={fullScreenLyricsControls.isTranslating}
                        textSizeClass="fullscreen-lyrics-text"
                        gapClass="gap-0"
                        containerStyle={{
                          gap: "clamp(0.2rem, calc(min(10vw,10vh) * 0.08), 1rem)",
                          paddingLeft: "env(safe-area-inset-left, 0px)",
                          paddingRight: "env(safe-area-inset-right, 0px)",
                        }}
                        interactive={true}
                        bottomPaddingClass={controlsVisible ? "pb-16" : "pb-6"}
                        furiganaMap={furiganaMap}
                        soramimiMap={soramimiMap}
                        currentTimeMs={(elapsedTime + (currentTrack?.lyricOffset ?? 0) / 1000) * 1000}
                        onSeekToTime={seekToTime}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </FullScreenPortal>
        )}

        <HelpDialog
          isOpen={isHelpDialogOpen}
          onOpenChange={setIsHelpDialogOpen}
          helpItems={translatedHelpItems}
          appId="ipod"
        />
        <AboutDialog
          isOpen={isAboutDialogOpen}
          onOpenChange={setIsAboutDialogOpen}
          metadata={appMetadata}
          appId="ipod"
        />
        <ConfirmDialog
          isOpen={isConfirmClearOpen}
          onOpenChange={setIsConfirmClearOpen}
          onConfirm={() => {
            clearLibrary();
            setIsConfirmClearOpen(false);
            showStatus(t("apps.ipod.status.libraryCleared"));
          }}
          title={t("apps.ipod.dialogs.clearLibraryTitle")}
          description={t("apps.ipod.dialogs.clearLibraryDescription")}
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
        {currentTrack && (
          <LyricsSearchDialog
            isOpen={isLyricsSearchDialogOpen}
            onOpenChange={setIsLyricsSearchDialogOpen}
            trackId={currentTrack.id}
            trackTitle={currentTrack.title}
            trackArtist={currentTrack.artist}
            initialQuery={`${currentTrack.title} ${currentTrack.artist || ""}`.trim()}
            onSelect={handleLyricsSearchSelect}
            onReset={handleLyricsSearchReset}
            hasOverride={!!lyricsSourceOverride}
            currentSelection={lyricsSourceOverride}
          />
        )}
        <SongSearchDialog
          isOpen={isSongSearchDialogOpen}
          onOpenChange={setIsSongSearchDialogOpen}
          onSelect={handleSongSearchSelect}
          onAddUrl={handleAddUrl}
        />

        {/* Lyrics Sync Mode (non-fullscreen only - fullscreen renders in portal) */}
        {!isFullScreen && isSyncModeOpen && fullScreenLyricsControls.originalLines.length > 0 && (
          <div className="absolute inset-0 z-50" style={{ borderRadius: "inherit" }}>
            <LyricsSyncMode
              lines={fullScreenLyricsControls.originalLines}
              currentTimeMs={elapsedTime * 1000}
              durationMs={totalTime * 1000}
              currentOffset={lyricOffset}
              romanization={romanization}
              furiganaMap={furiganaMap}
              onSetOffset={(offsetMs) => {
                setLyricOffset(currentIndex, offsetMs);
                showStatus(
                  `${t("apps.ipod.status.offset")} ${offsetMs >= 0 ? "+" : ""}${(offsetMs / 1000).toFixed(2)}s`
                );
              }}
              onAdjustOffset={(deltaMs) => {
                useIpodStore.getState().adjustLyricOffset(currentIndex, deltaMs);
                const newOffset = lyricOffset + deltaMs;
                showStatus(
                  `${t("apps.ipod.status.offset")} ${newOffset >= 0 ? "+" : ""}${(newOffset / 1000).toFixed(2)}s`
                );
              }}
              onSeek={(timeMs) => {
                playerRef.current?.seekTo(timeMs / 1000);
              }}
              onClose={closeSyncMode}
            />
          </div>
        )}
      </WindowFrame>

      {/* PIP Player */}
      <AnimatePresence>
        {isMinimized && !isFullScreen && tracks.length > 0 && currentIndex >= 0 && (
          <PipPlayer
            currentTrack={tracks[currentIndex] || null}
            isPlaying={isPlaying}
            onTogglePlay={togglePlay}
            onNextTrack={() => { startTrackSwitch(); nextTrack(); }}
            onPreviousTrack={() => { startTrackSwitch(); previousTrack(); }}
            onRestore={() => {
              if (instanceId) restoreInstance(instanceId);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
