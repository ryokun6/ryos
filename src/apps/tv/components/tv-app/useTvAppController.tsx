import { useCallback, useMemo, useRef } from "react";
import type { AppProps } from "@/apps/base/types";
import { useTvSoundFx } from "../../hooks/useTvSoundFx";
import { useTvLogic } from "../../hooks/useTvLogic";
import { useTvStore } from "@/stores/useTvStore";
import { isMobileSafari } from "@/utils/device";
import { useTvAppLocalState } from "./useTvAppLocalState";
import { useTvTogglePlay } from "./useTvTogglePlay";
import { useTvChannelActions } from "./useTvChannelActions";
import { useTvCrtPlaybackEffects } from "./useTvCrtPlaybackEffects";
import { useTvWindowClose } from "./useTvWindowClose";
import { useTvAppChrome } from "./useTvAppChrome";
import { useTvMenuBar } from "./useTvMenuBar";

export type UseTvAppControllerArgs = Pick<
  AppProps,
  "isWindowOpen" | "onClose" | "isForeground" | "skipInitialSound" | "instanceId"
>;

export function useTvAppController({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
}: UseTvAppControllerArgs) {
  const {
    t,
    translatedHelpItems,
    isWindowsTheme,
    isMacOSTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isFullScreen,
    toggleFullScreen,
    isPlaying,
    setIsPlaying,
    togglePlay,
    currentChannel,
    currentVideo,
    currentChannelId,
    setChannelById,
    nextChannel,
    prevChannel,
    nextVideo,
    prevVideo,
    handleVideoEnd,
    handleError,
    selectVideoFromPlaylist,
    playlistRemoveVideo,
    playerRef,
    fullScreenPlayerRef,
    masterVolume,
    handleProgress,
    handleDuration,
    handleSeek,
    channels,
    showStatus,
    statusMessage,
    animationDirection,
    scheduleNowTitle,
    scheduleNextTitle,
    videoIndex,
  } = useTvLogic({ isWindowOpen, isForeground });

  // NOTE: All hooks must be called unconditionally on every render. The
  // early `return null` for a closed window happens AFTER the local hooks
  // below — moving the return above them violates the Rules of Hooks and
  // crashes on close (mismatched hook count between renders).
  const isMobileSafariDevice = useRef(isMobileSafari()).current;

  const {
    localState,
    dispatchLocal,
    setLcdSlot,
    setIsCreateChannelOpen,
    setPendingDeleteId,
    setIsResetConfirmOpen,
    setIsDrawerOpen,
    setIsYoutubePasteLoading,
    setPowerOnKey,
    setChannelSwitchKey,
    setPoweringOff,
    setIsBuffering,
    setScreenOff,
    setIsTransitioningCc,
  } = useTvAppLocalState(isMobileSafariDevice);

  const {
    lcdSlot,
    scheduleAnimDirection,
    isCreateChannelOpen,
    pendingDeleteId,
    isResetConfirmOpen,
    isDrawerOpen,
    isYoutubePasteLoading,
    powerOnKey,
    channelSwitchKey,
    poweringOff,
    isBuffering,
    screenOff,
    isTransitioningCc,
  } = localState;

  const {
    playPowerOn,
    playPowerOff,
    playChannelSwitch,
    startStatic,
    stopStatic,
  } = useTvSoundFx();

  const handleTogglePlay = useTvTogglePlay({
    isPlaying,
    togglePlay,
    playerRef,
    fullScreenPlayerRef,
  });

  const lcdFilterOn = useTvStore((s) => s.lcdFilterOn);
  const toggleLcdFilter = useTvStore((s) => s.toggleLcdFilter);
  const closedCaptionsOn = useTvStore((s) => s.closedCaptionsOn);
  const toggleClosedCaptions = useTvStore((s) => s.toggleClosedCaptions);

  const {
    customChannels,
    removeChannel,
    resetChannels,
    ensureLoggedIn,
    handleInlinePromptSubmit: handleInlinePromptSubmitWithLoading,
    handleImportChannels,
    handleExportChannels,
    hasResettableChannelChanges,
    isCreatingChannel,
    isUsernameDialogOpen,
    setIsUsernameDialogOpen,
    newUsername,
    setNewUsername,
    newPassword,
    setNewPassword,
    isSettingUsername,
    usernameError,
    submitUsernameDialog,
    isVerifyDialogOpen,
    setVerifyDialogOpen,
    verifyPasswordInput,
    setVerifyPasswordInput,
    verifyUsernameInput,
    setVerifyUsernameInput,
    isVerifyingToken,
    verifyError,
    handleVerifyTokenSubmit,
    promptSetUsername,
  } = useTvChannelActions({ t, currentChannelId, setChannelById });

  const handleInlinePromptSubmit = useCallback(
    (description: string) =>
      handleInlinePromptSubmitWithLoading(description, setIsYoutubePasteLoading),
    [handleInlinePromptSubmitWithLoading, setIsYoutubePasteLoading]
  );

  const pendingDeleteChannel = useMemo(
    () =>
      pendingDeleteId
        ? channels.find((c) => c.id === pendingDeleteId) ?? null
        : null,
    [pendingDeleteId, channels]
  );

  const hasUrl = Boolean(currentVideo?.url);
  const staticBedActive =
    (isBuffering || (!hasUrl && isPlaying)) &&
    !poweringOff &&
    !screenOff &&
    !isFullScreen;

  useTvCrtPlaybackEffects({
    currentChannelId,
    currentVideoId: currentVideo?.id,
    setLcdSlot,
    isWindowOpen,
    skipInitialSound,
    isMobileSafariDevice,
    setPowerOnKey,
    setPoweringOff,
    setChannelSwitchKey,
    setIsBuffering,
    setIsTransitioningCc,
    setScreenOff,
    isFullScreen,
    playPowerOn,
    playPowerOff,
    playChannelSwitch,
    startStatic,
    stopStatic,
    isPlaying,
    isBuffering,
    poweringOff,
    screenOff,
    staticBedActive,
    scheduleNextTitle,
    dispatchLocal,
  });

  const { handleInterceptedClose, handlePowerOffComplete } = useTvWindowClose({
    instanceId,
    onClose,
    poweringOff,
    screenOff,
    stopStatic,
    playPowerOff,
    setPoweringOff,
  });

  const { windowTitle, channelBugOverlay } = useTvAppChrome({
    t,
    currentChannel,
    currentChannelId,
    screenOff,
    poweringOff,
  });

  const { menuBar, toggleDrawer } = useTvMenuBar({
    onClose,
    customChannels,
    setIsHelpDialogOpen,
    setIsAboutDialogOpen,
    channels,
    hasResettableChannelChanges,
    currentChannelId,
    setChannelById,
    ensureLoggedIn,
    setIsCreateChannelOpen,
    setPendingDeleteId,
    handleImportChannels,
    handleExportChannels,
    setIsResetConfirmOpen,
    lcdFilterOn,
    toggleLcdFilter,
    closedCaptionsOn,
    toggleClosedCaptions,
    isDrawerOpen,
    setIsDrawerOpen,
    isPlaying,
    handleTogglePlay,
    nextVideo,
    prevVideo,
    nextChannel,
    prevChannel,
    toggleFullScreen,
  });

  return {
    isWindowOpen,
    onClose,
    isForeground,
    instanceId,
    skipInitialSound,
    t,
    translatedHelpItems,
    isWindowsTheme,
    isMacOSTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isFullScreen,
    toggleFullScreen,
    isPlaying,
    setIsPlaying,
    togglePlay,
    currentChannel,
    currentVideo,
    currentChannelId,
    setChannelById,
    nextChannel,
    prevChannel,
    nextVideo,
    prevVideo,
    handleVideoEnd,
    handleError,
    selectVideoFromPlaylist,
    playlistRemoveVideo,
    playerRef,
    fullScreenPlayerRef,
    masterVolume,
    handleProgress,
    handleDuration,
    handleSeek,
    channels,
    statusMessage,
    animationDirection,
    scheduleNowTitle,
    scheduleNextTitle,
    videoIndex,
    lcdSlot,
    scheduleAnimDirection,
    isCreateChannelOpen,
    setIsCreateChannelOpen,
    pendingDeleteId,
    setPendingDeleteId,
    isResetConfirmOpen,
    setIsResetConfirmOpen,
    isDrawerOpen,
    setIsDrawerOpen,
    isYoutubePasteLoading,
    powerOnKey,
    channelSwitchKey,
    poweringOff,
    isBuffering,
    setIsBuffering,
    screenOff,
    isTransitioningCc,
    handleTogglePlay,
    showStatus,
    customChannels,
    toggleDrawer,
    isCreatingChannel,
    isUsernameDialogOpen,
    setIsUsernameDialogOpen,
    newUsername,
    setNewUsername,
    newPassword,
    setNewPassword,
    isSettingUsername,
    usernameError,
    submitUsernameDialog,
    isVerifyDialogOpen,
    setVerifyDialogOpen,
    verifyPasswordInput,
    setVerifyPasswordInput,
    verifyUsernameInput,
    setVerifyUsernameInput,
    isVerifyingToken,
    verifyError,
    handleVerifyTokenSubmit,
    promptSetUsername,
    handleInlinePromptSubmit,
    pendingDeleteChannel,
    hasResettableChannelChanges,
    handleImportChannels,
    handleExportChannels,
    menuBar,
    handleInterceptedClose,
    handlePowerOffComplete,
    windowTitle,
    channelBugOverlay,
    lcdFilterOn,
    toggleLcdFilter,
    closedCaptionsOn,
    toggleClosedCaptions,
    ensureLoggedIn,
    removeChannel,
    resetChannels,
  };
}

export type TvAppController = ReturnType<typeof useTvAppController>;
