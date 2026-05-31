import type { AppProps, KaraokeInitialData } from "@/apps/base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { getTranslatedAppName } from "@/utils/i18n";
import { KaraokeAppDialogs } from "./KaraokeAppDialogs";
import { KaraokeFullscreenView } from "./KaraokeFullscreenView";
import { KaraokeWindowContent } from "./KaraokeWindowContent";
import { useKaraokeAppController } from "./useKaraokeAppController";

export function KaraokeAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  initialData,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps<KaraokeInitialData>) {
  const c = useKaraokeAppController({
    isWindowOpen,
    onClose,
    isForeground,
    initialData,
    instanceId,
  });

  const {
    isXpTheme,
    menuBar,
    currentTrack,
    toggleFullScreen,
    handleToggleCoverFlow,
    isCoverFlowOpen,
  } = c;

  if (!isWindowOpen) return null;

  const windowTitle = currentTrack
    ? `${currentTrack.title}${currentTrack.artist ? ` - ${currentTrack.artist}` : ""}`
    : getTranslatedAppName("karaoke");

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={windowTitle}
        onClose={onClose}
        isForeground={isForeground}
        appId="karaoke"
        material="notitlebar"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
        onFullscreenToggle={toggleFullScreen}
        onCoverFlowToggle={handleToggleCoverFlow}
        isCoverFlowActive={isCoverFlowOpen}
      >
        <KaraokeWindowContent c={c} />
        <KaraokeAppDialogs c={c} />
      </WindowFrame>
      <KaraokeFullscreenView c={c} isForeground={isForeground} />
    </>
  );
}
