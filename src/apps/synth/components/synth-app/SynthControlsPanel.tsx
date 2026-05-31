import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dial } from "@/components/ui/dial";
import { Waveform3D } from "../Waveform3D";
import type { OscillatorType } from "./synthTypes";
import type { SynthAppController } from "./useSynthAppController";

type SynthControlsPanelProps = Pick<
  SynthAppController,
  | "t"
  | "isControlsVisible"
  | "currentPreset"
  | "handleOscillatorChange"
  | "handleEnvelopeChange"
  | "handleEffectChange"
  | "addPreset"
  | "analyzerRef"
  | "isMacOSTheme"
  | "isSystem7Theme"
  | "isClassicTheme"
  | "isXpTheme"
>;

export function SynthControlsPanel({
  t,
  isControlsVisible,
  currentPreset,
  handleOscillatorChange,
  handleEnvelopeChange,
  handleEffectChange,
  addPreset,
  analyzerRef,
  isMacOSTheme,
  isSystem7Theme,
  isClassicTheme,
  isXpTheme,
}: SynthControlsPanelProps) {
  return (
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
                  {isMacOSTheme ? (
                    <div className="metal-inset-btn-group">
                      <button
                        type="button"
                        className="metal-inset-btn font-geneva-12 !text-[9px] select-none"
                        onClick={addPreset}
                      >
                        {t("apps.synth.addPreset")}
                      </button>
                    </div>
                  ) : (
                    <Button
                      variant={isSystem7Theme ? "player" : "default"}
                      onClick={addPreset}
                      className={cn(
                        "h-[22px] px-2 text-[9px] select-none",
                        isXpTheme && "text-black"
                      )}
                    >
                      {t("apps.synth.addPreset")}
                    </Button>
                  )}
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
                      !isClassicTheme && "bg-black border-[#3a3a3a] text-white"
                    )}
                  >
                    <SelectValue placeholder={t("apps.synth.waveform")} />
                  </SelectTrigger>
                  <SelectContent
                    className={cn(
                      isClassicTheme && "text-black",
                      !isClassicTheme && "bg-black border-[#3a3a3a] text-white"
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

              <div className="md:hidden overflow-x-auto">
                <div className="flex flex-nowrap gap-6 min-w-max pb-2">
                  <SynthEnvelopeDialsMobile
                    t={t}
                    currentPreset={currentPreset}
                    handleEnvelopeChange={handleEnvelopeChange}
                  />
                  <SynthEffectsDialsMobile
                    t={t}
                    currentPreset={currentPreset}
                    handleEffectChange={handleEffectChange}
                  />
                </div>
              </div>

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
  );
}

function SynthEnvelopeDialsMobile({
  t,
  currentPreset,
  handleEnvelopeChange,
}: Pick<
  SynthControlsPanelProps,
  "t" | "currentPreset" | "handleEnvelopeChange"
>) {
  return (
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
            onChange={(value) => handleEnvelopeChange("attack", value)}
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
            onChange={(value) => handleEnvelopeChange("decay", value)}
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
            onChange={(value) => handleEnvelopeChange("sustain", value)}
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
            onChange={(value) => handleEnvelopeChange("release", value)}
            label={t("apps.synth.envelopeParams.release")}
            color="#ff00ff"
            size="sm"
          />
        </div>
      </div>
    </div>
  );
}

function SynthEffectsDialsMobile({
  t,
  currentPreset,
  handleEffectChange,
}: Pick<SynthControlsPanelProps, "t" | "currentPreset" | "handleEffectChange">) {
  return (
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
            onChange={(value) => handleEffectChange("gain", value)}
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
            onChange={(value) => handleEffectChange("reverb", value)}
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
            onChange={(value) => handleEffectChange("delay", value)}
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
            onChange={(value) => handleEffectChange("distortion", value)}
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
            onChange={(value) => handleEffectChange("chorus", value)}
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
            onChange={(value) => handleEffectChange("phaser", value)}
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
            onChange={(value) => handleEffectChange("bitcrusher", value)}
            label={t("apps.synth.effectsParams.bitcrusher")}
            color="#ff00ff"
            size="sm"
          />
        </div>
      </div>
    </div>
  );
}
