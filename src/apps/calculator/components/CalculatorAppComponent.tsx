import { AppWindowShell } from "@/components/shared/AppWindowShell";
import { AppHelpAboutDialogs } from "@/components/shared/AppHelpAboutDialogs";
import { AppProps } from "@/apps/base/types";
import { getTranslatedAppName } from "@/utils/i18n";
import { appMetadata } from "..";
import { calculatorStyles } from "../utils/calculatorStyles";
import { getCalculatorWindowSize } from "../utils/windowSizes";
import { CalculatorBody } from "./CalculatorBody";
import { CalculatorMenuBar } from "./CalculatorMenuBar";
import { CalculatorTitlebarModeControl } from "./CalculatorTitlebarModeControl";
import { useCalculatorLogic } from "../hooks/useCalculatorLogic";

export function CalculatorAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps) {
  const logic = useCalculatorLogic({ instanceId, isWindowOpen, isForeground });
  const {
    translatedHelpItems,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isWindowsTheme,
    isMacTheme,
    calculatorTheme,
    mode,
    setMode,
    pressClear,
    speechEnabled,
    setSpeechEnabled,
    speakButtonPresses,
    setSpeakButtonPresses,
    speakResults,
    setSpeakResults,
  } = logic;

  const size = getCalculatorWindowSize(mode, calculatorTheme);

  const modeControl = (
    <CalculatorTitlebarModeControl
      mode={mode}
      onSetMode={setMode}
      isForeground={isForeground ?? false}
      isBrushedMetal={isMacTheme}
    />
  );

  const menuBar = (
    <CalculatorMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      mode={mode}
      onSetMode={setMode}
      onClear={pressClear}
      speechEnabled={speechEnabled}
      onSpeechEnabledChange={setSpeechEnabled}
      speakButtonPresses={speakButtonPresses}
      onSpeakButtonPressesChange={setSpeakButtonPresses}
      speakResults={speakResults}
      onSpeakResultsChange={setSpeakResults}
    />
  );

  return (
    <AppWindowShell
      isWindowOpen={isWindowOpen}
      isWindowsTheme={isWindowsTheme}
      isForeground={isForeground}
      menuBar={menuBar}
      leading={<style>{calculatorStyles}</style>}
      trailing={
        <AppHelpAboutDialogs
          appId="calculator"
          metadata={appMetadata}
          helpItems={translatedHelpItems}
          isHelpOpen={isHelpDialogOpen}
          onHelpOpenChange={setIsHelpDialogOpen}
          isAboutOpen={isAboutDialogOpen}
          onAboutOpenChange={setIsAboutDialogOpen}
        />
      }
      windowFrameProps={{
        title: getTranslatedAppName("calculator"),
        onClose,
        isForeground,
        appId: "calculator",
        material: isMacTheme ? "brushedmetal" : "default",
        skipInitialSound,
        instanceId,
        onNavigateNext,
        onNavigatePrevious,
        windowConstraints: {
          minWidth: size.width,
          maxWidth: size.width,
          minHeight: size.height,
          maxHeight: size.height,
        },
        titleBarRightContent: modeControl,
      }}
    >
      <CalculatorBody logic={logic} />
    </AppWindowShell>
  );
}
