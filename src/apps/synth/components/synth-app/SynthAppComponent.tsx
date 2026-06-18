import type { AppProps } from "@/apps/base/types";
import { AppWindowShell } from "@/components/shared/AppWindowShell";
import { getTranslatedAppName } from "@/utils/i18n";
import { SynthAppDialogs } from "./SynthAppDialogs";
import { SynthWindowContent } from "./SynthWindowContent";
import { useSynthAppController } from "./useSynthAppController";

export function SynthAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps) {
  const c = useSynthAppController({
    isWindowOpen,
    isForeground,
    onClose,
  });

  const { isWindowsTheme, isMacOSTheme, menuBar } = c;

  return (
    <AppWindowShell
      isWindowOpen={isWindowOpen}
      isWindowsTheme={isWindowsTheme}
      isForeground={isForeground}
      menuBar={menuBar}
      windowFrameProps={{
        title: getTranslatedAppName("synth"),
        onClose,
        isForeground,
        appId: "synth",
        material: isMacOSTheme ? "brushedmetal" : "default",
        skipInitialSound,
        instanceId,
        onNavigateNext,
        onNavigatePrevious,
      }}
      trailing={
        <SynthAppDialogs
          t={c.t}
          translatedHelpItems={c.translatedHelpItems}
          isHelpOpen={c.isHelpOpen}
          setIsHelpOpen={c.setIsHelpOpen}
          isAboutOpen={c.isAboutOpen}
          setIsAboutOpen={c.setIsAboutOpen}
          isPresetDialogOpen={c.isPresetDialogOpen}
          setIsPresetDialogOpen={c.setIsPresetDialogOpen}
          isSavingNewPreset={c.isSavingNewPreset}
          presetName={c.presetName}
          setPresetName={c.setPresetName}
          savePreset={c.savePreset}
        />
      }
    >
      <SynthWindowContent c={c} />
    </AppWindowShell>
  );
}
