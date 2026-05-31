import { useCallback, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import type { AppProps, KaraokeInitialData } from "@/apps/base/types";
import { useChatsStore } from "@/stores/useChatsStore";
import { DisplayMode } from "@/types/lyrics";
import { KaraokeMenuBar } from "../KaraokeMenuBar";
import { useKaraokeLogic } from "../../hooks/useKaraokeLogic";

export type UseKaraokeAppControllerArgs = Pick<
  AppProps<KaraokeInitialData>,
  "isWindowOpen" | "isForeground" | "initialData" | "instanceId"
> & {
  onClose: AppProps<KaraokeInitialData>["onClose"];
};

export function useKaraokeAppController({
  isWindowOpen,
  isForeground,
  initialData,
  instanceId,
  onClose,
}: UseKaraokeAppControllerArgs) {
  const logic = useKaraokeLogic({
    isWindowOpen,
    isForeground,
    initialData,
    instanceId,
  });

  const {
    t,
    tracks,
    currentIndex,
    isPlaying,
    isListenSessionRemoteOnly,
    isOffline,
    handleNext,
    handlePrevious,
    showStatus,
    showOfflineStatus,
    restartAutoHideTimer,
    userHasInteractedRef,
    setIsCoverFlowOpen,
    setDisplayMode,
    displayMode,
    listenSession,
    setIsHelpDialogOpen,
    setIsAboutDialogOpen,
    handleAddSong,
    handleShareSong,
    setIsConfirmClearOpen,
    manualSync,
    handlePlayTrack,
    handlePlayPause,
    isShuffled,
    toggleShuffle,
    loopAll,
    toggleLoopAll,
    loopCurrent,
    toggleLoopCurrent,
    showLyrics,
    toggleLyrics,
    toggleFullScreen,
    handleRefreshLyrics,
    setIsSyncModeOpen,
    handleToggleCoverFlow,
    handleStartListenSession,
    setIsJoinListenDialogOpen,
    setIsListenInviteOpen,
    handleLeaveListenSession,
    isListenSessionHost,
  } = logic;

  const { username, isAuthenticated } = useChatsStore(
    useShallow((s) => ({ username: s.username, isAuthenticated: s.isAuthenticated }))
  );
  const auth = useMemo(
    () => (username && isAuthenticated ? { username, isAuthenticated } : undefined),
    [username, isAuthenticated]
  );

  const showEmptyLibrary = tracks.length === 0 && !logic.currentTrack;

  const displayModeOptions = useMemo(
    () => [
      { value: DisplayMode.Video, label: t("apps.ipod.menu.displayVideo") },
      { value: DisplayMode.Mesh, label: t("apps.ipod.menu.displayGradient") },
      { value: DisplayMode.Water, label: t("apps.ipod.menu.displayWater") },
      { value: DisplayMode.Shader, label: t("apps.ipod.menu.displayShader") },
      { value: DisplayMode.Landscapes, label: t("apps.ipod.menu.displayLandscapes") },
      { value: DisplayMode.Cover, label: t("apps.ipod.menu.displayCover") },
    ],
    [t]
  );

  const handleDisplayModeSelect = useCallback(
    (value: DisplayMode) => {
      setDisplayMode(value);
      const labels: Record<DisplayMode, string> = {
        [DisplayMode.Video]: t("apps.ipod.menu.displayVideo"),
        [DisplayMode.Cover]: t("apps.ipod.menu.displayCover"),
        [DisplayMode.Landscapes]: t("apps.ipod.menu.displayLandscapes"),
        [DisplayMode.Shader]: t("apps.ipod.menu.displayShader"),
        [DisplayMode.Mesh]: t("apps.ipod.menu.displayGradient"),
        [DisplayMode.Water]: t("apps.ipod.menu.displayWater"),
      };
      const label = labels[value] ?? value;
      showStatus(`${t("apps.ipod.menu.display", "Display")}: ${label}`);
    },
    [setDisplayMode, showStatus, t]
  );

  const handleOpenCoverFlowFromTitleCard = useCallback(() => {
    if (tracks.length === 0) return;
    userHasInteractedRef.current = true;
    restartAutoHideTimer();
    setIsCoverFlowOpen(true);
  }, [restartAutoHideTimer, setIsCoverFlowOpen, tracks.length, userHasInteractedRef]);

  const handleFullscreenLyricsSwipeUp = useCallback(() => {
    if (isOffline) {
      showOfflineStatus();
    } else {
      handleNext();
      if (!isListenSessionRemoteOnly) {
        setTimeout(() => {
          const newIndex = (currentIndex + 1) % tracks.length;
          const newTrack = tracks[newIndex];
          if (newTrack) {
            const artistInfo = newTrack.artist ? ` - ${newTrack.artist}` : "";
            showStatus(`⏭ ${newTrack.title}${artistInfo}`);
          }
        }, 150);
      }
    }
  }, [
    currentIndex,
    handleNext,
    isListenSessionRemoteOnly,
    isOffline,
    showOfflineStatus,
    showStatus,
    tracks,
  ]);

  const handleFullscreenLyricsSwipeDown = useCallback(() => {
    if (isOffline) {
      showOfflineStatus();
    } else {
      handlePrevious();
      if (!isListenSessionRemoteOnly) {
        setTimeout(() => {
          const newIndex = currentIndex === 0 ? tracks.length - 1 : currentIndex - 1;
          const newTrack = tracks[newIndex];
          if (newTrack) {
            const artistInfo = newTrack.artist ? ` - ${newTrack.artist}` : "";
            showStatus(`⏮ ${newTrack.title}${artistInfo}`);
          }
        }, 150);
      }
    }
  }, [
    currentIndex,
    handlePrevious,
    isListenSessionRemoteOnly,
    isOffline,
    showOfflineStatus,
    showStatus,
    tracks.length,
    tracks,
  ]);

  const menuBar = (
    <KaraokeMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onAddSong={handleAddSong}
      onShareSong={handleShareSong}
      onClearLibrary={() => setIsConfirmClearOpen(true)}
      onSyncLibrary={manualSync}
      onPlayTrack={handlePlayTrack}
      onTogglePlay={handlePlayPause}
      onPreviousTrack={handlePrevious}
      onNextTrack={handleNext}
      isPlaying={isPlaying}
      isShuffled={isShuffled}
      onToggleShuffle={toggleShuffle}
      loopAll={loopAll}
      onToggleLoopAll={toggleLoopAll}
      loopCurrent={loopCurrent}
      onToggleLoopCurrent={toggleLoopCurrent}
      showLyrics={showLyrics}
      onToggleLyrics={toggleLyrics}
      onToggleFullScreen={toggleFullScreen}
      onRefreshLyrics={handleRefreshLyrics}
      onAdjustTiming={() => setIsSyncModeOpen(true)}
      tracks={tracks}
      currentIndex={currentIndex}
      onToggleCoverFlow={handleToggleCoverFlow}
      onStartListenSession={handleStartListenSession}
      onJoinListenSession={() => setIsJoinListenDialogOpen(true)}
      onShareListenSession={() => setIsListenInviteOpen(true)}
      onLeaveListenSession={handleLeaveListenSession}
      isInListenSession={!!listenSession}
      isListenSessionHost={isListenSessionHost}
    />
  );

  const shouldAnimateVisuals =
    isPlaying && (isForeground ?? true) && !isListenSessionRemoteOnly;

  const effectiveDisplayMode = isListenSessionRemoteOnly
    ? DisplayMode.Cover
    : displayMode;
  const visualBackgroundActive =
    shouldAnimateVisuals && effectiveDisplayMode !== DisplayMode.Video;

  return {
    ...logic,
    auth,
    showEmptyLibrary,
    displayModeOptions,
    handleDisplayModeSelect,
    handleOpenCoverFlowFromTitleCard,
    handleFullscreenLyricsSwipeUp,
    handleFullscreenLyricsSwipeDown,
    menuBar,
    shouldAnimateVisuals,
    effectiveDisplayMode,
    visualBackgroundActive,
  };
}

export type KaraokeAppController = ReturnType<typeof useKaraokeAppController>;
