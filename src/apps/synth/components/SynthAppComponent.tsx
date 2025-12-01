import { useState, useRef, useEffect, useCallback } from "react";
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
// Using store for all Synth settings
import {
  useSynthStore,
  SynthPreset,
  NoteLabelType,
} from "@/stores/useSynthStore";
import { Button } from "@/components/ui/button";
import { useSound, Sounds } from "@/hooks/useSound";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dial } from "@/components/ui/dial";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Waveform3D } from "./Waveform3D";
import { useThemeStore } from "@/stores/useThemeStore";

// Define oscillator type
type OscillatorType = "sine" | "square" | "triangle" | "sawtooth";

// NoteLabelType is now imported from useSynthStore

// Function to shift note by octave
const shiftNoteByOctave = (note: string, offset: number): string => {
  const noteMatch = note.match(/([A-G]#?)(\d+)/);
  if (!noteMatch) return note;

  const [, noteName, octave] = noteMatch;
  const newOctave = parseInt(octave) + offset;

  // Limit octave range to prevent invalid notes
  if (newOctave < 0 || newOctave > 8) return note;

  return `${noteName}${newOctave}`;
};

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
          className="absolute bottom-4 w-full text-center left-1/2 transform -translate-x-1/2 px-4 py-2 bg-black/80 backdrop-blur-sm text-[#ff00ff] text-[12px] font-geneva-12 z-10 select-none"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// Piano key component (uses Pointer Events for unified mouse/touch handling)
const PianoKey: React.FC<{
  note: string;
  isBlack?: boolean;
  isPressed?: boolean;
  onPointerDownKey: (note: string, e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerEnterKey: (note: string, e: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUpKey: (note: string, e: React.PointerEvent<HTMLButtonElement>) => void;
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
  // References and synth state
  const synthRef = useRef<Tone.PolySynth | null>(null);
  const reverbRef = useRef<Tone.Reverb | null>(null);
  const delayRef = useRef<Tone.FeedbackDelay | null>(null);
  const distortionRef = useRef<Tone.Distortion | null>(null);
  const analyzerRef = useRef<Tone.Analyser | null>(null);
  const gainRef = useRef<Tone.Gain | null>(null);
  const chorusRef = useRef<Tone.Chorus | null>(null);
  const phaserRef = useRef<Tone.Phaser | null>(null);
  const bitcrusherRef = useRef<Tone.BitCrusher | null>(null);
  // Track the exact shifted note triggered for each base note to ensure proper release
  const activeShiftedNotesRef = useRef<Record<string, string>>({});
  // Always read the latest octave offset inside keyboard handlers
  const octaveOffsetRef = useRef(0);

  // UI state
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isPresetDialogOpen, setIsPresetDialogOpen] = useState(false);
  const [isSavingNewPreset, setIsSavingNewPreset] = useState(true);
  const [presetName, setPresetName] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isControlsVisible, setIsControlsVisible] = useState(false);
  const [octaveOffset, setOctaveOffset] = useState(0);
  useEffect(() => {
    octaveOffsetRef.current = octaveOffset;
  }, [octaveOffset]);

  // Ref to keep the latest foreground state for global event handlers
  const isForegroundRef = useRef(isForeground);
  useEffect(() => {
    isForegroundRef.current = isForeground;
  }, [isForeground]);

  // Default presets are now defined in the store

  // Presets and currentPreset are now loaded from persisted Zustand store

  const [pressedNotes, setPressedNotes] = useState<Record<string, boolean>>({});
  // Active pointerId -> note mapping for unified mouse/touch handling
  const [activePointers, setActivePointers] = useState<Record<number, string>>({});
  const activePointersRef = useRef<Record<number, string>>({});
  useEffect(() => {
    activePointersRef.current = activePointers;
  }, [activePointers]);
  // Use UI sound for interface feedback
  const { play } = useSound(Sounds.CLICK);

  // Define keyboard layout with extended range
  const allWhiteKeys = [
    "C3",
    "D3",
    "E3",
    "F3",
    "G3",
    "A3",
    "B3",
    "C4",
    "D4",
    "E4",
    "F4",
    "G4",
    "A4",
    "B4",
    "C5",
    "D5",
    "E5",
    "F5",
  ];
  const allBlackKeys = [
    "C#3",
    "D#3",
    null,
    "F#3",
    "G#3",
    "A#3",
    null,
    "C#4",
    "D#4",
    null,
    "F#4",
    "G#4",
    "A#4",
    null,
    "C#5",
    "D#5",
    null,
    "F#5",
  ];

  // State for responsive keyboard
  const [visibleKeyCount, setVisibleKeyCount] = useState(8);

  // Reference to the app container
  const appContainerRef = useRef<HTMLDivElement>(null);

  // Update visible keys based on WindowFrame's width
  useEffect(() => {
    if (!isWindowOpen) return;

    const handleResize = () => {
      if (!appContainerRef.current) return;

      const width = appContainerRef.current.clientWidth;
      // Calculate how many additional keys to show based on width
      // Base is 8 keys at minimum width (e.g. 400px)
      // Add 1 key per 80px of additional width
      const additionalKeys = Math.floor((width - 400) / 80);
      setVisibleKeyCount(Math.max(0, Math.min(10, additionalKeys)));
    };

    // Initial calculation
    handleResize();

    // Create ResizeObserver to watch for container size changes
    const resizeObserver = new ResizeObserver(handleResize);

    if (appContainerRef.current) {
      resizeObserver.observe(appContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [isWindowOpen, appContainerRef.current]);

  // Get visible keys based on container width
  // Start with a base of 8 keys (C4-C5) and add more keys on both sides as container gets wider
  const baseIndex = 7; // Index of C4 in allWhiteKeys
  const keysToAddLeft = Math.floor(visibleKeyCount / 2);
  const keysToAddRight = Math.ceil(visibleKeyCount / 2);

  const startIndex = Math.max(0, baseIndex - keysToAddLeft);
  const endIndex = Math.min(
    allWhiteKeys.length,
    baseIndex + 8 + keysToAddRight
  );

  const whiteKeys = allWhiteKeys.slice(startIndex, endIndex);
  const blackKeys = allBlackKeys.slice(startIndex, endIndex);

  // Determine default label type based on screen size
  const isMobile = useMediaQuery("(max-width: 768px)");
  // Use labelType from persisted store
  const {
    labelType,
    setLabelType,
    presets,
    setPresets,
    currentPreset,
    setCurrentPreset,
  } = useSynthStore();

  // Update label type when screen size changes - now using store
  useEffect(() => {
    if (!isWindowOpen) return;

    // Only update to default on mobile if no existing preference
    if (isMobile) {
      setLabelType("off");
    }
  }, [isMobile, isWindowOpen]);

  // Initialize synth and effects
  useEffect(() => {
    if (!isWindowOpen) return;

    // Create synth and effects chain
    const synth = new Tone.PolySynth(Tone.Synth);
    const reverb = new Tone.Reverb({
      decay: 2,
      wet: currentPreset.effects.reverb,
    });
    const delay = new Tone.FeedbackDelay({
      delayTime: 0.25,
      feedback: currentPreset.effects.delay,
    });
    const distortion = new Tone.Distortion({
      distortion: currentPreset.effects.distortion,
    });
    const gain = new Tone.Gain(currentPreset.effects.gain);
    const chorus = new Tone.Chorus({
      frequency: 4,
      delayTime: 2.5,
      depth: 0.7,
    }).start();
    chorus.wet.value = currentPreset.effects.chorus ?? 0;

    const phaser = new Tone.Phaser({
      frequency: 0.5,
      octaves: 3,
      baseFrequency: 1000,
      wet: currentPreset.effects.phaser ?? 0,
    });

    const bitcrusher = new Tone.BitCrusher(4).set({
      bits: Math.floor(4 + (1 - (currentPreset.effects.bitcrusher ?? 0)) * 12),
    });
    // Add a boost gain before analyzer for better visualization
    const analyzerBoost = new Tone.Gain(4);
    const analyzer = new Tone.Analyser({
      type: "waveform",
      size: 1024,
      smoothing: 0.8,
    });

    // Connect effects chain
    synth.connect(reverb);
    reverb.connect(delay);
    delay.connect(distortion);
    distortion.connect(chorus);
    chorus.connect(phaser);
    phaser.connect(bitcrusher);
    bitcrusher.connect(gain);
    gain.connect(analyzerBoost);
    analyzerBoost.connect(analyzer);
    gain.connect(Tone.Destination);

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
    gainRef.current = gain;
    chorusRef.current = chorus;
    phaserRef.current = phaser;
    bitcrusherRef.current = bitcrusher;
    analyzerRef.current = analyzer;

    // Initialize synth with current preset
    updateSynthParams(currentPreset);

    // Add keyboard event handlers
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);

    return () => {
      synth.dispose();
      reverb.dispose();
      delay.dispose();
      distortion.dispose();
      chorus.dispose();
      phaser.dispose();
      bitcrusher.dispose();
      gain.dispose();
      analyzer.dispose();
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
    };
  }, [isWindowOpen]);

  // Presets and currentPreset are now automatically saved by the Zustand store

  // Update synth parameters when current preset changes
  const updateSynthParams = (preset: SynthPreset) => {
    if (
      !synthRef.current ||
      !reverbRef.current ||
      !delayRef.current ||
      !distortionRef.current ||
      !gainRef.current ||
      !chorusRef.current ||
      !phaserRef.current ||
      !bitcrusherRef.current
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
    gainRef.current.gain.value = preset.effects.gain;

    // Update chorus parameters safely
    if (chorusRef.current.wet) {
      chorusRef.current.wet.value = preset.effects.chorus ?? 0;
    }

    // Update phaser parameters safely
    if (phaserRef.current.wet) {
      phaserRef.current.wet.value = preset.effects.phaser ?? 0;
    }

    // Update bitcrusher parameters
    bitcrusherRef.current.set({
      bits: Math.floor(4 + (1 - (preset.effects.bitcrusher ?? 0)) * 12),
    });
  };

  // Keyboard event handlers - extended mapping
  const keyToNoteMap: Record<string, string> = {
    // Middle octave (C4-B4)
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

    // Upper octave (C5-F5)
    k: "C5",
    o: "C#5",
    l: "D5",
    p: "D#5",
    ";": "E5",
    "'": "F5",
  };

  // Note press/release handlers
  const pressNote = useCallback((note: string) => {
    if (!synthRef.current) return;

    const shiftedNote = shiftNoteByOctave(note, octaveOffsetRef.current);
    activeShiftedNotesRef.current[note] = shiftedNote;
    const now = Tone.context.currentTime; // schedule without extra latency
    synthRef.current.triggerAttack(shiftedNote, now);
    setPressedNotes((prev) => ({ ...prev, [note]: true }));
  }, []);

  const releaseNote = useCallback((note: string) => {
    if (!synthRef.current) return;

    const shiftedNote =
      activeShiftedNotesRef.current[note] ??
      shiftNoteByOctave(note, octaveOffsetRef.current);
    const now = Tone.context.currentTime;
    synthRef.current.triggerRelease(shiftedNote, now);
    delete activeShiftedNotesRef.current[note];
    setPressedNotes((prev) => ({ ...prev, [note]: false }));
  }, []);

  // Release all currently active notes regardless of current octave or sources
  const releaseAllNotes = useCallback(() => {
    if (!synthRef.current) {
      activeShiftedNotesRef.current = {};
      setPressedNotes({});
      setActivePointers({});
      return;
    }

    const now = Tone.context.currentTime;
    const keys = Object.keys(activeShiftedNotesRef.current);
    for (const baseNote of keys) {
      const shifted = activeShiftedNotesRef.current[baseNote];
      if (shifted) {
        synthRef.current.triggerRelease(shifted, now);
      }
    }
    activeShiftedNotesRef.current = {};
    setPressedNotes({});
    setActivePointers({});
  }, []);

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
    setIsPresetDialogOpen(false);
  };

  const loadPreset = (preset: SynthPreset) => {
    setCurrentPreset(preset);
    updateSynthParams(preset);
    showStatus(`Preset "${preset.name}" loaded`);
    play();
  };

  const resetSynth = () => {
    // Reset the store to defaults
    useSynthStore.getState().reset();
    const newPreset = useSynthStore.getState().currentPreset;
    // Apply the freshly reset preset immediately
    updateSynthParams(newPreset);

    // Store updates handled automatically by Zustand

    showStatus("Synth reset to defaults");
    play();
  };

  // Parameter change handlers (storage handled by Zustand store)
  const handleOscillatorChange = (type: OscillatorType) => {
    const updatedPreset = {
      ...currentPreset,
      oscillator: { type },
    };
    setCurrentPreset(updatedPreset);
    updateSynthParams(updatedPreset);

    // Update presets in the store
    const updatedPresets = presets.map((p) =>
      p.id === updatedPreset.id ? updatedPreset : p
    );
    setPresets(updatedPresets);
  };

  const handleEnvelopeChange = (
    param: "attack" | "decay" | "sustain" | "release",
    value: number
  ) => {
    const updatedPreset = {
      ...currentPreset,
      envelope: {
        ...currentPreset.envelope,
        [param]: value,
      },
    };
    setCurrentPreset(updatedPreset);
    updateSynthParams(updatedPreset);

    // Update presets in the store
    const updatedPresets = presets.map((p) =>
      p.id === updatedPreset.id ? updatedPreset : p
    );
    setPresets(updatedPresets);
  };

  const handleEffectChange = (
    effect:
      | "reverb"
      | "delay"
      | "distortion"
      | "gain"
      | "chorus"
      | "phaser"
      | "bitcrusher",
    value: number
  ) => {
    const updatedPreset = {
      ...currentPreset,
      effects: {
        ...currentPreset.effects,
        [effect]: value,
      },
    };
    setCurrentPreset(updatedPreset);
    updateSynthParams(updatedPreset);

    // Update presets in the store
    const updatedPresets = presets.map((p) =>
      p.id === updatedPreset.id ? updatedPreset : p
    );
    setPresets(updatedPresets);
  };

  // Keyboard event handlers
  const handleKeyDown = (e: KeyboardEvent) => {
    if (
      !isForegroundRef.current ||
      e.repeat ||
      isPresetDialogOpen ||
      isHelpOpen ||
      isAboutOpen ||
      isControlsVisible
    )
      return;

    // Handle octave shift keys
    if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      setOctaveOffset((prevOffset) => {
        const newOffset = Math.max(-2, prevOffset - 1);
        showStatus(`Octave ${newOffset}`);
        return newOffset;
      });
    } else if (e.key === "=" || e.key === "+") {
      e.preventDefault();
      setOctaveOffset((prevOffset) => {
        const newOffset = Math.min(2, prevOffset + 1);
        showStatus(`Octave ${newOffset}`);
        return newOffset;
      });
    }

    // Handle number keys for preset switching
    const numKey = parseInt(e.key);
    if (!isNaN(numKey) && numKey >= 1 && numKey <= 9) {
      e.preventDefault();
      const presetIndex = numKey - 1;
      if (presetIndex < presets.length) {
        loadPreset(presets[presetIndex]);
      }
    }

    // Handle 0 key for the 10th preset
    if (e.key === "0") {
      e.preventDefault();
      const presetIndex = 9;
      if (presetIndex < presets.length) {
        loadPreset(presets[presetIndex]);
      }
    }

    const note = keyToNoteMap[e.key.toLowerCase()];
    if (note) {
      e.preventDefault();
      pressNote(note);
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    if (
      !isForegroundRef.current ||
      isPresetDialogOpen ||
      isHelpOpen ||
      isAboutOpen ||
      isControlsVisible
    )
      return;

    const note = keyToNoteMap[e.key.toLowerCase()];
    if (note) {
      e.preventDefault();
      releaseNote(note);
    }
  };

  // Add visibility change effect to release notes when app goes to background
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        releaseAllNotes();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [releaseAllNotes]);

  // Release all notes when the app loses foreground
  useEffect(() => {
    if (!isWindowOpen) return;
    if (!isForeground) {
      releaseAllNotes();
    }
  }, [isForeground, isWindowOpen, releaseAllNotes]);

  // Release notes when dialogs/controls open to avoid ignored keyup/touchend
  useEffect(() => {
    if (!isWindowOpen) return;
    if (isControlsVisible || isHelpOpen || isAboutOpen || isPresetDialogOpen) {
      releaseAllNotes();
    }
  }, [
    isControlsVisible,
    isHelpOpen,
    isAboutOpen,
    isPresetDialogOpen,
    isWindowOpen,
    releaseAllNotes,
  ]);

  // Release notes on window blur (e.g., switching apps without hiding the page)
  useEffect(() => {
    if (!isWindowOpen) return;
    const onBlur = () => releaseAllNotes();
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [isWindowOpen, releaseAllNotes]);

  // Ensure we also release when window is closed
  useEffect(() => {
    if (!isWindowOpen) {
      releaseAllNotes();
    }
  }, [isWindowOpen, releaseAllNotes]);

  // Ensure Tone.js context is in low-latency mode once when the component mounts
  useEffect(() => {
    // Tone.js adds a small scheduling lookAhead (default 0.1 s) which can make the
    // keyboard feel sluggish.  Setting it to 0 removes the intentional delay so
    // that notes are triggered immediately when requested.
    try {
      // In some environments Tone.context might not be ready yet, so we wrap in try/catch
      if (Tone && Tone.context) {
        // Tone's type defs don't expose lookAhead as writable
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (Tone.context as any).lookAhead = 0;
      }
    } catch {
      // Ignore if Tone isn't available – worst case we keep the default value.
    }
  }, []);

  // Ensure all pointers are released even if they end outside a key
  useEffect(() => {
    if (!isWindowOpen) return;
    const handlePointerEnd = (e: PointerEvent) => {
      const pointerId = e.pointerId;
      const note = activePointersRef.current[pointerId];
      if (note) {
        releaseNote(note);
        setActivePointers((prev) => {
          const copy = { ...prev };
          delete copy[pointerId];
          return copy;
        });
      }
    };
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    return () => {
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [isWindowOpen, releaseNote]);

  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isSystem7Theme = currentTheme === "system7";
  const isClassicTheme = currentTheme === "macosx" || isXpTheme;
  const isMacOSTheme = currentTheme === "macosx";

  // Wrapper to dispatch close event for animation and sound
  const handleMenuBarClose = () => {
    if (instanceId) {
      window.dispatchEvent(new CustomEvent(`requestClose-${instanceId}`));
    } else {
      // Fallback to direct close if no instanceId
      onClose();
    }
  };

  const menuBar = (
    <SynthMenuBar
      onAddPreset={addPreset}
      onShowHelp={() => setIsHelpOpen(true)}
      onShowAbout={() => setIsAboutOpen(true)}
      onReset={resetSynth}
      onClose={handleMenuBarClose}
      presets={presets}
      currentPresetId={currentPreset.id}
      onLoadPresetById={(id) => {
        const preset = presets.find((p) => p.id === id);
        if (preset) loadPreset(preset);
      }}
      labelType={labelType}
      onLabelTypeChange={setLabelType}
    />
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title="Synth"
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
                      onValueChange={(value) => {
                        const preset = presets.find((p) => p.id === value);
                        if (preset) loadPreset(preset);
                      }}
                    >
                      <SelectTrigger
                        className={cn(
                          "w-full h-[22px] font-geneva-12 text-[12px] p-2",
                          isClassicTheme && "text-black bg-transparent",
                          !isClassicTheme &&
                            "bg-black border-[#3a3a3a] text-white"
                        )}
                      >
                        <SelectValue placeholder="Select Preset" />
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
                        No presets yet. Create one with the NEW button.
                      </p>
                    )}
                  </div>
                </div>
                <div className={cn("flex gap-0", isMacOSTheme && "aqua-select-group")}>
                  <Button
                    variant={isMacOSTheme ? "aqua_select" : isSystem7Theme ? "player" : "default"}
                    onClick={() =>
                      setOctaveOffset((prev) => {
                        const next = Math.max(-2, prev - 1);
                        showStatus(`Octave ${next}`);
                        return next;
                      })
                    }
                    className={cn(
                      isSystem7Theme ? "h-[22px] px-2" : isMacOSTheme ? "aqua-compact" : "h-[22px] px-2",
                      isXpTheme && "text-black",
                      "select-none"
                    )}
                  >
                    &lt;
                  </Button>
                  <Button
                    variant={isMacOSTheme ? "aqua_select" : isSystem7Theme ? "player" : "default"}
                    onClick={() =>
                      setOctaveOffset((prev) => {
                        const next = Math.min(2, prev + 1);
                        showStatus(`Octave ${next}`);
                        return next;
                      })
                    }
                    className={cn(
                      isSystem7Theme ? "h-[22px] px-2" : isMacOSTheme ? "aqua-compact" : "h-[22px] px-2",
                      isXpTheme && "text-black",
                      "select-none"
                    )}
                  >
                    &gt;
                  </Button>
                  <Button
                    variant={isMacOSTheme ? "aqua_select" : isSystem7Theme ? "player" : "default"}
                    onClick={() => setIsControlsVisible(!isControlsVisible)}
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
                            Oscillator
                          </h3>
                          <Button
                            variant={isMacOSTheme ? "aqua_select" : isSystem7Theme ? "player" : "default"}
                            onClick={addPreset}
                            className={cn(
                              "h-[22px] px-2 text-[9px] select-none",
                              isXpTheme && "text-black"
                            )}
                          >
                            ADD PRESET
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
                            <SelectValue placeholder="Waveform" />
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
                              Sine
                            </SelectItem>
                            <SelectItem
                              value="square"
                              className={cn(
                                "font-geneva-12 text-[12px]",
                                isClassicTheme && "text-black"
                              )}
                            >
                              Square
                            </SelectItem>
                            <SelectItem
                              value="triangle"
                              className={cn(
                                "font-geneva-12 text-[12px]",
                                isClassicTheme && "text-black"
                              )}
                            >
                              Triangle
                            </SelectItem>
                            <SelectItem
                              value="sawtooth"
                              className={cn(
                                "font-geneva-12 text-[12px]",
                                isClassicTheme && "text-black"
                              )}
                            >
                              Sawtooth
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
                              Envelope
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
                            <h3 className="font-semibold mb-2 text-[#ff00ff] font-geneva-12 text-[10px] select-none">
                              Effects
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
                                  label="Gain"
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
                              <div className="w-16">
                                <Dial
                                  value={currentPreset.effects.chorus ?? 0}
                                  min={0}
                                  max={1}
                                  step={0.01}
                                  onChange={(value) =>
                                    handleEffectChange("chorus", value)
                                  }
                                  label="Chorus"
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
                                  label="Phaser"
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
                                  label="Bitcrusher"
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
                          Envelope
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
                                label="Attack"
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
                                label="Decay"
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
                                label="Sustain"
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
                                label="Release"
                                color="#ff00ff"
                                size="sm"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="hidden md:block md:flex-shrink-0 md:w-[280px]">
                        <h3 className="font-semibold mb-2 text-[#ff00ff] font-geneva-12 text-[10px] select-none">
                          Effects
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
                                label="Gain"
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
                                label="Reverb"
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
                                label="Delay"
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
                                label="Distortion"
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
                                label="Chorus"
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
                                label="Phaser"
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
                                label="Bitcrusher"
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
                {/* Keyboard */}
                {/* White keys container */}
                <div className="absolute inset-0 h-full flex w-full">
                  {whiteKeys.map((note) => (
                    <div key={note} className="flex-1 relative">
                      <PianoKey
                        note={note}
                        isPressed={pressedNotes[note]}
                        onPointerDownKey={(n, e) => {
                          e.preventDefault();
                          const existing = activePointersRef.current[e.pointerId];
                          if (existing && existing !== n) {
                            releaseNote(existing);
                          }
                          pressNote(n);
                          setActivePointers((prev) => ({ ...prev, [e.pointerId]: n }));
                        }}
                        onPointerEnterKey={(n, e) => {
                          const isMousePrimaryDown = (e.pointerType === 'mouse') && ((e.buttons & 1) === 1);
                          const isTouchActive = e.pointerType === 'touch' && activePointersRef.current[e.pointerId] !== undefined;
                          if (!isMousePrimaryDown && !isTouchActive) return;
                          const current = activePointersRef.current[e.pointerId];
                          if (current !== n) {
                            if (current) {
                              releaseNote(current);
                            }
                            pressNote(n);
                            setActivePointers((prev) => ({ ...prev, [e.pointerId]: n }));
                          }
                        }}
                        onPointerUpKey={(n, e) => {
                          const current = activePointersRef.current[e.pointerId];
                          if (current) {
                            releaseNote(current);
                            setActivePointers((prev) => {
                              const copy = { ...prev } as Record<number, string>;
                              delete copy[e.pointerId];
                              return copy;
                            });
                          } else {
                            // fallback
                            releaseNote(n);
                          }
                        }}
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
                              onPointerDownKey={(n, e) => {
                                e.preventDefault();
                                const existing = activePointersRef.current[e.pointerId];
                                if (existing && existing !== n) {
                                  releaseNote(existing);
                                }
                                pressNote(n);
                                setActivePointers((prev) => ({ ...prev, [e.pointerId]: n }));
                              }}
                              onPointerEnterKey={(n, e) => {
                                const isMousePrimaryDown = (e.pointerType === 'mouse') && ((e.buttons & 1) === 1);
                                const isTouchActive = e.pointerType === 'touch' && activePointersRef.current[e.pointerId] !== undefined;
                                if (!isMousePrimaryDown && !isTouchActive) return;
                                const current = activePointersRef.current[e.pointerId];
                                if (current !== n) {
                                  if (current) {
                                    releaseNote(current);
                                  }
                                  pressNote(n);
                                  setActivePointers((prev) => ({ ...prev, [e.pointerId]: n }));
                                }
                              }}
                              onPointerUpKey={(n, e) => {
                                const current = activePointersRef.current[e.pointerId];
                                if (current) {
                                  releaseNote(current);
                                  setActivePointers((prev) => {
                                    const copy = { ...prev } as Record<number, string>;
                                    delete copy[e.pointerId];
                                    return copy;
                                  });
                                } else {
                                  releaseNote(n);
                                }
                              }}
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
