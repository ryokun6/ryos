import { useCallback, useMemo } from "react";
import type { AppProps, IpodInitialData } from "@/apps/base/types";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { useIpodStore } from "@/stores/useIpodStore";
import { DisplayMode } from "@/types/lyrics";
import { IpodMenuBar } from "../IpodMenuBar";
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
    ipodVolume,
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
  const masterVolume = useAudioSettingsStore((s) => s.masterVolume);
  const finalIpodVolume = ipodVolume * masterVolume;

  const handleClose = useCallback(() => {
    pauseBeforeWindowClose();
    window.dispatchEvent(new Event(`closeWindow-${instanceId || "ipod"}`));
  }, [instanceId, pauseBeforeWindowClose]);

  const effectiveDisplayMode =
    isAppleMusic && displayMode === DisplayMode.Video
      ? DisplayMode.Cover
      : displayMode;

  const displayModeOptions = useMemo(
    () => {
      const options = [
        { value: DisplayMode.Video, label: t("apps.ipod.menu.displayVideo") },
        { value: DisplayMode.Mesh, label: t("apps.ipod.menu.displayGradient") },
        { value: DisplayMode.Water, label: t("apps.ipod.menu.displayWater") },
        { value: DisplayMode.Shader, label: t("apps.ipod.menu.displayShader") },
        {
          value: DisplayMode.Landscapes,
          label: t("apps.ipod.menu.displayLandscapes"),
        },
        { value: DisplayMode.Cover, label: t("apps.ipod.menu.displayCover") },
      ];

      return isAppleMusic
        ? options.filter((option) => option.value !== DisplayMode.Video)
        : options;
    },
    [isAppleMusic, t]
  );

  const handleDisplayModeSelect = useCallback(
    (value: DisplayMode) => {
      const nextMode =
        isAppleMusic && value === DisplayMode.Video ? DisplayMode.Cover : value;
      setDisplayMode(nextMode);
      const labels: Record<DisplayMode, string> = {
        [DisplayMode.Video]: t("apps.ipod.menu.displayVideo"),
        [DisplayMode.Cover]: t("apps.ipod.menu.displayCover"),
        [DisplayMode.Landscapes]: t("apps.ipod.menu.displayLandscapes"),
        [DisplayMode.Shader]: t("apps.ipod.menu.displayShader"),
        [DisplayMode.Mesh]: t("apps.ipod.menu.displayGradient"),
        [DisplayMode.Water]: t("apps.ipod.menu.displayWater"),
      };
      const label = labels[nextMode] ?? nextMode;
      showStatus(`${t("apps.ipod.menu.display", "Display")}: ${label}`);
    },
    [isAppleMusic, setDisplayMode, showStatus, t]
  );

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
