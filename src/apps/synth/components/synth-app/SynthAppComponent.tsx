import type { AppProps } from "@/apps/base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
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

  const { isXpTheme, isMacOSTheme, menuBar } = c;

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={getTranslatedAppName("synth")}
        onClose={onClose}
        isForeground={isForeground}
        appId="synth"
        material={isMacOSTheme ? "brushedmetal" : "default"}
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        <SynthWindowContent c={c} />
      </WindowFrame>

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
    </>
  );
}
