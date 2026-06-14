import { useCallback } from "react";
import type { AppProps, IpodInitialData } from "@/apps/base/types";
import {
  selectEffectiveIpodVolume,
  useAudioSettingsStore,
} from "@/stores/useAudioSettingsStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { DisplayMode } from "@/types/lyrics";
import {
  useDisplayModeOptions,
  useDisplayModeSelect,
} from "@/hooks/useDisplayModeMenu";
import { IpodMenuBar } from "../ipod-menu-bar/IpodMenuBar";
import { useIpodLogic } from "../../hooks/useIpodLogic";

export type UseIpodAppControllerArgs = Pick<
  AppProps<IpodInitialData>,
  "isWindowOpen" | "isForeground" | "initialData" | "instanceId"
>;

export function useIpodAppController({
  isWindowOpen,
  isForeground,
  initialData,
  instanceId,
}: UseIpodAppControllerArgs) {
  const logic = useIpodLogic({ isWindowOpen, isForeground, initialData, instanceId });

  const {
    t,
    displayMode,
    isAppleMusic,
    showStatus,
    setDisplayMode,
    setIsHelpDialogOpen,
    setIsAboutDialogOpen,
    setIsConfirmClearOpen,
    manualSync,
    handleAddSong,
    handleShareSong,
    handleAppleMusicAddToFavorites,
    handleRefreshLyrics,
    setIsSyncModeOpen,
    isCoverFlowOpen,
    setIsCoverFlowOpen,
    appleMusicAuthorized,
    musicKitStatus,
    handleSwitchToAppleMusic,
    handleSwitchToYoutube,
    handleAppleMusicSignIn,
    handleAppleMusicSignOut,
    handleAppleMusicRefresh,
    pauseBeforeWindowClose,
    isPlaying,
  } = logic;

  const setAppleMusicKitNowPlaying = useIpodStore(
    (s) => s.setAppleMusicKitNowPlaying
  );
  const uiVariant = useIpodStore((s) => s.uiVariant);
  const isModernIpodUi = uiVariant === "modern";
  const finalIpodVolume = useAudioSettingsStore(selectEffectiveIpodVolume);

  const handleClose = useCallback(() => {
    pauseBeforeWindowClose();
    window.dispatchEvent(new Event(`closeWindow-${instanceId || "ipod"}`));
  }, [instanceId, pauseBeforeWindowClose]);

  const effectiveDisplayMode =
    isAppleMusic && displayMode === DisplayMode.Video
      ? DisplayMode.Cover
      : displayMode;

  const displayModeOptions = useDisplayModeOptions(t, {
    hideVideoOption: isAppleMusic,
  });

  const handleDisplayModeSelect = useDisplayModeSelect({
    t,
    setDisplayMode,
    showStatus,
    coerceVideoToCover: isAppleMusic,
  });

  const menuBar = (
    <IpodMenuBar
      onClose={handleClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onClearLibrary={() => setIsConfirmClearOpen(true)}
      onSyncLibrary={manualSync}
      onAddSong={handleAddSong}
      onShareSong={handleShareSong}
      onAddToFavorites={handleAppleMusicAddToFavorites}
      onRefreshLyrics={handleRefreshLyrics}
      onAdjustTiming={() => setIsSyncModeOpen(true)}
      onToggleCoverFlow={() => setIsCoverFlowOpen(!isCoverFlowOpen)}
      appleMusicAuthorized={appleMusicAuthorized}
      musicKitConfigured={musicKitStatus !== "missing-token"}
      onSwitchLibrary={(source) => {
        if (source === "appleMusic") {
          handleSwitchToAppleMusic();
        } else {
          handleSwitchToYoutube();
        }
      }}
      onAppleMusicSignIn={handleAppleMusicSignIn}
      onAppleMusicSignOut={handleAppleMusicSignOut}
      onAppleMusicRefresh={handleAppleMusicRefresh}
    />
  );

  const shouldAnimateFullScreenVisuals = isPlaying && (isForeground ?? true);
  const shouldRenderFullScreenAnimatedVisuals =
    shouldAnimateFullScreenVisuals && effectiveDisplayMode !== DisplayMode.Video;

  return {
    ...logic,
    instanceId,
    setAppleMusicKitNowPlaying,
    isModernIpodUi,
    finalIpodVolume,
    handleClose,
    effectiveDisplayMode,
    displayModeOptions,
    handleDisplayModeSelect,
    menuBar,
    shouldAnimateFullScreenVisuals,
    shouldRenderFullScreenAnimatedVisuals,
  };
}

export type IpodAppController = ReturnType<typeof useIpodAppController>;
