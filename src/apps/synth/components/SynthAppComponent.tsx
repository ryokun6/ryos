import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as Tone from "tone";
import { cn } from "@/lib/utils";
import { AppProps } from "../../base/types";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { SynthMenuBar } from "./SynthMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { helpItems, appMetadata } from "..";
import {
  loadSynthPresets,
  saveSynthPresets,
  loadSynthCurrentPreset,
  saveSynthCurrentPreset,
  SynthPreset,
} from "@/utils/storage";
import { Button } from "@/components/ui/button";
import { useSound } from "@/hooks/useSound";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dial } from "@/components/ui/dial";

// Define oscillator type
type OscillatorType = "sine" | "square" | "triangle" | "sawtooth";

// Component to display status messages
const StatusDisplay: React.FC<{ message: string | null }> = ({ message }) => {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.2 }}
          className="absolute bottom-4 w-full text-center left-1/2 transform -translate-x-1/2 px-4 py-2 bg-black/80 backdrop-blur-sm text-[#ff00ff] text-[12px] font-geneva-12 z-50"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Piano key component
const PianoKey: React.FC<{
  note: string;
  isBlack?: boolean;
  isPressed?: boolean;
  onPress: (note: string) => void;
  onRelease: (note: string) => void;
}> = ({ note, isBlack = false, isPressed = false, onPress, onRelease }) => {
  const handleMouseDown = () => {
    onPress(note);
  };

  const handleMouseUp = () => {
    onRelease(note);
  };

  const handleMouseEnter = (e: React.MouseEvent) => {
    // Only trigger note if mouse button is pressed (dragging)
    if (e.buttons === 1) {
      onPress(note);
    }
  };

  const handleMouseLeave = (e: React.MouseEvent) => {
    // Only release if we were dragging
    if (e.buttons === 1) {
      onRelease(note);
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    onPress(note);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    onRelease(note);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    // This is handled by the parent component's touch events
  };

  return (
    <button
      type="button"
      className={cn(
        "relative touch-none select-none outline-none transition-colors duration-100",
        isBlack
          ? cn(
              "absolute top-0 left-[55%] w-[60%] h-[70%] rounded-b-md z-10",
              // Add custom offsets for F#, G#, and A# keys
              note === "D#4" && "-translate-x-[20%]",
              note === "F#4" && "-translate-x-[60%]",
              note === "G#4" && "-translate-x-[80%]",
              note === "A#4" && "-translate-x-[100%]",
              isPressed ? "bg-[#ff33ff]" : "bg-black hover:bg-[#333333]"
            )
          : cn(
              "h-full w-full border border-[#333333] rounded-b-md",
              isPressed ? "bg-[#ff33ff]" : "bg-white hover:bg-[#f5f5f5]"
            )
      )}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
    >
      <span
        className={cn(
          "absolute bottom-2 left-1/2 transform -translate-x-1/2 text-xs pointer-events-none font-semibold",
          isBlack ? "text-white" : "text-black"
        )}
      >
        {note.replace(/[0-9]/g, "")}
      </span>
    </button>
  );
};

// Main synth app component
export function SynthAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
}: AppProps) {
  // References and synth state
  const synthRef = useRef<Tone.PolySynth | null>(null);
  const reverbRef = useRef<Tone.Reverb | null>(null);
  const delayRef = useRef<Tone.FeedbackDelay | null>(null);
  const distortionRef = useRef<Tone.Distortion | null>(null);

  // UI state
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isPresetDialogOpen, setIsPresetDialogOpen] = useState(false);
  const [isSavingNewPreset, setIsSavingNewPreset] = useState(true);
  const [presetName, setPresetName] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  // Default presets
  const defaultPresets: SynthPreset[] = [
    {
      id: "default",
      name: "Default",
      oscillator: {
        type: "sine" as OscillatorType,
      },
      envelope: {
        attack: 0.1,
        decay: 0.2,
        sustain: 0.5,
        release: 1,
      },
      effects: {
        reverb: 0.2,
        delay: 0.2,
        distortion: 0,
      },
    },
    {
      id: "analog-pad",
      name: "Analog Pad",
      oscillator: {
        type: "triangle" as OscillatorType,
      },
      envelope: {
        attack: 0.5,
        decay: 0.3,
        sustain: 0.7,
        release: 2,
      },
      effects: {
        reverb: 0.6,
        delay: 0.3,
        distortion: 0.1,
      },
    },
    {
      id: "digital-lead",
      name: "Digital Lead",
      oscillator: {
        type: "sawtooth" as OscillatorType,
      },
      envelope: {
        attack: 0.01,
        decay: 0.1,
        sustain: 0.3,
        release: 0.1,
      },
      effects: {
        reverb: 0.1,
        delay: 0.2,
        distortion: 0.3,
      },
    },
    {
      id: "retro-bass",
      name: "Retro Bass",
      oscillator: {
        type: "square" as OscillatorType,
      },
      envelope: {
        attack: 0.02,
        decay: 0.2,
        sustain: 0.8,
        release: 0.3,
      },
      effects: {
        reverb: 0.1,
        delay: 0.1,
        distortion: 0.2,
      },
    },
  ];

  const [presets, setPresets] = useState<SynthPreset[]>([]);
  const [currentPreset, setCurrentPreset] = useState<SynthPreset>(
    defaultPresets[0]
  );

  const [pressedNotes, setPressedNotes] = useState<Record<string, boolean>>({});
  // Use UI sound for interface feedback
  const { play } = useSound("/sounds/click.mp3");

  // Define keyboard layout
  const whiteKeys = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"];
  const blackKeys = ["C#4", "D#4", null, "F#4", "G#4", "A#4", null];

  const [isControlsVisible, setIsControlsVisible] = useState(false);

  // Initialize synth and effects
  useEffect(() => {
    if (!isWindowOpen) return;

    // Create synth and effects chain
    const synth = new Tone.PolySynth(Tone.Synth).toDestination();
    const reverb = new Tone.Reverb({
      decay: 2,
      wet: currentPreset.effects.reverb,
    }).toDestination();
    const delay = new Tone.FeedbackDelay({
      delayTime: 0.25,
      feedback: currentPreset.effects.delay,
    }).toDestination();
    const distortion = new Tone.Distortion({
      distortion: currentPreset.effects.distortion,
    }).toDestination();

    // Connect effects chain
    synth.connect(reverb);
    reverb.connect(delay);
    delay.connect(distortion);
    distortion.toDestination();

    // Set initial synth parameters
    synth.set({
      oscillator: {
        type: currentPreset.oscillator.type,
      },
      envelope: {
        attack: currentPreset.envelope.attack,
        decay: currentPreset.envelope.decay,
        sustain: currentPreset.envelope.sustain,
        release: currentPreset.envelope.release,
      },
    });

    synthRef.current = synth;
    reverbRef.current = reverb;
    delayRef.current = delay;
    distortionRef.current = distortion;

    // Load saved presets
    const savedPresets = loadSynthPresets();
    if (savedPresets.length > 0) {
      setPresets(savedPresets);
    } else {
      // Use default presets if no saved presets
      setPresets(defaultPresets);
    }

    const savedCurrentPreset = loadSynthCurrentPreset();
    if (savedCurrentPreset) {
      setCurrentPreset(savedCurrentPreset);
      updateSynthParams(savedCurrentPreset);
    }

    // Add keyboard event handlers
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);

    return () => {
      synth.dispose();
      reverb.dispose();
      delay.dispose();
      distortion.dispose();
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
    };
  }, [isWindowOpen]);

  // Save presets when they change
  useEffect(() => {
    if (presets.length > 0) {
      saveSynthPresets(presets);
    }
  }, [presets]);

  // Save current preset when it changes
  useEffect(() => {
    saveSynthCurrentPreset(currentPreset);
  }, [currentPreset]);

  // Update synth parameters when current preset changes
  const updateSynthParams = (preset: SynthPreset) => {
    if (
      !synthRef.current ||
      !reverbRef.current ||
      !delayRef.current ||
      !distortionRef.current
    )
      return;

    synthRef.current.set({
      oscillator: {
        type: preset.oscillator.type,
      },
      envelope: {
        attack: preset.envelope.attack,
        decay: preset.envelope.decay,
        sustain: preset.envelope.sustain,
        release: preset.envelope.release,
      },
    });

    reverbRef.current.wet.value = preset.effects.reverb;
    delayRef.current.feedback.value = preset.effects.delay;
    distortionRef.current.distortion = preset.effects.distortion;
  };

  // Keyboard event handlers
  const keyToNoteMap: Record<string, string> = {
    a: "C4",
    w: "C#4",
    s: "D4",
    e: "D#4",
    d: "E4",
    f: "F4",
    t: "F#4",
    g: "G4",
    y: "G#4",
    h: "A4",
    u: "A#4",
    j: "B4",
    k: "C5",
  };

  // Note press/release handlers
  const pressNote = (note: string) => {
    if (!synthRef.current) return;

    synthRef.current.triggerAttack(note);
    setPressedNotes((prev) => ({ ...prev, [note]: true }));
  };

  const releaseNote = (note: string) => {
    if (!synthRef.current) return;

    synthRef.current.triggerRelease(note);
    setPressedNotes((prev) => ({ ...prev, [note]: false }));
  };

  // Status message display
  const showStatus = (message: string) => {
    setStatusMessage(message);
    setTimeout(() => setStatusMessage(""), 3000);
  };

  // Preset handlers
  const addPreset = () => {
    setIsSavingNewPreset(true);
    setPresetName("");
    setIsPresetDialogOpen(true);
    play();
  };

  const updateCurrentPreset = () => {
    setIsSavingNewPreset(false);
    setPresetName(currentPreset.name);
    setIsPresetDialogOpen(true);
    play();
  };

  const savePreset = (name: string) => {
    if (isSavingNewPreset) {
      // Create a new preset
      const newPreset: SynthPreset = {
        ...currentPreset,
        id: Date.now().toString(),
        name,
      };

      setPresets((prev) => [...prev, newPreset]);
      setCurrentPreset(newPreset);
      showStatus(`Preset "${name}" saved`);
    } else {
      // Update existing preset
      const updatedPreset: SynthPreset = {
        ...currentPreset,
        name: name,
      };

      setPresets((prev) =>
        prev.map((preset) =>
          preset.id === currentPreset.id ? updatedPreset : preset
        )
      );
      setCurrentPreset(updatedPreset);
      showStatus(`Preset "${name}" updated`);
    }
  };

  const loadPreset = (preset: SynthPreset) => {
    setCurrentPreset(preset);
    updateSynthParams(preset);
    showStatus(`Preset "${preset.name}" loaded`);
    play();
  };

  const resetSynth = () => {
    // Load the default presets
    const defaultPresets: SynthPreset[] = [
      {
        id: "default",
        name: "Default",
        oscillator: {
          type: "sine" as OscillatorType,
        },
        envelope: {
          attack: 0.1,
          decay: 0.2,
          sustain: 0.5,
          release: 1,
        },
        effects: {
          reverb: 0.2,
          delay: 0.2,
          distortion: 0,
        },
      },
      {
        id: "analog-pad",
        name: "Analog Pad",
        oscillator: {
          type: "triangle" as OscillatorType,
        },
        envelope: {
          attack: 0.5,
          decay: 0.3,
          sustain: 0.7,
          release: 2,
        },
        effects: {
          reverb: 0.6,
          delay: 0.3,
          distortion: 0.1,
        },
      },
      {
        id: "digital-lead",
        name: "Digital Lead",
        oscillator: {
          type: "sawtooth" as OscillatorType,
        },
        envelope: {
          attack: 0.01,
          decay: 0.1,
          sustain: 0.3,
          release: 0.1,
        },
        effects: {
          reverb: 0.1,
          delay: 0.2,
          distortion: 0.3,
        },
      },
      {
        id: "retro-bass",
        name: "Retro Bass",
        oscillator: {
          type: "square" as OscillatorType,
        },
        envelope: {
          attack: 0.05,
          decay: 0.1,
          sustain: 0.6,
          release: 0.3,
        },
        effects: {
          reverb: 0.1,
          delay: 0.1,
          distortion: 0.2,
        },
      },
    ];

    // Set the presets and current preset
    setPresets(defaultPresets);
    setCurrentPreset(defaultPresets[0]);
    updateSynthParams(defaultPresets[0]);
    showStatus("Synth reset to defaults");
    play();
  };

  // Parameter change handlers
  const handleOscillatorChange = (type: OscillatorType) => {
    setCurrentPreset((prev) => ({
      ...prev,
      oscillator: { type },
    }));

    if (synthRef.current) {
      synthRef.current.set({
        oscillator: { type },
      });
    }
  };

  const handleEnvelopeChange = (
    param: "attack" | "decay" | "sustain" | "release",
    value: number
  ) => {
    setCurrentPreset((prev) => ({
      ...prev,
      envelope: {
        ...prev.envelope,
        [param]: value,
      },
    }));

    if (synthRef.current) {
      synthRef.current.set({
        envelope: {
          [param]: value,
        },
      });
    }
  };

  const handleEffectChange = (
    effect: "reverb" | "delay" | "distortion",
    value: number
  ) => {
    setCurrentPreset((prev) => ({
      ...prev,
      effects: {
        ...prev.effects,
        [effect]: value,
      },
    }));

    if (effect === "reverb" && reverbRef.current) {
      reverbRef.current.wet.value = value;
    } else if (effect === "delay" && delayRef.current) {
      delayRef.current.feedback.value = value;
    } else if (effect === "distortion" && distortionRef.current) {
      distortionRef.current.distortion = value;
    }
  };

  // Keyboard event handlers
  const handleKeyDown = (e: KeyboardEvent) => {
    if (
      !isForeground ||
      e.repeat ||
      isPresetDialogOpen ||
      isHelpOpen ||
      isAboutOpen
    )
      return;

    const note = keyToNoteMap[e.key.toLowerCase()];
    if (note) {
      e.preventDefault();
      pressNote(note);
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    if (!isForeground || isPresetDialogOpen || isHelpOpen || isAboutOpen)
      return;

    const note = keyToNoteMap[e.key.toLowerCase()];
    if (note) {
      e.preventDefault();
      releaseNote(note);
    }
  };

  return (
    <>
      <SynthMenuBar
        onAddPreset={addPreset}
        onLoadPreset={() => {}}
        onSavePreset={updateCurrentPreset}
        onShowHelp={() => setIsHelpOpen(true)}
        onShowAbout={() => setIsAboutOpen(true)}
        onReset={resetSynth}
      />

      <WindowFrame
        title="Synth"
        appId="synth"
        onClose={onClose}
        isForeground={isForeground}
      >
        <div className="flex flex-col h-full w-full bg-[#1a1a1a] text-white overflow-hidden">
          {/* Main content area */}
          <div className="flex flex-col flex-1 min-h-0 w-full overflow-hidden">
            {/* Presets section */}
            <div className="p-4 py-4 bg-[#2a2a2a] w-full border-b border-[#3a3a3a]">
              <div className="flex justify-between items-center">
                <div className="flex gap-0 overflow-x-auto">
                  {presets.length > 0 ? (
                    presets.map((preset) => (
                      <Button
                        key={preset.id}
                        variant="player"
                        data-state={
                          currentPreset.id === preset.id ? "on" : "off"
                        }
                        onClick={() => loadPreset(preset)}
                        className="h-[22px] px-2 whitespace-nowrap uppercase"
                      >
                        {preset.name}
                      </Button>
                    ))
                  ) : (
                    <p className="text-xs text-gray-400 font-geneva-12">
                      No presets yet. Create one with the NEW button.
                    </p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="player"
                    onClick={addPreset}
                    className="h-[22px] px-2"
                  >
                    ADD
                  </Button>
                  <Button
                    variant="player"
                    onClick={() => setIsControlsVisible(!isControlsVisible)}
                    className="h-[22px] px-2"
                  >
                    CONTROLS
                  </Button>
                </div>
              </div>
            </div>

            {/* Controls panel */}
            <div className="relative w-full">
              <AnimatePresence>
                {isControlsVisible && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden w-full"
                  >
                    <div className="p-4 bg-[#2a2a2a] w-full border-b border-[#3a3a3a]">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <h3 className="font-semibold mb-2 text-[#ff00ff] font-geneva-12 text-[10px]">
                            Oscillator
                          </h3>
                          <Select
                            value={currentPreset.oscillator.type}
                            onValueChange={(value: OscillatorType) =>
                              handleOscillatorChange(value)
                            }
                          >
                            <SelectTrigger className="w-full bg-black border-[#3a3a3a] text-white font-geneva-12 text-[12px] p-2">
                              <SelectValue placeholder="Waveform" />
                            </SelectTrigger>
                            <SelectContent className="bg-black border-[#3a3a3a] text-white">
                              <SelectItem
                                value="sine"
                                className="font-geneva-12 text-[12px]"
                              >
                                Sine
                              </SelectItem>
                              <SelectItem
                                value="square"
                                className="font-geneva-12 text-[12px]"
                              >
                                Square
                              </SelectItem>
                              <SelectItem
                                value="triangle"
                                className="font-geneva-12 text-[12px]"
                              >
                                Triangle
                              </SelectItem>
                              <SelectItem
                                value="sawtooth"
                                className="font-geneva-12 text-[12px]"
                              >
                                Sawtooth
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <h3 className="font-semibold mb-2 text-[#ff00ff] font-geneva-12 text-[10px]">
                            Envelope
                          </h3>
                          <div className="flex flex-wrap gap-1">
                            <div className="w-16">
                              <Dial
                                value={currentPreset.envelope.attack}
                                min={0.01}
                                max={2}
                                step={0.01}
                                onChange={(value) =>
                                  handleEnvelopeChange("attack", value)
                                }
                                label="Attack"
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
                                label="Decay"
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
                                label="Sustain"
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
                                label="Release"
                                color="#ff00ff"
                                size="sm"
                              />
                            </div>
                          </div>
                        </div>

                        <div>
                          <h3 className="font-semibold mb-2 text-[#ff00ff] font-geneva-12 text-[10px] ">
                            Effects
                          </h3>
                          <div className="flex flex-wrap gap-1">
                            <div className="w-16">
                              <Dial
                                value={currentPreset.effects.reverb}
                                min={0}
                                max={1}
                                step={0.01}
                                onChange={(value) =>
                                  handleEffectChange("reverb", value)
                                }
                                label="Reverb"
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
                                label="Delay"
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
                                label="Distortion"
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
              <div className="relative h-full w-full">
                {/* White keys container */}
                <div className="absolute inset-0 h-full flex w-full">
                  {whiteKeys.map((note) => (
                    <div key={note} className="flex-1 relative">
                      <PianoKey
                        note={note}
                        isPressed={pressedNotes[note]}
                        onPress={pressNote}
                        onRelease={releaseNote}
                      />
                    </div>
                  ))}
                </div>

                {/* Black keys container */}
                <div className="absolute inset-0 h-full w-full flex pointer-events-none">
                  {blackKeys.map((note, index) => (
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
                            onPress={pressNote}
                            onRelease={releaseNote}
                          />
                        </div>
                      )}
                    </div>
                  ))}
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
        helpItems={helpItems}
        appName="Synth"
      />

      <AboutDialog
        isOpen={isAboutOpen}
        onOpenChange={setIsAboutOpen}
        metadata={appMetadata}
      />

      <InputDialog
        isOpen={isPresetDialogOpen}
        onOpenChange={setIsPresetDialogOpen}
        onSubmit={savePreset}
        title={isSavingNewPreset ? "Save New Preset" : "Update Preset"}
        description={
          isSavingNewPreset
            ? "Enter a name for your preset"
            : "Update the name of your preset"
        }
        value={presetName}
        onChange={setPresetName}
      />
    </>
  );
}
