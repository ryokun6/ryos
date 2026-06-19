import type { AppProps, KaraokeInitialData } from "@/apps/base/types";
import { AppWindowShell } from "@/components/shared/AppWindowShell";
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
    isWindowsTheme,
    menuBar,
    currentTrack,
    toggleFullScreen,
    handleToggleCoverFlow,
    isCoverFlowOpen,
  } = c;

  const windowTitle = currentTrack
    ? `${currentTrack.title}${currentTrack.artist ? ` - ${currentTrack.artist}` : ""}`
    : getTranslatedAppName("karaoke");

  return (
    <AppWindowShell
      isWindowOpen={isWindowOpen}
      isWindowsTheme={isWindowsTheme}
      isForeground={isForeground}
      menuBar={menuBar}
      windowFrameProps={{
        title: windowTitle,
        onClose,
        isForeground,
        appId: "karaoke",
        material: "notitlebar",
        skipInitialSound,
        instanceId,
        onNavigateNext,
        onNavigatePrevious,
        keepMountedWhenMinimized: true,
        onFullscreenToggle: toggleFullScreen,
        onCoverFlowToggle: handleToggleCoverFlow,
        isCoverFlowActive: isCoverFlowOpen,
      }}
      trailing={<KaraokeFullscreenView c={c} isForeground={isForeground} />}
    >
      <KaraokeWindowContent c={c} />
      <KaraokeAppDialogs c={c} />
    </AppWindowShell>
  );
}
