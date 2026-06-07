import { useRef } from "react";
import { useOffline } from "@/hooks/useOffline";
import { useIpodActiveLibrary } from "./useIpodActiveLibrary";
import { useIpodGames } from "./useIpodGames";
import { useIpodPlayback } from "./useIpodPlayback";
import { useIpodNavigation } from "./useIpodNavigation";
import { useIpodLyrics } from "./useIpodLyrics";
import { useIpodListenSession } from "./useIpodListenSession";
import { useIpodStore } from "@/stores/useIpodStore";
import { useIpodStoreShallow } from "@/stores/helpers";
import { useChatsStore } from "@/stores/useChatsStore";
import { useShallow } from "zustand/react/shallow";
import { useAppStoreShallow } from "@/stores/helpers";
import { useAudioSettingsStoreShallow } from "@/stores/helpers";
import type { IpodInitialData } from "../../base/types";

export interface UseIpodLogicOptions {
  isWindowOpen: boolean;
  isForeground: boolean | undefined;
  initialData: IpodInitialData | undefined;
  instanceId: string | undefined;
}

export function useIpodLogic({
  isWindowOpen,
  isForeground,
  initialData,
  instanceId,
}: UseIpodLogicOptions) {
  const isOffline = useOffline();
  const lastProcessedInitialDataRef = useRef<unknown>(null);
  const setMenuModeRef = useRef<(value: boolean | ((prev: boolean) => boolean)) => void>(
    () => undefined
  );

  const {
    librarySource,
    isAppleMusic,
    tracks,
    browsableTracks,
    currentSongId,
    currentIndex,
    coverFlowCurrentIndex,
    nowPlayingScope,
    loopCurrent,
    loopAll,
    isShuffled,
    isPlaying,
    showVideo,
    backlightOn,
    appleMusicCurrentSongId,
  } = useIpodActiveLibrary();

  const {
    togglePlay,
    setIsPlaying,
    setDisplayMode,
    toggleVideo,
    toggleBacklight,
    setLibrarySource,
    toggleFullScreen,
    isFullScreen,
    lyricsFont,
    lyricsAlignment,
    lyricsTranslationLanguage,
    romanization,
    setRomanization,
    showLyrics,
    koreanDisplay,
    japaneseFurigana,
    lcdFilterOn,
    displayMode,
    theme: persistedTheme,
    refreshLyrics,
    setTrackLyricsSource,
    clearTrackLyricsSource,
    setLyricOffset,
    setCurrentFuriganaMap,
    youtubeNextTrack,
    youtubePreviousTrack,
    appleMusicNextTrack,
    appleMusicPreviousTrack,
    setYoutubeCurrentSongId,
    clearLibrary,
  } = useIpodStoreShallow((s) => ({
    togglePlay: s.togglePlay,
    setIsPlaying: s.setIsPlaying,
    setDisplayMode: s.setDisplayMode,
    toggleVideo: s.toggleVideo,
    toggleBacklight: s.toggleBacklight,
    setLibrarySource: s.setLibrarySource,
    toggleFullScreen: s.toggleFullScreen,
    isFullScreen: s.isFullScreen,
    lyricsFont: s.lyricsFont,
    lyricsAlignment: s.lyricsAlignment,
    lyricsTranslationLanguage: s.lyricsTranslationLanguage,
    romanization: s.romanization,
    setRomanization: s.setRomanization,
    showLyrics: s.showLyrics,
    koreanDisplay: s.koreanDisplay,
    japaneseFurigana: s.japaneseFurigana,
    lcdFilterOn: s.lcdFilterOn,
    displayMode: s.displayMode,
    theme: s.theme,
    refreshLyrics: s.refreshLyrics,
    setTrackLyricsSource: s.setTrackLyricsSource,
    clearTrackLyricsSource: s.clearTrackLyricsSource,
    setLyricOffset: s.setLyricOffset,
    setCurrentFuriganaMap: s.setCurrentFuriganaMap,
    youtubeNextTrack: s.nextTrack,
    youtubePreviousTrack: s.previousTrack,
    appleMusicNextTrack: s.appleMusicNextTrack,
    appleMusicPreviousTrack: s.appleMusicPreviousTrack,
    setYoutubeCurrentSongId: s.setCurrentSongId,
    clearLibrary: s.clearLibrary,
  }));

  const rawNextTrack = isAppleMusic ? appleMusicNextTrack : youtubeNextTrack;
  const rawPreviousTrack = isAppleMusic
    ? appleMusicPreviousTrack
    : youtubePreviousTrack;
  const setCurrentSongId = isAppleMusic
    ? useIpodStore.getState().setAppleMusicCurrentSongId
    : setYoutubeCurrentSongId;

  const { username, isAuthenticated } = useChatsStore(
    useShallow((s) => ({ username: s.username, isAuthenticated: s.isAuthenticated }))
  );
  const auth =
    username && isAuthenticated ? { username, isAuthenticated } : undefined;

  const { bringInstanceToForeground, clearIpodInitialData, restoreInstance, instances } =
    useAppStoreShallow((state) => ({
      bringInstanceToForeground: state.bringInstanceToForeground,
      clearIpodInitialData: state.clearInstanceInitialData,
      instances: state.instances,
      restoreInstance: state.restoreInstance,
    }));

  const isMinimized = instanceId
    ? instances[instanceId]?.isMinimized ?? false
    : false;

  const games = useIpodGames();

  const playback = useIpodPlayback({
    isWindowOpen,
    isForeground,
    isFullScreen,
    isAppleMusic,
    appleMusicCurrentSongId,
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
    isMusicQuizOpen: games.isMusicQuizOpen,
    isBrickGameOpen: games.isBrickGameOpen,
    backlightOn,
    backlightTimeout: useIpodStore.getState().backlightTimeout,
    initialData,
    instanceId,
    clearIpodInitialData,
    lastProcessedInitialDataRef,
    lyricOffset: 0,
    setMenuMode: (value) => setMenuModeRef.current(value),
  });

  const navigation = useIpodNavigation({
    isWindowOpen,
    instanceId,
    playback,
    games,
  });
  setMenuModeRef.current = navigation.setMenuMode;

  const lyrics = useIpodLyrics({
    tracks,
    currentIndex,
    elapsedTime: playback.elapsedTime,
    lyricsFont,
    lyricsTranslationLanguage,
    romanization,
    setCurrentFuriganaMap,
    setTrackLyricsSource,
    clearTrackLyricsSource,
    refreshLyrics,
    auth,
    showStatus: playback.showStatus,
    isAddingSong: playback.isAddingSong,
  });

  useIpodListenSession({
    isWindowOpen,
    initialData,
    instanceId,
    username,
    bringInstanceToForeground,
    clearIpodInitialData,
    processVideoId: playback.processVideoId,
    lastProcessedInitialDataRef,
  });

  const { ipodVolume } = useAudioSettingsStoreShallow((state) => ({
    ipodVolume: state.ipodVolume,
  }));

  const theme = navigation.theme ?? persistedTheme;

  return {
    t: navigation.t,
    translatedHelpItems: navigation.translatedHelpItems,

    librarySource,
    isAppleMusic,
    musicKitInstance: navigation.musicKitInstance,
    musicKitStatus: navigation.musicKitStatus,
    appleMusicAuthorized: navigation.appleMusicAuthorized,
    appleMusicLibraryLoading: navigation.appleMusicLibraryLoading,
    appleMusicLibraryError: navigation.appleMusicLibraryError,
    appleMusicLibrarySize: navigation.appleMusicLibrarySize,
    handleAppleMusicSignIn: navigation.handleAppleMusicSignIn,
    handleAppleMusicSignOut: navigation.handleAppleMusicSignOut,
    handleAppleMusicRefresh: navigation.handleAppleMusicRefresh,
    handleSwitchToYoutube: navigation.handleSwitchToYoutube,
    handleSwitchToAppleMusic: navigation.handleSwitchToAppleMusic,
    pauseBeforeWindowClose: playback.pauseBeforeWindowClose,
    setLibrarySource,

    tracks,
    coverFlowTracks: browsableTracks,
    currentSongId,
    currentIndex,
    coverFlowCurrentIndex,
    nowPlayingScope,
    loopCurrent,
    loopAll,
    isShuffled,
    isPlaying,
    showVideo,
    backlightOn,
    theme,
    lcdFilterOn,
    displayMode,
    showLyrics,
    lyricsAlignment,
    lyricsFont,
    lyricsFontClassName: lyrics.lyricsFontClassName,
    koreanDisplay,
    japaneseFurigana,
    romanization,
    setRomanization,
    lyricsTranslationLanguage,
    lyricOffset: lyrics.lyricOffset,
    isFullScreen,
    toggleFullScreen,
    isMinimized,
    isXpTheme: navigation.isXpTheme,
    isOffline,

    playerRef: playback.playerRef,
    fullScreenPlayerRef: playback.fullScreenPlayerRef,
    coverFlowRef: navigation.coverFlowRef,
    containerRef: navigation.containerRef,

    playClickSound: navigation.playClickSound,
    playScrollSound: navigation.playScrollSound,
    vibrate: navigation.vibrate,

    statusMessage: playback.statusMessage,
    elapsedTime: playback.elapsedTime,
    totalTime: playback.totalTime,
    scale: navigation.scale,
    menuMode: navigation.menuMode,
    selectedMenuItem: navigation.selectedMenuItem,
    menuDirection: navigation.menuDirection,
    menuHistory: navigation.menuHistory,
    appleMusicMenuTitlebarLoading: navigation.appleMusicMenuTitlebarLoading,
    fastScrollLetter: navigation.fastScrollLetter,
    cameFromNowPlayingMenuItem: navigation.cameFromNowPlayingMenuItem,
    isCoverFlowOpen: navigation.isCoverFlowOpen,
    isMusicQuizOpen: games.isMusicQuizOpen,
    setIsMusicQuizOpen: games.setIsMusicQuizOpen,
    musicQuizRef: games.musicQuizRef,
    isBrickGameOpen: games.isBrickGameOpen,
    setIsBrickGameOpen: games.setIsBrickGameOpen,
    brickGameRef: games.brickGameRef,
    isAddingSong: playback.isAddingSong,
    activityState: lyrics.activityState,
    skipOperationRef: playback.skipOperationRef,

    isHelpDialogOpen: navigation.isHelpDialogOpen,
    setIsHelpDialogOpen: navigation.setIsHelpDialogOpen,
    isAboutDialogOpen: navigation.isAboutDialogOpen,
    setIsAboutDialogOpen: navigation.setIsAboutDialogOpen,
    isConfirmClearOpen: navigation.isConfirmClearOpen,
    setIsConfirmClearOpen: navigation.setIsConfirmClearOpen,
    isShareDialogOpen: navigation.isShareDialogOpen,
    setIsShareDialogOpen: navigation.setIsShareDialogOpen,
    isLyricsSearchDialogOpen: lyrics.isLyricsSearchDialogOpen,
    setIsLyricsSearchDialogOpen: lyrics.setIsLyricsSearchDialogOpen,
    isSongSearchDialogOpen: navigation.isSongSearchDialogOpen,
    setIsSongSearchDialogOpen: navigation.setIsSongSearchDialogOpen,
    isSyncModeOpen: lyrics.isSyncModeOpen,
    setIsSyncModeOpen: lyrics.setIsSyncModeOpen,

    currentTrack: lyrics.currentTrack,
    lyricsSourceOverride: lyrics.lyricsSourceOverride,
    fullscreenCoverUrl: lyrics.fullscreenCoverUrl,

    fullScreenLyricsControls: lyrics.fullScreenLyricsControls,
    furiganaMap: lyrics.furiganaMap,
    soramimiMap: lyrics.soramimiMap,
    effectiveTranslationLanguage: lyrics.effectiveTranslationLanguage,
    lyricsTitle: lyrics.lyricsTitle,
    lyricsArtist: lyrics.lyricsArtist,
    lyricsSongId: lyrics.lyricsSongId,

    ipodVolume,

    handleTrackEnd: playback.handleTrackEnd,
    handleProgress: playback.handleProgress,
    handleDuration: playback.handleDuration,
    handlePlay: playback.handlePlay,
    handlePause: playback.handlePause,
    handleReady: playback.handleReady,
    handleMenuButton: navigation.handleMenuButton,
    handleWheelClick: navigation.handleWheelClick,
    handleWheelRotation: navigation.handleWheelRotation,
    handleCenterLongPress: navigation.handleCenterLongPress,
    handleCoverFlowSelect: navigation.handleCoverFlowSelect,
    handleCoverFlowPlayInPlace: navigation.handleCoverFlowPlayInPlace,
    handleCoverFlowExit: navigation.handleCoverFlowExit,
    handleCoverFlowRotation: navigation.handleCoverFlowRotation,
    handleShareSong: navigation.handleShareSong,
    handleAddSong: navigation.handleAddSong,
    handleSongSearchSelect: navigation.handleSongSearchSelect,
    handleAddUrl: navigation.handleAddUrl,
    handleAppleMusicSearch: navigation.handleAppleMusicSearch,
    handleAppleMusicSearchSelect: navigation.handleAppleMusicSearchSelect,
    handleAppleMusicAddToFavorites: navigation.handleAppleMusicAddToFavorites,
    handleRefreshLyrics: lyrics.handleRefreshLyrics,
    handleLyricsSearchSelect: lyrics.handleLyricsSearchSelect,
    handleLyricsSearchReset: lyrics.handleLyricsSearchReset,
    handleSelectTranslation: lyrics.handleSelectTranslation,
    cycleAlignment: lyrics.cycleAlignment,
    cycleLyricsFont: lyrics.cycleLyricsFont,
    seekTime: playback.seekTime,
    seekToTime: playback.seekToTime,
    closeSyncMode: lyrics.closeSyncMode,
    registerActivity: navigation.registerActivity,
    showStatus: navigation.showStatus,
    showOfflineStatus: navigation.showOfflineStatus,
    startTrackSwitch: playback.startTrackSwitch,
    togglePlay,
    setDisplayMode,
    toggleVideo,
    toggleBacklight,
    setCurrentSongId,
    setIsPlaying,
    setMenuMode: navigation.setMenuMode,
    setSelectedMenuItem: navigation.setSelectedMenuItem,
    setMenuDirection: navigation.setMenuDirection,
    setMenuHistory: navigation.setMenuHistory,
    setCameFromNowPlayingMenuItem: navigation.setCameFromNowPlayingMenuItem,
    setIsCoverFlowOpen: navigation.setIsCoverFlowOpen,
    nextTrack: playback.nextTrack,
    previousTrack: playback.previousTrack,
    clearLibrary,
    manualSync: playback.manualSync,
    restoreInstance,

    mainMenuItems: navigation.mainMenuItems,
    musicMenuItems: navigation.musicMenuItems,
    settingsMenuItems: navigation.settingsMenuItems,
    handleMenuItemAction: navigation.handleMenuItemAction,

    screenLongPressTimerRef: navigation.screenLongPressTimerRef,
    screenLongPressFiredRef: navigation.screenLongPressFiredRef,
    screenLongPressStartPos: navigation.screenLongPressStartPos,
    SCREEN_LONG_PRESS_MOVE_THRESHOLD: navigation.SCREEN_LONG_PRESS_MOVE_THRESHOLD,

    ipodGenerateShareUrl: navigation.ipodGenerateShareUrl,
    getCurrentStoreTrack: navigation.getCurrentStoreTrack,

    setLyricOffset,
    adjustLyricOffset: (index: number, delta: number) => {
      useIpodStore.getState().adjustLyricOffset(index, delta);
    },
  };
}
