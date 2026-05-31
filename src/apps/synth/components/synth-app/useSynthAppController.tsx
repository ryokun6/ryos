import { useMemo } from "react";
import type { AppProps } from "@/apps/base/types";
import { SynthMenuBar } from "../SynthMenuBar";
import { useSynthLogic } from "../../hooks/useSynthLogic";

export type UseSynthAppControllerArgs = Pick<
  AppProps,
  "isWindowOpen" | "isForeground" | "onClose"
>;

export function useSynthAppController({
  isWindowOpen,
  isForeground,
  onClose,
}: UseSynthAppControllerArgs) {
  const logic = useSynthLogic({ isWindowOpen, isForeground });

  const {
    addPreset,
    setIsHelpOpen,
    setIsAboutOpen,
    resetSynth,
    presets,
    currentPreset,
    loadPresetById,
    labelType,
    setLabelType,
  } = logic;

  const menuBar = useMemo(
    () => (
      <SynthMenuBar
        onAddPreset={addPreset}
        onShowHelp={() => setIsHelpOpen(true)}
        onShowAbout={() => setIsAboutOpen(true)}
        onReset={resetSynth}
        onClose={onClose}
        presets={presets}
        currentPresetId={currentPreset.id}
        onLoadPresetById={loadPresetById}
        labelType={labelType}
        onLabelTypeChange={setLabelType}
      />
    ),
    [
      addPreset,
      setIsHelpOpen,
      setIsAboutOpen,
      resetSynth,
      onClose,
      presets,
      currentPreset.id,
      loadPresetById,
      labelType,
      setLabelType,
    ]
  );

  return { ...logic, menuBar };
}

export type SynthAppController = ReturnType<typeof useSynthAppController>;
