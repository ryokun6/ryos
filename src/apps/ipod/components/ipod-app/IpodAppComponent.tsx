import type { AppProps, IpodInitialData } from "@/apps/base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
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
    menuBar,
    handleClose,
    toggleFullScreen,
    isCoverFlowOpen,
    setIsCoverFlowOpen,
  } = c;

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={getTranslatedAppName("ipod")}
        onClose={handleClose}
        isForeground={isForeground}
        appId="ipod"
        interceptClose
        material="transparent"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
        keepMountedWhenMinimized
        onFullscreenToggle={toggleFullScreen}
        onCoverFlowToggle={() => setIsCoverFlowOpen(!isCoverFlowOpen)}
        isCoverFlowActive={isCoverFlowOpen}
      >
        <IpodDeviceBody c={c} />
        <IpodFullScreenView c={c} />
        <IpodAppDialogs c={c} />
      </WindowFrame>
      <IpodPipPlayer c={c} />
    </>
  );
}
