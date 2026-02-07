import { useState, useRef, useEffect, useCallback } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import * as Tone from "tone";
import {
  useSynthStore,
  type SynthPreset,
} from "@/stores/useSynthStore";
import { useSound, Sounds } from "@/hooks/useSound";
import { useLatestRef } from "@/hooks/useLatestRef";
import { useThemeStore } from "@/stores/useThemeStore";
import { useTranslation } from "react-i18next";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { helpItems } from "..";

// Define oscillator type
type OscillatorType = "sine" | "square" | "triangle" | "sawtooth";

interface UseSynthLogicOptions {
  isWindowOpen: boolean;
  isForeground?: boolean;
}

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

export const useSynthLogic = ({
  isWindowOpen,
  isForeground = true,
}: UseSynthLogicOptions) => {
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
  // Track if Tone.js AudioContext has been started (required for Safari)
  const toneStartedRef = useRef(false);
  // Track in-flight synth node creation to avoid concurrent init
  const synthInitPromiseRef = useRef<Promise<void> | null>(null);
  // Track the exact shifted note triggered for each base note to ensure proper release
  const activeShiftedNotesRef = useRef<Record<string, string>>({});
  // Track pressed state synchronously for async init timing
  const pressedNotesRef = useRef<Record<string, boolean>>({});
  // Track latest press IDs to drop stale async completions
  const notePressIdRef = useRef<Record<string, number>>({});
  // Avoid concurrent init races
  const initPromiseRef = useRef<Promise<boolean> | null>(null);
  // Track the most recent note pressed while init is in flight
  const pendingInitNoteRef = useRef<string | null>(null);
  // Track notes released before synth was ready
  const releasedBeforeInitRef = useRef<Set<string>>(new Set());
  // Ref for the keyboard container to scope pointermove
  const keyboardContainerRef = useRef<HTMLDivElement | null>(null);

  // UI state
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isPresetDialogOpen, setIsPresetDialogOpen] = useState(false);
  const [isSavingNewPreset, setIsSavingNewPreset] = useState(true);
  const [presetName, setPresetName] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isControlsVisible, setIsControlsVisible] = useState(false);

  // Use labelType and preset state from persisted store
  const {
    labelType,
    setLabelType,
    presets,
    setPresets,
    currentPreset,
    setCurrentPreset,
    currentOctave,
    setCurrentOctave,
    currentVolume,
    setSustainedNotes,
  } = useSynthStore();
  const octaveOffset = currentOctave;
  const setOctaveOffset = setCurrentOctave;
  // Always read the latest octave offset inside keyboard handlers
  const octaveOffsetRef = useLatestRef(octaveOffset);

  // Ref to keep the latest foreground state for global event handlers
  const isForegroundRef = useLatestRef(isForeground);

  // Default presets are now defined in the store

  // Presets and currentPreset are now loaded from persisted Zustand store

  const [pressedNotes, setPressedNotes] = useState<Record<string, boolean>>({});
  // Active pointerId -> note mapping for unified mouse/touch handling
  // State is kept in sync with ref for potential future use; ref is read for immediate access
  const [, setActivePointers] = useState<Record<number, string>>({});
  const activePointersRef = useRef<Record<number, string>>({});
  // Use UI sound for interface feedback
  const { play } = useSound(Sounds.CLICK);
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("synth", helpItems);
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const isSystem7Theme = currentTheme === "system7";
  const isClassicTheme = currentTheme === "macosx" || isXpTheme;
  const isMacOSTheme = currentTheme === "macosx";

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
  }, [isWindowOpen]);

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

  // Use labelType from persisted store

  // Track if synth nodes have been created (needed for deferred init on iOS)
  const synthInitializedRef = useRef(false);

  // Initialize synth and effects - extracted so it can be called on demand
  const createSynthNodes = useCallback(async () => {
    const currentSynth = synthRef.current as
      | { disposed?: boolean }
      | null;
    if (currentSynth?.disposed) {
      synthRef.current = null;
      synthInitializedRef.current = false;
    }
    if (synthInitializedRef.current || synthRef.current) return;
    if (synthInitPromiseRef.current) return synthInitPromiseRef.current;

    synthInitPromiseRef.current = (async () => {
      if (synthInitializedRef.current || synthRef.current) return;

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
      const gain = new Tone.Gain(currentPreset.effects.gain * currentVolume);
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
        bits: Math.floor(
          4 + (1 - (currentPreset.effects.bitcrusher ?? 0)) * 12
        ),
      });
      // Add a boost gain before analyzer for better visualization
      const analyzerBoost = new Tone.Gain(4);
      const analyzer = new Tone.Analyser({
        type: "waveform",
        size: 1024,
        smoothing: 0.8,
      });

      // Connect effects chain
      // On mobile Safari, effects chain can block audio - use simplified chain
      const isMobileSafari =
        /iPad|iPhone|iPod/.test(navigator.userAgent) &&
        !("MSStream" in window);

      if (isMobileSafari) {
        // Simplified chain for mobile Safari: synth → gain → destination
        // Full effects chain can block audio on iOS Safari
        synth.connect(gain);
        gain.connect(analyzerBoost);
        analyzerBoost.connect(analyzer);
        gain.connect(Tone.Destination);
      } else {
        // Full effects chain for desktop
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

        // Wait for reverb to be ready (it generates impulse response async)
        await reverb.ready.catch(() => {});
      }

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
      synthInitializedRef.current = true;
    })();

    try {
      await synthInitPromiseRef.current;
    } finally {
      synthInitPromiseRef.current = null;
    }
  }, [currentPreset, currentVolume]);

  // Initialize synth and effects on window open
  useEffect(() => {
    if (!isWindowOpen) return;
    let disposed = false;

    const initSynth = async () => {
      if (disposed) return;
      // Only create nodes if context is already running (user gesture occurred)
      // Otherwise, defer creation to first key press via ensureToneStarted
      if (Tone.context.state === "running") {
        toneStartedRef.current = true;
        await createSynthNodes();
      }
    };

    initSynth();

    // Add keyboard event handlers
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);

    return () => {
      disposed = true;
      synthInitializedRef.current = false;
      initPromiseRef.current = null;
      synthInitPromiseRef.current = null;

      const synth = synthRef.current;
      synthRef.current = null;
      synth?.dispose();

      const reverb = reverbRef.current;
      reverbRef.current = null;
      reverb?.dispose();

      const delay = delayRef.current;
      delayRef.current = null;
      delay?.dispose();

      const distortion = distortionRef.current;
      distortionRef.current = null;
      distortion?.dispose();

      const chorus = chorusRef.current;
      chorusRef.current = null;
      chorus?.dispose();

      const phaser = phaserRef.current;
      phaserRef.current = null;
      phaser?.dispose();

      const bitcrusher = bitcrusherRef.current;
      bitcrusherRef.current = null;
      bitcrusher?.dispose();

      const gain = gainRef.current;
      gainRef.current = null;
      gain?.dispose();

      const analyzer = analyzerRef.current;
      analyzerRef.current = null;
      analyzer?.dispose();
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
    gainRef.current.gain.value = preset.effects.gain * currentVolume;

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

  useEffect(() => {
    if (!gainRef.current) return;
    gainRef.current.gain.value = currentPreset.effects.gain * currentVolume;
  }, [currentPreset.effects.gain, currentVolume]);

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

  // Ensure Tone.js AudioContext is started (required for Safari)
  const ensureToneStarted = useCallback(async () => {
    if (toneStartedRef.current && synthRef.current) return true;
    if (initPromiseRef.current) {
      const ctxState = Tone.context?.state ?? null;
      const rawCtxState =
        (Tone.context as unknown as { rawContext?: { state?: string } })
          ?.rawContext?.state ?? null;
      const isRunning = ctxState === "running" || rawCtxState === "running";
      if (!isRunning) {
        initPromiseRef.current = null;
      } else {
        return initPromiseRef.current;
      }
    }

    initPromiseRef.current = (async () => {
      try {
        await Tone.start();
        toneStartedRef.current = true;
        // Create synth nodes if they weren't created during init (iOS Safari deferred case)
        if (!synthRef.current) {
          await createSynthNodes();
        }
        return !!synthRef.current;
      } catch (err) {
        console.error("[Synth] Failed to start Tone.js:", err);
        return false;
      }
    })();

    try {
      const result = await initPromiseRef.current;
      let pendingPressed = false;
      if (result && pendingInitNoteRef.current && synthRef.current) {
        const initNote = pendingInitNoteRef.current;
        pendingInitNoteRef.current = null;
        const wasReleasedBeforeInit = releasedBeforeInitRef.current.has(
          initNote
        );
        if (wasReleasedBeforeInit) {
          releasedBeforeInitRef.current.delete(initNote);
        }
        pendingPressed = !!pressedNotesRef.current[initNote];
        if (pendingPressed && !wasReleasedBeforeInit) {
          if (!activeShiftedNotesRef.current[initNote]) {
            const shifted = shiftNoteByOctave(
              initNote,
              octaveOffsetRef.current
            );
            const now = Tone.context.currentTime;
            activeShiftedNotesRef.current[initNote] = shifted;
            synthRef.current.triggerAttack(shifted, now);
          }
        } else if (wasReleasedBeforeInit) {
          const shifted = shiftNoteByOctave(initNote, octaveOffsetRef.current);
          const now = Tone.context.currentTime;
          // Provide short feedback for quick tap during init without getting stuck
          synthRef.current.triggerAttackRelease(shifted, 0.08, now);
        }
      }
      return result;
    } finally {
      initPromiseRef.current = null;
    }
  }, [createSynthNodes]);

  // Kick off audio init on any first interaction in the synth window
  useEffect(() => {
    if (!isWindowOpen) return;
    const handleInteraction = () => {
      void ensureToneStarted();
    };
    window.addEventListener("touchstart", handleInteraction, { once: true });
    window.addEventListener("pointerdown", handleInteraction, { once: true });
    window.addEventListener("click", handleInteraction, { once: true });
    return () => {
      window.removeEventListener("touchstart", handleInteraction);
      window.removeEventListener("pointerdown", handleInteraction);
      window.removeEventListener("click", handleInteraction);
    };
  }, [isWindowOpen, ensureToneStarted]);

  // Note press/release handlers
  const pressNote = useCallback(
    async (note: string) => {
      const needsInit = !toneStartedRef.current || !synthRef.current;
      const nextId = (notePressIdRef.current[note] ?? 0) + 1;
      notePressIdRef.current[note] = nextId;

      pressedNotesRef.current[note] = true;
      setPressedNotes((prev) => ({ ...prev, [note]: true }));
      setSustainedNotes((prev) => {
        const next = new Set(prev);
        next.add(note);
        return next;
      });

      // Start Tone.js AudioContext on first interaction (required for Safari)
      // This also creates synth nodes if they were deferred
      if (needsInit) {
        pendingInitNoteRef.current = note;
      }
      if (!(await ensureToneStarted())) return;
      if (!synthRef.current) return;

      if (needsInit) return;

      // Drop stale press if another press happened while we awaited init
      if (notePressIdRef.current[note] !== nextId) return;

      const shiftedNote = shiftNoteByOctave(note, octaveOffsetRef.current);
      const now = Tone.context.currentTime;

      if (pressedNotesRef.current[note]) {
        // Only attack if not already active
        if (!activeShiftedNotesRef.current[note]) {
          activeShiftedNotesRef.current[note] = shiftedNote;
          synthRef.current.triggerAttack(shiftedNote, now);
        }
        return;
      }

      // If the user released before init finished, play a short tap for feedback
      synthRef.current.triggerAttackRelease(shiftedNote, 0.08, now);
    },
    [ensureToneStarted, setSustainedNotes]
  );

  const releaseNote = useCallback((note: string) => {
    pressedNotesRef.current[note] = false;
    setPressedNotes((prev) => ({ ...prev, [note]: false }));
    setSustainedNotes((prev) => {
      const next = new Set(prev);
      next.delete(note);
      return next;
    });

    if (!synthRef.current) {
      releasedBeforeInitRef.current.add(note);
    }

    const shiftedNote =
      activeShiftedNotesRef.current[note] ??
      shiftNoteByOctave(note, octaveOffsetRef.current);

    if (synthRef.current && activeShiftedNotesRef.current[note]) {
      const now = Tone.context.currentTime;
      synthRef.current.triggerRelease(shiftedNote, now);
    }
    delete activeShiftedNotesRef.current[note];
  }, [setSustainedNotes]);

  // Release all currently active notes regardless of current octave or sources
  const releaseAllNotes = useCallback(() => {
    pressedNotesRef.current = {};
    setSustainedNotes(new Set());

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
  }, [setSustainedNotes]);

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
      showStatus(t("apps.synth.status.presetSaved", { name }));
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
      showStatus(t("apps.synth.status.presetUpdated", { name }));
    }
    setIsPresetDialogOpen(false);
  };

  const loadPreset = (preset: SynthPreset) => {
    setCurrentPreset(preset);
    updateSynthParams(preset);
    showStatus(t("apps.synth.status.presetLoaded", { name: preset.name }));
    play();
  };

  const loadPresetById = (id: string) => {
    const preset = presets.find((item) => item.id === id);
    if (preset) {
      loadPreset(preset);
    }
  };

  const resetSynth = () => {
    // Reset the store to defaults
    useSynthStore.getState().reset();
    const newPreset = useSynthStore.getState().currentPreset;
    // Apply the freshly reset preset immediately
    updateSynthParams(newPreset);

    // Store updates handled automatically by Zustand

    showStatus(t("apps.synth.status.synthResetToDefaults"));
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
    const updatedPresets = presets.map((preset) =>
      preset.id === updatedPreset.id ? updatedPreset : preset
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
    const updatedPresets = presets.map((preset) =>
      preset.id === updatedPreset.id ? updatedPreset : preset
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
    const updatedPresets = presets.map((preset) =>
      preset.id === updatedPreset.id ? updatedPreset : preset
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
        showStatus(t("apps.synth.status.octave", { offset: newOffset }));
        return newOffset;
      });
    } else if (e.key === "=" || e.key === "+") {
      e.preventDefault();
      setOctaveOffset((prevOffset) => {
        const newOffset = Math.min(2, prevOffset + 1);
        showStatus(t("apps.synth.status.octave", { offset: newOffset }));
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
      void pressNote(note);
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
        // Update ref synchronously, then state
        delete activePointersRef.current[pointerId];
        setActivePointers((prev) => {
          const copy = { ...prev };
          delete copy[pointerId];
          return copy;
        });
      }
    };

    // Handle pointer move for reliable touch swiping (glissando)
    // pointerenter doesn't fire reliably on fast touch swipes
    const handlePointerMove = (e: PointerEvent) => {
      // Only track active touches (not hover)
      const currentNote = activePointersRef.current[e.pointerId];
      if (currentNote === undefined) return; // Not an active touch/drag

      // Find which element is under the pointer
      const elementUnder = document.elementFromPoint(e.clientX, e.clientY);
      if (!elementUnder) {
        // Pointer left the document - release note
        if (currentNote) {
          releaseNote(currentNote);
          delete activePointersRef.current[e.pointerId];
          setActivePointers((prev) => {
            const copy = { ...prev };
            delete copy[e.pointerId];
            return copy;
          });
        }
        return;
      }

      // Find the piano key element (button with data-note attribute)
      const keyElement = elementUnder.closest("button[data-note]");
      const newNote = keyElement?.getAttribute("data-note") || null;

      // Check if pointer is still within keyboard container
      const keyboardContainer = keyboardContainerRef.current;
      const isInKeyboard = keyboardContainer?.contains(elementUnder);

      if (!isInKeyboard || !newNote) {
        // Pointer left keyboard area - release current note
        if (currentNote) {
          releaseNote(currentNote);
          delete activePointersRef.current[e.pointerId];
          setActivePointers((prev) => {
            const copy = { ...prev };
            delete copy[e.pointerId];
            return copy;
          });
        }
        return;
      }

      // Switch to new note if different
      if (newNote !== currentNote) {
        if (currentNote) {
          releaseNote(currentNote);
        }
        void pressNote(newNote);
        // Update ref synchronously for next pointermove
        activePointersRef.current[e.pointerId] = newNote;
        setActivePointers((prev) => ({ ...prev, [e.pointerId]: newNote }));
      }
    };

    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    window.addEventListener("pointermove", handlePointerMove);
    return () => {
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, [isWindowOpen, releaseNote, pressNote]);

  const toggleControls = () => {
    setIsControlsVisible((prev) => !prev);
  };

  const handleOctaveDown = () => {
    setOctaveOffset((prev) => {
      const next = Math.max(-2, prev - 1);
      showStatus(t("apps.synth.status.octave", { offset: next }));
      return next;
    });
  };

  const handleOctaveUp = () => {
    setOctaveOffset((prev) => {
      const next = Math.min(2, prev + 1);
      showStatus(t("apps.synth.status.octave", { offset: next }));
      return next;
    });
  };

  const handlePointerDown = useCallback(
    (note: string, e: ReactPointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      const existing = activePointersRef.current[e.pointerId];
      if (existing && existing !== note) {
        releaseNote(existing);
      }
      void pressNote(note);
      // Update ref synchronously for pointermove handler
      activePointersRef.current[e.pointerId] = note;
      setActivePointers((prev) => ({ ...prev, [e.pointerId]: note }));
    },
    [pressNote, releaseNote]
  );

  const handlePointerEnter = useCallback(
    (note: string, e: ReactPointerEvent<HTMLButtonElement>) => {
      const isMousePrimaryDown =
        e.pointerType === "mouse" && (e.buttons & 1) === 1;
      const isTouchActive =
        e.pointerType === "touch" &&
        activePointersRef.current[e.pointerId] !== undefined;
      if (!isMousePrimaryDown && !isTouchActive) return;
      const current = activePointersRef.current[e.pointerId];
      if (current !== note) {
        if (current) {
          releaseNote(current);
        }
        void pressNote(note);
        activePointersRef.current[e.pointerId] = note;
        setActivePointers((prev) => ({ ...prev, [e.pointerId]: note }));
      }
    },
    [pressNote, releaseNote]
  );

  const handlePointerUp = useCallback(
    (note: string, e: ReactPointerEvent<HTMLButtonElement>) => {
      const current = activePointersRef.current[e.pointerId];
      if (current) {
        releaseNote(current);
        delete activePointersRef.current[e.pointerId];
        setActivePointers((prev) => {
          const copy = { ...prev } as Record<number, string>;
          delete copy[e.pointerId];
          return copy;
        });
      } else {
        // fallback
        releaseNote(note);
      }
    },
    [releaseNote]
  );

  return {
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
  };
};
