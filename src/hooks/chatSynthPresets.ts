// Chat synth preset definitions as plain data, kept separate from
// useChatSynth so UI consumers (menus, control panels) don't pull the
// whole Tone.js module into their chunk.

// Valid oscillator types (structurally compatible with Tone's oscillator types)
type OscillatorType = "triangle" | "sine" | "square" | "sawtooth";

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
