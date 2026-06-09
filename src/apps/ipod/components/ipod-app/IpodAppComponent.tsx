import type { AppProps, IpodInitialData } from "@/apps/base/types";
import { AppWindowShell } from "@/components/shared/AppWindowShell";
import { getTranslatedAppName } from "@/utils/i18n";
import { IpodAppDialogs } from "./IpodAppDialogs";
import { IpodDeviceBody } from "./IpodDeviceBody";
import { IpodFullScreenView } from "./IpodFullScreenView";
import { IpodPipPlayer } from "./IpodPipPlayer";
import { useIpodAppController } from "./useIpodAppController";

export function IpodAppComponent({
  isWindowOpen,
  onClose: _onClose,
  isForeground,
  skipInitialSound,
  initialData,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps<IpodInitialData>) {
  const c = useIpodAppController({
    isWindowOpen,
    isForeground,
    initialData,
    instanceId,
  });

  const {
    isXpTheme,
    isMacOSTheme,
    menuBar,
    handleClose,
    toggleFullScreen,
    isCoverFlowOpen,
    setIsCoverFlowOpen,
  } = c;

  return (
    <AppWindowShell
      isWindowOpen={isWindowOpen}
      isXpTheme={isXpTheme}
      isForeground={isForeground}
      menuBar={menuBar}
      windowFrameProps={{
        title: getTranslatedAppName("ipod"),
        onClose: handleClose,
        isForeground,
        appId: "ipod",
        interceptClose: true,
        material: isMacOSTheme ? "brushedmetal" : "default",
        skipInitialSound,
        instanceId,
        onNavigateNext,
        onNavigatePrevious,
        keepMountedWhenMinimized: true,
        onFullscreenToggle: toggleFullScreen,
        onCoverFlowToggle: () => setIsCoverFlowOpen(!isCoverFlowOpen),
        isCoverFlowActive: isCoverFlowOpen,
      }}
      trailing={<IpodPipPlayer c={c} />}
    >
      <IpodDeviceBody c={c} />
      <IpodFullScreenView c={c} />
      <IpodAppDialogs c={c} />
    </AppWindowShell>
  );
}
