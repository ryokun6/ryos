import type { FC, PointerEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { AppProps } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { SynthMenuBar } from "./SynthMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { appMetadata } from "..";
import { NoteLabelType } from "@/stores/useSynthStore";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dial } from "@/components/ui/dial";
import { Waveform3D } from "./Waveform3D";
import { getTranslatedAppName } from "@/utils/i18n";
import { useSynthLogic } from "../hooks/useSynthLogic";

// Define oscillator type
type OscillatorType = "sine" | "square" | "triangle" | "sawtooth";

// Component to display status messages
const StatusDisplay: FC<{ message: string | null }> = ({ message }) => {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.2 }}
          className="absolute bottom-4 w-full text-center left-1/2 transform -translate-x-1/2 px-4 py-2 bg-black/80 backdrop-blur-sm text-[#ff00ff] text-[12px] font-geneva-12 z-10 select-none"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Piano key component (uses Pointer Events for unified mouse/touch handling)
const PianoKey: FC<{
  note: string;
  isBlack?: boolean;
  isPressed?: boolean;
  onPointerDownKey: (note: string, e: PointerEvent<HTMLButtonElement>) => void;
  onPointerEnterKey: (note: string, e: PointerEvent<HTMLButtonElement>) => void;
  onPointerUpKey: (note: string, e: PointerEvent<HTMLButtonElement>) => void;
  labelType: NoteLabelType;
  keyMap: Record<string, string>;
  isSystem7Theme?: boolean;
}> = ({
  note,
  isBlack = false,
  isPressed = false,
  onPointerDownKey,
  onPointerEnterKey,
  onPointerUpKey,
  labelType,
  keyMap,
  isSystem7Theme = false,
}) => {
  // Get the appropriate label based on labelType
  const getKeyLabel = () => {
    if (labelType === "off") return "";
    if (labelType === "key") {
      const keyboardKey = Object.entries(keyMap).find(
        ([, noteValue]) => noteValue === note
      )?.[0];
      return keyboardKey ? keyboardKey.toUpperCase() : "";
    }
    return note;
  };

  const label = getKeyLabel();

  return (
    <button
      type="button"
      data-note={note}
      className={cn(
        "piano-key relative touch-none select-none outline-none transition-colors duration-100",
        isSystem7Theme && "system7-square",
        isBlack
          ? cn(
              "absolute top-0 left-[65%] w-[74%] h-[70%] rounded-b-md z-10",
              isPressed ? "bg-[#ff33ff]" : "bg-black hover:bg-[#333333]"
            )
          : cn(
              "h-full w-full border border-[#333333] rounded-b-md",
              isPressed ? "bg-[#ff33ff]" : "bg-white hover:bg-[#f5f5f5]"
            )
      )}
      onPointerDown={(e) => onPointerDownKey(note, e)}
      onPointerEnter={(e) => onPointerEnterKey(note, e)}
      onPointerUp={(e) => onPointerUpKey(note, e)}
      onContextMenu={(e) => e.preventDefault()}
    >
      {label && (
        <span
          className={cn(
            "absolute bottom-2 left-1/2 transform -translate-x-1/2 text-[10px] pointer-events-none font-geneva-12 select-none",
            isBlack ? "text-white" : "text-black"
          )}
        >
          {label}
        </span>
      )}
    </button>
  );
};

// Main synth app component
export function SynthAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps) {
  const {
    t,
    translatedHelpItems,
    isHelpOpen,
    setIsHelpOpen,
    isAboutOpen,
    setIsAboutOpen,
    isPresetDialogOpen,
    setIsPresetDialogOpen,
    isSavingNewPreset,
    presetName,
    setPresetName,
    statusMessage,
    isControlsVisible,
    toggleControls,
    handleOctaveDown,
    handleOctaveUp,
    pressedNotes,
    keyToNoteMap,
    whiteKeys,
    blackKeys,
    visibleKeyCount,
    labelType,
    setLabelType,
    presets,
    currentPreset,
    handleOscillatorChange,
    handleEnvelopeChange,
    handleEffectChange,
    addPreset,
    savePreset,
    loadPreset,
    loadPresetById,
    resetSynth,
    handlePointerDown,
    handlePointerEnter,
    handlePointerUp,
    analyzerRef,
    appContainerRef,
    keyboardContainerRef,
    isXpTheme,
    isSystem7Theme,
    isClassicTheme,
    isMacOSTheme,
  } = useSynthLogic({ isWindowOpen, isForeground });

  const menuBar = (
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
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={getTranslatedAppName("synth")}
        onClose={onClose}
        isForeground={isForeground}
        appId="synth"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        <div
          ref={appContainerRef}
          className="flex flex-col h-full w-full bg-[#1a1a1a] text-white overflow-hidden select-none synth-force-font"
        >
          {/* Main content area */}
          <div className="flex flex-col flex-1 min-h-0 w-full overflow-hidden">
            {/* Presets section */}
            <div
              className={cn(
                "p-4 py-4 pb-3 bg-[#2a2a2a] w-full border-b border-[#3a3a3a] z-[50] relative",
                "os-toolbar-texture"
              )}
            >
              <div className="flex justify-between items-center">
                <div className="flex gap-0">
                  {/* Mobile preset selector */}
                  <div className="md:hidden w-48">
                    <Select
                      value={currentPreset.id}
                      onValueChange={loadPresetById}
                    >
                      <SelectTrigger
                        className={cn(
                          "w-full h-[22px] font-geneva-12 text-[12px] p-2",
                          isClassicTheme && "text-black bg-transparent",
                          !isClassicTheme &&
                            "bg-black border-[#3a3a3a] text-white"
                        )}
                      >
                        <SelectValue placeholder={t("apps.synth.selectPreset")} />
                      </SelectTrigger>
                      <SelectContent
                        className={cn(
                          isClassicTheme && "text-black",
                          !isClassicTheme &&
                            "bg-black border-[#3a3a3a] text-white"
                        )}
                      >
                        {presets.map((preset) => (
                          <SelectItem
                            key={preset.id}
                            value={preset.id}
                            className={cn(
                              "font-geneva-12 text-[12px] select-none",
                              isClassicTheme && "text-black"
                            )}
                          >
                            {preset.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Desktop preset buttons */}
                  <div className={cn("hidden md:flex gap-0", isMacOSTheme && "aqua-select-group")}>
                    {presets.length > 0 ? (
                      presets.map((preset) => (
                        <Button
                          key={preset.id}
                          variant={isMacOSTheme ? "aqua_select" : isSystem7Theme ? "player" : "default"}
                          data-state={
                            currentPreset.id === preset.id ? "on" : "off"
                          }
                          onClick={() => loadPreset(preset)}
                          className={cn(
                            "h-[22px] px-2 whitespace-nowrap uppercase select-none",
                            isXpTheme && "text-black"
                          )}
                        >
                          {preset.name}
                        </Button>
                      ))
                    ) : (
                      <p className="text-xs text-gray-400 font-geneva-12 select-none">
                        {t("apps.synth.noPresetsYet")}
                      </p>
                    )}
                  </div>
                </div>
                <div className={cn("flex gap-0", isMacOSTheme && "aqua-select-group")}>
                  <Button
                    variant={isMacOSTheme ? "aqua_select" : isSystem7Theme ? "player" : "default"}
                    onClick={handleOctaveDown}
                    className={cn(
                      isSystem7Theme ? "h-[22px] px-2" : isMacOSTheme ? "aqua-compact" : "h-[22px] px-2",
                      isXpTheme && "text-black",
                      "select-none"
                    )}
                  >
                    <CaretLeft weight="bold" className="h-3 w-3" />
                  </Button>
                  <Button
                    variant={isMacOSTheme ? "aqua_select" : isSystem7Theme ? "player" : "default"}
                    onClick={handleOctaveUp}
                    className={cn(
                      isSystem7Theme ? "h-[22px] px-2" : isMacOSTheme ? "aqua-compact" : "h-[22px] px-2",
                      isXpTheme && "text-black",
                      "select-none"
                    )}
                  >
                    <CaretRight weight="bold" className="h-3 w-3" />
                  </Button>
                  <Button
                    variant={isMacOSTheme ? "aqua_select" : isSystem7Theme ? "player" : "default"}
                    onClick={toggleControls}
                    className={cn(
                      isSystem7Theme
                        ? "h-[22px] px-2"
                        : isMacOSTheme
                        ? "aqua-compact font-geneva-12 !text-[11px]"
                        : "h-[22px] px-2",
                      isXpTheme && "text-black",
                      "select-none"
                    )}
                  >
                    {t("apps.synth.controls")}
                  </Button>
                </div>
              </div>
            </div>

            {/* Controls panel */}
            <div className="relative w-full">
              <AnimatePresence>
                {isControlsVisible && (
                  <motion.div
                    initial={{ y: -40, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -40, opacity: 0 }}
                    transition={{
                      type: "spring",
                      stiffness: 300,
                      damping: 25,
                      mass: 0.8,
                    }}
                    className="absolute top-0 inset-x-0 w-full bg-neutral-900/90 backdrop-blur-xl p-4 z-[40] select-none"
                  >
                    <div className="flex flex-col md:flex-row md:flex-wrap md:items-start gap-6">
                      <div className="md:min-w-[200px] md:flex-grow md:flex-1 md:flex-basis-0">
                        <div className="flex justify-between items-center mb-2">
                          <h3 className="font-semibold text-[#ff00ff] font-geneva-12 text-[10px] select-none">
                            {t("apps.synth.oscillator")}
                          </h3>
                          <Button
                            variant={isMacOSTheme ? "aqua_select" : isSystem7Theme ? "player" : "default"}
                            onClick={addPreset}
                            className={cn(
                              "h-[22px] px-2 text-[9px] select-none",
                              isXpTheme && "text-black"
                            )}
                          >
                            {t("apps.synth.addPreset")}
                          </Button>
                        </div>
                        <Select
                          value={currentPreset.oscillator.type}
                          onValueChange={(value: OscillatorType) =>
                            handleOscillatorChange(value)
                          }
                        >
                          <SelectTrigger
                            className={cn(
                              "w-full font-geneva-12 text-[12px] p-2",
                              isClassicTheme && "text-black",
                              !isClassicTheme &&
                                "bg-black border-[#3a3a3a] text-white"
                            )}
                          >
                            <SelectValue placeholder={t("apps.synth.waveform")} />
                          </SelectTrigger>
                          <SelectContent
                            className={cn(
                              isClassicTheme && "text-black",
                              !isClassicTheme &&
                                "bg-black border-[#3a3a3a] text-white"
                            )}
                          >
                            <SelectItem
                              value="sine"
                              className={cn(
                                "font-geneva-12 text-[12px]",
                                isClassicTheme && "text-black"
                              )}
                            >
                              {t("apps.synth.waveforms.sine")}
                            </SelectItem>
                            <SelectItem
                              value="square"
                              className={cn(
                                "font-geneva-12 text-[12px]",
                                isClassicTheme && "text-black"
                              )}
                            >
                              {t("apps.synth.waveforms.square")}
                            </SelectItem>
                            <SelectItem
                              value="triangle"
                              className={cn(
                                "font-geneva-12 text-[12px]",
                                isClassicTheme && "text-black"
                              )}
                            >
                              {t("apps.synth.waveforms.triangle")}
                            </SelectItem>
                            <SelectItem
                              value="sawtooth"
                              className={cn(
                                "font-geneva-12 text-[12px]",
                                isClassicTheme && "text-black"
                              )}
                            >
                              {t("apps.synth.waveforms.sawtooth")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <AnimatePresence>
                          {isControlsVisible && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                              className="hidden md:block w-full"
                            >
                              <div className="w-full">
                                <Waveform3D analyzer={analyzerRef.current} />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Mobile: Horizontal scrollable container for Envelope + Effects */}
                      <div className="md:hidden overflow-x-auto">
                        <div className="flex flex-nowrap gap-6 min-w-max pb-2">
                          <div>
                            <h3 className="font-semibold mb-2 text-[#ff00ff] font-geneva-12 text-[10px] select-none">
                              {t("apps.synth.envelope")}
                            </h3>
                            <div className="flex flex-nowrap gap-1">
                              <div className="w-16">
                                <Dial
                                  value={currentPreset.envelope.attack}
                                  min={0.01}
                                  max={2}
                                  step={0.01}
                                  onChange={(value) =>
                                    handleEnvelopeChange("attack", value)
                                  }
                                  label={t("apps.synth.envelopeParams.attack")}
                                  color="#ff00ff"
                                  size="sm"
                                />
                              </div>
                              <div className="w-16">
                                <Dial
                                  value={currentPreset.envelope.decay}
                                  min={0.01}
                                  max={2}
                                  step={0.01}
                                  onChange={(value) =>
                                    handleEnvelopeChange("decay", value)
                                  }
                                  label={t("apps.synth.envelopeParams.decay")}
                                  color="#ff00ff"
                                  size="sm"
                                />
                              </div>
                              <div className="w-16">
                                <Dial
                                  value={currentPreset.envelope.sustain}
                                  min={0}
                                  max={1}
                                  step={0.01}
                                  onChange={(value) =>
                                    handleEnvelopeChange("sustain", value)
                                  }
                                  label={t("apps.synth.envelopeParams.sustain")}
                                  color="#ff00ff"
                                  size="sm"
                                />
                              </div>
                              <div className="w-16">
                                <Dial
                                  value={currentPreset.envelope.release}
                                  min={0.1}
                                  max={4}
                                  step={0.1}
                                  onChange={(value) =>
                                    handleEnvelopeChange("release", value)
                                  }
                                  label={t("apps.synth.envelopeParams.release")}
                                  color="#ff00ff"
                                  size="sm"
                                />
                              </div>
                            </div>
                          </div>

                          <div>
                            <h3 className="font-semibold mb-2 text-[#ff00ff] font-geneva-12 text-[10px] select-none">
                              {t("apps.synth.effects")}
                            </h3>
                            <div className="flex flex-nowrap gap-1">
                              <div className="w-16">
                                <Dial
                                  value={currentPreset.effects.gain}
                                  min={0}
                                  max={1}
                                  step={0.01}
                                  onChange={(value) =>
                                    handleEffectChange("gain", value)
                                  }
                                  label={t("apps.synth.effectsParams.gain")}
                                  color="#ff00ff"
                                  size="sm"
                                />
                              </div>
                              <div className="w-16">
                                <Dial
                                  value={currentPreset.effects.reverb}
                                  min={0}
                                  max={1}
                                  step={0.01}
                                  onChange={(value) =>
                                    handleEffectChange("reverb", value)
                                  }
                                  label={t("apps.synth.effectsParams.reverb")}
                                  color="#ff00ff"
                                  size="sm"
                                />
                              </div>
                              <div className="w-16">
                                <Dial
                                  value={currentPreset.effects.delay}
                                  min={0}
                                  max={1}
                                  step={0.01}
                                  onChange={(value) =>
                                    handleEffectChange("delay", value)
                                  }
                                  label={t("apps.synth.effectsParams.delay")}
                                  color="#ff00ff"
                                  size="sm"
                                />
                              </div>
                              <div className="w-16">
                                <Dial
                                  value={currentPreset.effects.distortion}
                                  min={0}
                                  max={1}
                                  step={0.01}
                                  onChange={(value) =>
                                    handleEffectChange("distortion", value)
                                  }
                                  label={t("apps.synth.effectsParams.distortion")}
                                  color="#ff00ff"
                                  size="sm"
                                />
                              </div>
                              <div className="w-16">
                                <Dial
                                  value={currentPreset.effects.chorus ?? 0}
                                  min={0}
                                  max={1}
                                  step={0.01}
                                  onChange={(value) =>
                                    handleEffectChange("chorus", value)
                                  }
                                  label={t("apps.synth.effectsParams.chorus")}
                                  color="#ff00ff"
                                  size="sm"
                                />
                              </div>
                              <div className="w-16">
                                <Dial
                                  value={currentPreset.effects.phaser ?? 0}
                                  min={0}
                                  max={1}
                                  step={0.01}
                                  onChange={(value) =>
                                    handleEffectChange("phaser", value)
                                  }
                                  label={t("apps.synth.effectsParams.phaser")}
                                  color="#ff00ff"
                                  size="sm"
                                />
                              </div>
                              <div className="w-16">
                                <Dial
                                  value={currentPreset.effects.bitcrusher ?? 0}
                                  min={0}
                                  max={1}
                                  step={0.01}
                                  onChange={(value) =>
                                    handleEffectChange("bitcrusher", value)
                                  }
                                  label={t("apps.synth.effectsParams.bitcrusher")}
                                  color="#ff00ff"
                                  size="sm"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Desktop: Original separate sections */}
                      <div className="hidden md:block md:flex-grow-0 md:flex-shrink-0 md:w-[140px]">
                        <h3 className="font-semibold mb-2 text-[#ff00ff] font-geneva-12 text-[10px] select-none">
                          {t("apps.synth.envelope")}
                        </h3>
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-nowrap gap-2 py-0.5 overflow-x-auto">
                            <div className="w-16 flex-shrink-0">
                              <Dial
                                value={currentPreset.envelope.attack}
                                min={0.01}
                                max={2}
                                step={0.01}
                                onChange={(value) =>
                                  handleEnvelopeChange("attack", value)
                                }
                                label={t("apps.synth.envelopeParams.attack")}
                                color="#ff00ff"
                                size="sm"
                              />
                            </div>
                            <div className="w-16 flex-shrink-0">
                              <Dial
                                value={currentPreset.envelope.decay}
                                min={0.01}
                                max={2}
                                step={0.01}
                                onChange={(value) =>
                                  handleEnvelopeChange("decay", value)
                                }
                                label={t("apps.synth.envelopeParams.decay")}
                                color="#ff00ff"
                                size="sm"
                              />
                            </div>
                          </div>
                          <div className="flex flex-nowrap gap-2 py-0.5 overflow-x-auto">
                            <div className="w-16 flex-shrink-0">
                              <Dial
                                value={currentPreset.envelope.sustain}
                                min={0}
                                max={1}
                                step={0.01}
                                onChange={(value) =>
                                  handleEnvelopeChange("sustain", value)
                                }
                                label={t("apps.synth.envelopeParams.sustain")}
                                color="#ff00ff"
                                size="sm"
                              />
                            </div>
                            <div className="w-16 flex-shrink-0">
                              <Dial
                                value={currentPreset.envelope.release}
                                min={0.1}
                                max={4}
                                step={0.1}
                                onChange={(value) =>
                                  handleEnvelopeChange("release", value)
                                }
                                label={t("apps.synth.envelopeParams.release")}
                                color="#ff00ff"
                                size="sm"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="hidden md:block md:flex-shrink-0 md:w-[280px]">
                        <h3 className="font-semibold mb-2 text-[#ff00ff] font-geneva-12 text-[10px] select-none">
                          {t("apps.synth.effects")}
                        </h3>
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-nowrap gap-2 py-0.5 overflow-x-auto">
                            <div className="w-16 flex-shrink-0">
                              <Dial
                                value={currentPreset.effects.gain}
                                min={0}
                                max={1}
                                step={0.01}
                                onChange={(value) =>
                                  handleEffectChange("gain", value)
                                }
                                label={t("apps.synth.effectsParams.gain")}
                                color="#ff00ff"
                                size="sm"
                              />
                            </div>
                            <div className="w-16 flex-shrink-0">
                              <Dial
                                value={currentPreset.effects.reverb}
                                min={0}
                                max={1}
                                step={0.01}
                                onChange={(value) =>
                                  handleEffectChange("reverb", value)
                                }
                                label={t("apps.synth.effectsParams.reverb")}
                                color="#ff00ff"
                                size="sm"
                              />
                            </div>
                            <div className="w-16 flex-shrink-0">
                              <Dial
                                value={currentPreset.effects.delay}
                                min={0}
                                max={1}
                                step={0.01}
                                onChange={(value) =>
                                  handleEffectChange("delay", value)
                                }
                                label={t("apps.synth.effectsParams.delay")}
                                color="#ff00ff"
                                size="sm"
                              />
                            </div>
                            <div className="w-16 flex-shrink-0">
                              <Dial
                                value={currentPreset.effects.distortion}
                                min={0}
                                max={1}
                                step={0.01}
                                onChange={(value) =>
                                  handleEffectChange("distortion", value)
                                }
                                label={t("apps.synth.effectsParams.distortion")}
                                color="#ff00ff"
                                size="sm"
                              />
                            </div>
                          </div>
                          <div className="flex flex-nowrap gap-2 py-0.5 overflow-x-auto">
                            <div className="w-16 flex-shrink-0">
                              <Dial
                                value={currentPreset.effects.chorus ?? 0}
                                min={0}
                                max={1}
                                step={0.01}
                                onChange={(value) =>
                                  handleEffectChange("chorus", value)
                                }
                                label={t("apps.synth.effectsParams.chorus")}
                                color="#ff00ff"
                                size="sm"
                              />
                            </div>
                            <div className="w-16 flex-shrink-0">
                              <Dial
                                value={currentPreset.effects.phaser ?? 0}
                                min={0}
                                max={1}
                                step={0.01}
                                onChange={(value) =>
                                  handleEffectChange("phaser", value)
                                }
                                label={t("apps.synth.effectsParams.phaser")}
                                color="#ff00ff"
                                size="sm"
                              />
                            </div>
                            <div className="w-16 flex-shrink-0">
                              <Dial
                                value={currentPreset.effects.bitcrusher ?? 0}
                                min={0}
                                max={1}
                                step={0.01}
                                onChange={(value) =>
                                  handleEffectChange("bitcrusher", value)
                                }
                                label={t("apps.synth.effectsParams.bitcrusher")}
                                color="#ff00ff"
                                size="sm"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Keyboard - fixed at bottom */}
            <div className="flex-grow flex flex-col justify-end min-h-[160px] bg-black p-4 w-full">
              <div ref={keyboardContainerRef} className="relative h-full w-full">
                {/* Keyboard */}
                {/* White keys container */}
                <div className="absolute inset-0 h-full flex w-full">
                  {whiteKeys.map((note) => (
                    <div key={note} className="flex-1 relative">
                      <PianoKey
                        note={note}
                        isPressed={pressedNotes[note]}
                        onPointerDownKey={handlePointerDown}
                        onPointerEnterKey={handlePointerEnter}
                        onPointerUpKey={handlePointerUp}
                        labelType={labelType}
                        keyMap={keyToNoteMap}
                        isSystem7Theme={isSystem7Theme}
                      />
                    </div>
                  ))}
                </div>

                {/* Black keys container */}
                <div className="absolute inset-0 h-full w-full flex pointer-events-none">
                  {blackKeys.map((note, index) => {
                    // Only hide black keys at the end of the visible range
                    if (visibleKeyCount > 0 && index === blackKeys.length - 1) {
                      return (
                        <div
                          key={`empty-${index}`}
                          className="flex-1 relative"
                        />
                      );
                    }

                    return (
                      <div
                        key={note || `empty-${index}`}
                        className="flex-1 relative"
                      >
                        {note && (
                          <div className="pointer-events-auto w-full">
                            <PianoKey
                              note={note}
                              isBlack
                              isPressed={pressedNotes[note]}
                              onPointerDownKey={handlePointerDown}
                              onPointerEnterKey={handlePointerEnter}
                              onPointerUpKey={handlePointerUp}
                              labelType={labelType}
                              keyMap={keyToNoteMap}
                              isSystem7Theme={isSystem7Theme}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Status message */}
          <StatusDisplay message={statusMessage} />
        </div>
      </WindowFrame>

      {/* Dialogs */}
      <HelpDialog
        isOpen={isHelpOpen}
        onOpenChange={setIsHelpOpen}
        helpItems={translatedHelpItems}
        appId="synth"
      />

      <AboutDialog
        isOpen={isAboutOpen}
        onOpenChange={setIsAboutOpen}
        metadata={appMetadata}
        appId="synth"
      />

      <InputDialog
        isOpen={isPresetDialogOpen}
        onOpenChange={setIsPresetDialogOpen}
        onSubmit={savePreset}
        title={isSavingNewPreset ? t("apps.synth.dialogs.saveNewPreset") : t("apps.synth.dialogs.updatePreset")}
        description={
          isSavingNewPreset
            ? t("apps.synth.dialogs.enterPresetName")
            : t("apps.synth.dialogs.updatePresetName")
        }
        value={presetName}
        onChange={setPresetName}
      />
    </>
  );
}
