import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface SynthPreset {
  id: string;
  name: string;
  oscillator: {
    type: "sine" | "square" | "triangle" | "sawtooth";
  };
  envelope: {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
  };
  effects: {
    reverb: number;
    delay: number;
    distortion: number;
    gain: number;
    chorus?: number;
    phaser?: number;
    bitcrusher?: number;
  };
}

export type NoteLabelType = "note" | "key" | "off";

// Default presets to use if nothing in localStorage
const defaultPresets: SynthPreset[] = [
  {
    id: "default",
    name: "Synth",
    oscillator: {
      type: "sine",
    },
    envelope: {
      attack: 0.01,
      decay: 0.2,
      sustain: 0.5,
      release: 1,
    },
    effects: {
      reverb: 0.2,
      delay: 0.2,
      distortion: 0,
      gain: 0.8,
      chorus: 0,
      phaser: 0,
      bitcrusher: 0,
    },
  },
  {
    id: "piano",
    name: "Piano",
    oscillator: {
      type: "sine",
    },
    envelope: {
      attack: 0.01,
      decay: 0.3,
      sustain: 0.1,
      release: 0.5,
    },
    effects: {
      reverb: 0.4,
      delay: 0.1,
      distortion: 0,
      gain: 0.7,
      chorus: 0.2,
      phaser: 0,
      bitcrusher: 0,
    },
  },
  {
    id: "analog-pad",
    name: "Pad",
    oscillator: {
      type: "triangle",
    },
    envelope: {
      attack: 0.01,
      decay: 0.3,
      sustain: 0.7,
      release: 2,
    },
    effects: {
      reverb: 0.6,
      delay: 0.3,
      distortion: 0,
      gain: 0.6,
      chorus: 0.4,
      phaser: 0,
      bitcrusher: 0,
    },
  },
  {
    id: "digital-lead",
    name: "Lead",
    oscillator: {
      type: "sawtooth",
    },
    envelope: {
      attack: 0.02,
      decay: 0.6,
      sustain: 0.5,
      release: 0.5,
    },
    effects: {
      reverb: 0.5,
      delay: 0.25,
      distortion: 0.0,
      gain: 0.2,
      chorus: 0.1,
      phaser: 0.1,
      bitcrusher: 0.4,
    },
  },
];

interface SynthStoreState {
  presets: SynthPreset[];
  currentPreset: SynthPreset;
  labelType: NoteLabelType;
  currentOctave: number;
  currentVolume: number;
  sustainedNotes: Set<string>;
  setPresets: (
    presets: SynthPreset[] | ((prev: SynthPreset[]) => SynthPreset[])
  ) => void;
  setCurrentPreset: (preset: SynthPreset) => void;
  setLabelType: (type: NoteLabelType) => void;
  setCurrentOctave: (octave: number | ((prev: number) => number)) => void;
  setCurrentVolume: (volume: number | ((prev: number) => number)) => void;
  setSustainedNotes: (
    notes: Set<string> | ((prev: Set<string>) => Set<string>)
  ) => void;
  reset: () => void;
}

const STORE_VERSION = 1;
const STORE_NAME = "ryos:synth";

// Helper to get values from old localStorage keys
const getOldPresets = (): SynthPreset[] => {
  try {
    const savedPresetsStr = localStorage.getItem("synth-presets");
    if (!savedPresetsStr) return defaultPresets;

    const savedPresets = JSON.parse(savedPresetsStr);
    if (savedPresets && savedPresets.length > 0) {
      // Add default gain to presets that don't have it
      return savedPresets.map((preset: SynthPreset) => ({
        ...preset,
        effects: {
          ...preset.effects,
          gain: preset.effects.gain ?? 0.8,
          chorus: preset.effects.chorus ?? 0,
          phaser: preset.effects.phaser ?? 0,
          bitcrusher: preset.effects.bitcrusher ?? 0,
        },
      }));
    }
    return defaultPresets;
  } catch (error) {
    console.error("Error loading presets:", error);
    return defaultPresets;
  }
};

const getOldCurrentPreset = (): SynthPreset => {
  try {
    const savedCurrentPresetStr = localStorage.getItem("synth-current-preset");
    if (!savedCurrentPresetStr) return defaultPresets[0];

    const savedCurrentPreset = JSON.parse(savedCurrentPresetStr);
    const savedPresets = getOldPresets();
    
    if (
      savedCurrentPreset &&
      savedPresets.find((p) => p.id === savedCurrentPreset.id)
    ) {
      // Add default values for missing effects
      return {
        ...savedCurrentPreset,
        effects: {
          ...savedCurrentPreset.effects,
          gain: savedCurrentPreset.effects.gain ?? 0.8,
          chorus: savedCurrentPreset.effects.chorus ?? 0,
          phaser: savedCurrentPreset.effects.phaser ?? 0,
          bitcrusher: savedCurrentPreset.effects.bitcrusher ?? 0,
        },
      };
    }
    
    return savedPresets[0] || defaultPresets[0];
  } catch (error) {
    console.error("Error loading current preset:", error);
    return defaultPresets[0];
  }
};

const getOldLabelType = (): NoteLabelType => {
  try {
    const savedLabelType = localStorage.getItem("synth-label-type") as NoteLabelType;
    return savedLabelType || "off";
  } catch {
    return "off";
  }
};

export const useSynthStore = create<SynthStoreState>()(
  persist(
    (set) => ({
      presets: getOldPresets(),
      currentPreset: getOldCurrentPreset(),
      labelType: getOldLabelType(),
      currentOctave: 0,
      currentVolume: 1,
      sustainedNotes: new Set(),
      setPresets: (presetsOrFn) =>
        set((state) => {
          if (typeof presetsOrFn === "function") {
            return { presets: presetsOrFn(state.presets) };
          }
          return { presets: presetsOrFn };
        }),
      setCurrentPreset: (preset) => set({ currentPreset: preset }),
      setLabelType: (type) => set({ labelType: type }),
      setCurrentOctave: (octave) =>
        set((state) => ({
          currentOctave:
            typeof octave === "function" ? octave(state.currentOctave) : octave,
        })),
      setCurrentVolume: (volume) =>
        set((state) => ({
          currentVolume:
            typeof volume === "function" ? volume(state.currentVolume) : volume,
        })),
      setSustainedNotes: (notesOrFn) =>
        set((state) => {
          const nextNotes =
            typeof notesOrFn === "function"
              ? (notesOrFn as (prev: Set<string>) => Set<string>)(
                  state.sustainedNotes
                )
              : notesOrFn;
          return { sustainedNotes: nextNotes };
        }),
      reset: () =>
        set({
          presets: defaultPresets,
          currentPreset: defaultPresets[0],
          labelType: "off",
          currentOctave: 0,
          currentVolume: 1,
          sustainedNotes: new Set(),
        }),
    }),
    {
      name: STORE_NAME,
      version: STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        presets: state.presets,
        currentPreset: state.currentPreset,
        labelType: state.labelType,
      }),
      // Migration from old localStorage keys
      onRehydrateStorage: () => {
        return (state) => {
          if (state) {
            // Remove old localStorage keys now that migration is complete
            localStorage.removeItem("synth-presets");
            localStorage.removeItem("synth-current-preset");
            localStorage.removeItem("synth-label-type");
          }
        };
      },
    }
  )
); 