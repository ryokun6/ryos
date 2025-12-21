import { useEffect, useRef, useState, useCallback } from "react";
import * as Tone from "tone";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { useVibration } from "./useVibration";

// Global synth instance and state
let globalSynthRef: {
  synth: Tone.PolySynth;
  filter: Tone.Filter;
  tremolo: Tone.Tremolo;
  reverb: Tone.Reverb;
} | null = null;
let lastUsedPreset = "classic"; // Default to classic, "off" will be handled
const DEFAULT_SYNTH_VOLUME = -12;

export type SynthPreset = {
  name: string;
  oscillator: {
    type: OscillatorType;
  };
  envelope: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
  effects: {
    filter: {
      frequency: number;
      rolloff: -12 | -24 | -48 | -96;
    };
    tremolo: {
      frequency: number;
      depth: number;
    };
    reverb: {
      decay: number;
      wet: number;
    };
  };
};

// Define valid oscillator types
type OscillatorType = "triangle" | "sine" | "square" | "sawtooth";

export const SYNTH_PRESETS: Record<string, SynthPreset> = {
  classic: {
    name: "Classic",
    oscillator: {
      type: "triangle",
    },
    envelope: {
      attack: 0.01,
      decay: 0.2,
      sustain: 0.2,
      release: 0.3,
    },
    effects: {
      filter: {
        frequency: 2000,
        rolloff: -12,
      },
      tremolo: {
        frequency: 0.8,
        depth: 0.3,
      },
      reverb: {
        decay: 1.5,
        wet: 0.7,
      },
    },
  },
  ethereal: {
    name: "Ethereal",
    oscillator: {
      type: "sine",
    },
    envelope: {
      attack: 0.1,
      decay: 0.4,
      sustain: 0.4,
      release: 0.8,
    },
    effects: {
      filter: {
        frequency: 3000,
        rolloff: -24,
      },
      tremolo: {
        frequency: 0.5,
        depth: 0.5,
      },
      reverb: {
        decay: 2.5,
        wet: 0.8,
      },
    },
  },
  digital: {
    name: "Digital",
    oscillator: {
      type: "square",
    },
    envelope: {
      attack: 0.005,
      decay: 0.1,
      sustain: 0.1,
      release: 0.1,
    },
    effects: {
      filter: {
        frequency: 4000,
        rolloff: -12,
      },
      tremolo: {
        frequency: 1.2,
        depth: 0.2,
      },
      reverb: {
        decay: 0.8,
        wet: 0.3,
      },
    },
  },
  retro: {
    name: "Retro",
    oscillator: {
      type: "sawtooth",
    },
    envelope: {
      attack: 0.02,
      decay: 0.3,
      sustain: 0.3,
      release: 0.4,
    },
    effects: {
      filter: {
        frequency: 1500,
        rolloff: -24,
      },
      tremolo: {
        frequency: 0.6,
        depth: 0.4,
      },
      reverb: {
        decay: 1.2,
        wet: 0.5,
      },
    },
  },
  off: {
    name: "Off",
    oscillator: {
      type: "sine", // Type doesn't matter much if volume is off
    },
    envelope: {
      // Minimal envelope
      attack: 0.001,
      decay: 0.001,
      sustain: 0,
      release: 0.001,
    },
    effects: {
      // Minimal effects
      filter: {
        frequency: 100, // Low frequency
        rolloff: -12,
      },
      tremolo: {
        frequency: 0, // No tremolo
        depth: 0,
      },
      reverb: {
        decay: 0, // No reverb
        wet: 0,
      },
    },
  },
};

// Pentatonic scale for an exotic jungle feel
const notes = ["C4", "D4", "F4", "G4", "A4", "C5", "D5"];
const minTimeBetweenNotes = 0.09; // Minimum interval between notes
const VOICE_COUNT = 16; // Adjusted voice count for balance

// Helper function to create the synth and effects chain
function createSynthInstance(presetKey: string) {
  const preset = SYNTH_PRESETS[presetKey];
  if (!preset) {
    console.error(`Preset ${presetKey} not found. Defaulting to classic.`);

    presetKey = "classic";
  }

  const filter = new Tone.Filter({
    frequency: preset.effects.filter.frequency,
    type: "lowpass",
    rolloff: preset.effects.filter.rolloff,
  }).toDestination();

  const tremolo = new Tone.Tremolo({
    frequency: preset.effects.tremolo.frequency,
    depth: preset.effects.tremolo.depth,
  })
    .connect(filter)
    .start();

  const reverb = new Tone.Reverb({
    decay: preset.effects.reverb.decay,
    wet: preset.effects.reverb.wet,
  }).connect(tremolo);

  // Apply global chat synth volume (linear 0-1) as decibel offset
  const masterVol = useAudioSettingsStore.getState().chatSynthVolume ?? 1;
  const globalMasterVolume = useAudioSettingsStore.getState().masterVolume ?? 1;
  const combinedVolume = masterVol * globalMasterVolume; // Combine volumes
  const volumeDb =
    presetKey === "off"
      ? -Infinity
      : combinedVolume === 0
      ? -Infinity
      : DEFAULT_SYNTH_VOLUME + 20 * Math.log10(combinedVolume);

  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: preset.oscillator,
    envelope: preset.envelope,
    volume: volumeDb,
  });
  synth.maxPolyphony = VOICE_COUNT;
  synth.connect(reverb);

  // Return the synth and effects nodes for potential disposal
  return { synth, filter, tremolo, reverb };
}

export function useChatSynth() {
  const [isAudioReady, setIsAudioReady] = useState(false);
  // Global preset from audio settings store
  const synthPreset = useAudioSettingsStore((s) => s.synthPreset);
  const setSynthPreset = useAudioSettingsStore((s) => s.setSynthPreset);

  const [currentPresetKey, setCurrentPresetKey] = useState<string>(
    () => synthPreset || "classic" // Default to classic if store is null
  );
  const synthRef = useRef<{
    synth: Tone.PolySynth;
    filter: Tone.Filter;
    tremolo: Tone.Tremolo;
    reverb: Tone.Reverb;
  } | null>(null);
  const lastNoteTimeRef = useRef(0);
  const isInitializingRef = useRef(false);
  const vibrate = useVibration(50, 30);

  // Initialize Tone.js context and create the synth instance
  const initializeAudio = useCallback(async () => {
    // If the underlying AudioContext was closed (iOS tends to do this when the
    // tab is backgrounded for a while) we need a completely fresh Tone
    // context. Tone.start() below will create it, but any cached synth nodes
    // attached to the old context will be invalid – so drop them first.
    if (Tone.context.state === "closed") {
      try {
        // Reset Tone with a brand-new context; this call is available at runtime but
        // may not be typed in older versions of @types/tone.
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        Tone.setContext(new Tone.Context());
        globalSynthRef = null;
        synthRef.current = null;
        setIsAudioReady(false);
        console.debug("AudioContext was closed – recreated new Tone context");
      } catch (err) {
        console.error("Failed to reset Tone context:", err);
      }
    }

    if (globalSynthRef && !synthRef.current) {
      console.log("Reusing existing synth instance...");
      synthRef.current = globalSynthRef;
      synthRef.current.filter.toDestination();

      setIsAudioReady(true);
      return;
    }

    // Prevent concurrent initializations. If we *think* we are ready but the
    // context is not running anymore, force a re-initialization.
    if (isAudioReady && Tone.context.state !== "running") {
      setIsAudioReady(false);
    }

    if (
      isInitializingRef.current ||
      (isAudioReady && Tone.context.state === "running")
    ) {
      if (Tone.context.state === "running" && !isAudioReady) {
        setIsAudioReady(true); // Already running, just update state
      }
      if (
        Tone.context.state === "running" &&
        !synthRef.current &&
        currentPresetKey !== "off"
      ) {
        // Don't create if "off"
        // Context running but synth lost (e.g., HMR without full reload), recreate synth
        console.log("Audio context running, recreating synth...");
        synthRef.current = createSynthInstance(currentPresetKey);
        setIsAudioReady(true);
      }
      return;
    }
    isInitializingRef.current = true;

    try {
      console.log("Attempting to start Tone.js...");
      await Tone.start();
      console.log("Tone.js started successfully. State:", Tone.context.state);

      // Ensure context is running before creating synth
      if (Tone.context.state === "running") {
        if (!synthRef.current && currentPresetKey !== "off") {
          // Don't create if "off"
          synthRef.current = createSynthInstance(currentPresetKey);
        }
        setIsAudioReady(true);
        console.log("Audio ready, synth created.");
      } else {
        console.warn("Tone.js context did not start or is suspended.");
        // Attempt to resume the context and recreate synth if successful
        if (Tone.context.state === "suspended") {
          await Tone.context.resume();
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore – Tone.context.state may still be 'running' after resume()
          if (Tone.context.state === "running") {
            if (!synthRef.current && currentPresetKey !== "off") {
              // Don't create if "off"
              synthRef.current = createSynthInstance(currentPresetKey);
            }
            setIsAudioReady(true);
            console.log("Audio resumed and ready.");
          } else {
            console.error("Failed to resume Tone.js context.");
          }
        }
      }
    } catch (error) {
      console.error("Error initializing Tone.js:", error);
      setIsAudioReady(false); // Explicitly set to false on error
    } finally {
      isInitializingRef.current = false;
    }
  }, [isAudioReady, currentPresetKey]); // Add currentPresetKey dependency

  // Effect to handle initial audio setup via user interaction
  useEffect(() => {
    // Attempt initialization immediately if context might already be running
    // Check if the context is in a state where it *could* become running
    if (
      Tone.context.state === "running" ||
      Tone.context.state === "suspended"
    ) {
      initializeAudio();
    }

    const handleInteraction = () => {
      initializeAudio();
      // Clean up listeners after first interaction
      window.removeEventListener("click", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
    };

    // Add listeners if not already initialized
    if (!isAudioReady) {
      window.addEventListener("click", handleInteraction, { once: true });
      window.addEventListener("keydown", handleInteraction, { once: true });
    }

    return () => {
      window.removeEventListener("click", handleInteraction);
      window.removeEventListener("keydown", handleInteraction);
    };
  }, [initializeAudio, isAudioReady]); // Depend on initializeAudio and isAudioReady

  // Effect to handle visibility change and window focus
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (Tone.context.state !== "running") {
          initializeAudio();
        }
      }
    };

    const handleFocus = () => {
      if (Tone.context.state !== "running") {
        initializeAudio();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [initializeAudio]);

  // Effect to handle preset changes when reusing synth
  useEffect(() => {
    if (synthRef.current && lastUsedPreset !== currentPresetKey) {
      console.log(
        `Applying preset change from ${lastUsedPreset} to ${currentPresetKey}`
      );
      lastUsedPreset = currentPresetKey;
    }
  }, [currentPresetKey]);

  // ---------------------------------------------------------------------------
  // Persist the current synth instance when the hook UNMOUNTS to allow reuse
  // across Hot-Module Reloads or component remounts. We intentionally *do not*
  // disconnect the filter here when presets change, because doing so would
  // sever the audio signal path and silence the synth after a preset switch.
  // By providing an empty dependency array, this cleanup only runs on a real
  // unmount – not whenever `currentPresetKey` updates.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (synthRef.current) {
        console.log("Storing synth for reuse on unmount...");
        globalSynthRef = synthRef.current;
        // lastUsedPreset = currentPresetKey; // lastUsedPreset updated in changePreset
        // Do NOT disconnect the filter here; we want the synth to remain
        // functional if it gets re-attached later.
      }
    };
  }, []);

  // Function to change the synth preset
  const changePreset = useCallback(
    (newPresetKey: string) => {
      if (!SYNTH_PRESETS[newPresetKey]) {
        console.error(`Invalid preset key: ${newPresetKey}`);
        return;
      }

      if (newPresetKey === currentPresetKey) {
        // If preset is already "off" but synth volume isn't -Infinity (e.g. after HMR), force it.
        if (
          newPresetKey === "off" &&
          synthRef.current &&
          synthRef.current.synth.volume.value !== -Infinity
        ) {
          try {
            synthRef.current.synth.volume.value = -Infinity;
            console.log("Forcing 'Off' preset volume to -Infinity");
          } catch (error) {
            console.error("Error setting volume to -Infinity:", error);
          }
        }
        return;
      }

      console.log("Changing preset to", newPresetKey);

      // Safely dispose of existing synth
      if (synthRef.current) {
        try {
          // Stop all active notes first
          synthRef.current.synth.releaseAll();

          // Disconnect and dispose in reverse order of creation
          if (synthRef.current.filter) {
            synthRef.current.filter.disconnect();
            synthRef.current.filter.dispose();
          }
          if (synthRef.current.tremolo) {
            synthRef.current.tremolo.dispose();
          }
          if (synthRef.current.reverb) {
            synthRef.current.reverb.dispose();
          }
          if (synthRef.current.synth) {
            synthRef.current.synth.dispose();
          }
        } catch (error) {
          console.error("Error disposing synth components:", error);
        }

        synthRef.current = null;
      }

      // Create new synth instance if audio is ready
      if (isAudioReady) {
        try {
          synthRef.current = createSynthInstance(newPresetKey);
        } catch (error) {
          console.error("Error creating new synth instance:", error);
          synthRef.current = null;
        }
      } else if (newPresetKey === "off") {
        synthRef.current = null;
      }

      // Update global references and state
      globalSynthRef = synthRef.current;
      lastUsedPreset = newPresetKey;
      setCurrentPresetKey(newPresetKey);
      setSynthPreset(newPresetKey); // Persist to global store
    },
    [currentPresetKey, isAudioReady, setSynthPreset]
  );

  // ---------------------------------------------------------------------------
  // Sync with global store changes
  // If the synthPreset value in the global store changes (e.g. via Control
  // Panels), automatically apply the new preset without requiring a full
  // application reload. This keeps the Chat synth in-sync across the whole app.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (synthPreset && synthPreset !== currentPresetKey) {
      changePreset(synthPreset);
    }
    // We intentionally leave changePreset out of the dependency list to avoid
    // re-creating the callback; it is memoised and stable for the lifetime of
    // the hook, and including it could cause unnecessary effect executions.
  }, [synthPreset, currentPresetKey, changePreset]);

  // Function to play a note
  const playNote = useCallback(() => {
    // Ensure audio is ready and synth exists
    if (
      !isAudioReady ||
      !synthRef.current ||
      Tone.context.state !== "running" ||
      currentPresetKey === "off"
    ) {
      // Attempt to re-initialize if needed (e.g., context suspended)
      if (
        Tone.context.state !== "running" &&
        !isInitializingRef.current &&
        currentPresetKey !== "off"
      ) {
        console.warn("Audio context not running. Attempting to initialize...");
        initializeAudio();
      }
      return;
    }

    const { synth } = synthRef.current;

    // Additional check for "off" preset or muted volume
    if (currentPresetKey === "off" || synth.volume.value === -Infinity) {
      // console.debug("Skipping note: Synth is off or muted.");
      return;
    }

    // Check active voices against the defined VOICE_COUNT
    // @ts-expect-error - Accessing internal _voices property which is not in type definitions
    const activeVoices = synth._voices?.length || 0; // Access internal _voices array if available
    if (activeVoices >= VOICE_COUNT) {
      console.debug(`Skipping note: Voice limit (${VOICE_COUNT}) reached.`);
      return;
    }

    const now = Tone.now();
    if (now - lastNoteTimeRef.current >= minTimeBetweenNotes) {
      const noteToPlay = notes[Math.floor(Math.random() * notes.length)];
      try {
        // Use a short duration like '32n' or '64n' for plucky sounds
        synth.triggerAttackRelease(noteToPlay, "32n", now);
        vibrate(); // Trigger vibration
        lastNoteTimeRef.current = now;
      } catch (error) {
        // This catch might be less necessary with the active voice check, but kept for safety
        console.debug("Skipping note due to timing or error:", error);
      }
    } else {
      //console.debug("Skipping note: Minimum time between notes not met.");
    }
  }, [isAudioReady, vibrate, initializeAudio]); // Add initializeAudio dependency

  // ---------------------------------------------------------------
  // Reactively update synth volume when the global chatSynthVolume
  // slider changes, without requiring a re-creation of the synth.
  // ---------------------------------------------------------------
  const chatSynthVolume = useAudioSettingsStore((s) => s.chatSynthVolume);
  const masterVolume = useAudioSettingsStore((s) => s.masterVolume);

  useEffect(() => {
    if (synthRef.current) {
      const combinedVolume = chatSynthVolume * masterVolume; // Combine volumes
      const volDb =
        combinedVolume === 0
          ? -Infinity
          : DEFAULT_SYNTH_VOLUME + 20 * Math.log10(combinedVolume);
      synthRef.current.synth.volume.value = volDb;
    }
  }, [chatSynthVolume, masterVolume]); // Add masterVolume to dependencies

  return {
    playNote,
    currentPreset: currentPresetKey,
    changePreset,
    isAudioReady,
  };
}

// Note: The createSynth function is now inlined as createSynthInstance
// and returns the nodes for disposal.
// The volume is set directly in the PolySynth constructor options.
