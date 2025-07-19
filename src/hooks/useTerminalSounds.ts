import { useEffect, useRef, useState, useCallback } from "react";
import * as Tone from "tone";
import { useAppStore } from "@/stores/useAppStore";
import { ensureSafariAudioPlayback, handleSafariVisibilityChange } from "@/utils/safariAudio";

type SoundType = "command" | "error" | "aiResponse";
type TimeMode = "past" | "future" | "now";

const TERMINAL_SOUND_PRESETS = {
  command: {
    oscillator: {
      type: "triangle" as const,
    },
    envelope: {
      attack: 0.005,
      decay: 0.1,
      sustain: 0,
      release: 0.1,
    },
    filter: {
      frequency: 3000,
      rolloff: -24 as const,
    },
    volume: -5,
    note: "C5",
    duration: "16n",
  },
  error: {
    oscillator: {
      type: "square" as const,
    },
    envelope: {
      attack: 0.01,
      decay: 0.3,
      sustain: 0.1,
      release: 0.2,
    },
    filter: {
      frequency: 1500,
      rolloff: -12 as const,
    },
    volume: -3,
    note: "E3",
    duration: "8n",
  },
  aiResponse: {
    oscillator: {
      type: "sine" as const,
    },
    envelope: {
      attack: 0.02,
      decay: 0.2,
      sustain: 0.1,
      release: 0.4,
    },
    filter: {
      frequency: 2000,
      rolloff: -24 as const,
    },
    volume: -8,
    note: "G4",
    duration: "16n",
  },
};

// Completion ding sound preset
const DING_PRESET = {
  oscillator: {
    type: "sine" as const,
  },
  envelope: {
    attack: 0.01,
    decay: 0.1,
    sustain: 0.3,
    release: 0.5,
  },
  filter: {
    frequency: 5000,
    rolloff: -12 as const,
  },
  volume: -10,
  note: "A5",
  duration: "8n",
};

export function useTerminalSounds() {
  const [isInitialized, setIsInitialized] = useState(false);
  const terminalSoundsEnabled = useAppStore((s) => s.terminalSoundsEnabled);
  const setTerminalSoundsEnabled = useAppStore((s) => s.setTerminalSoundsEnabled);
  const isMuted = !terminalSoundsEnabled;
  const lastSoundTimeRef = useRef(0);
  const synthsRef = useRef<Record<SoundType, Tone.Synth | null>>({
    command: null,
    error: null,
    aiResponse: null,
  });

  // For elevator music
  const elevatorMusicRef = useRef<{
    isPlaying: boolean;
    timeMode: TimeMode;
    players: {
      player: Tone.Player | null;
      interval: Tone.Loop | null;
    }[];
    generativePlayers: {
      synth: Tone.PolySynth | Tone.MonoSynth | null;
      pattern: Tone.Pattern<string> | null;
    }[];
    notePool: string[];
    melodySequencer: {
      synth: Tone.MonoSynth | null;
      currentMelody: string[];
      currentIndex: number;
      timeout: number | null;
      repeatCount?: number;
    };
    effects: Tone.ToneAudioNode[] | null;
    timeoutIds: number[];
  }>({
    isPlaying: false,
    timeMode: "now",
    players: [],
    generativePlayers: [],
    notePool: [],
    melodySequencer: {
      synth: null,
      currentMelody: [],
      currentIndex: 0,
      timeout: null,
    },
    effects: null,
    timeoutIds: [],
  });

  // No local muted state; rely directly on global store

  // Function to generate a Brian Eno inspired ambient sound environment (for past and now)
  const setupAmbientEnvironment = useCallback(() => {
    // Dispose of any existing effects or players
    if (elevatorMusicRef.current.effects) {
      elevatorMusicRef.current.effects.forEach((effect) => effect.dispose());
    }

    elevatorMusicRef.current.players.forEach(({ player, interval }) => {
      if (player) player.dispose();
      if (interval) interval.dispose();
    });

    elevatorMusicRef.current.generativePlayers.forEach(({ synth, pattern }) => {
      if (synth) synth.dispose();
      if (pattern) pattern.dispose();
    });

    // Clear any ongoing timeouts
    elevatorMusicRef.current.timeoutIds.forEach((id) =>
      window.clearTimeout(id)
    );

    // Cancel any melody timeout
    if (elevatorMusicRef.current.melodySequencer.timeout) {
      window.clearTimeout(elevatorMusicRef.current.melodySequencer.timeout);
    }

    // Reset the arrays
    elevatorMusicRef.current.players = [];
    elevatorMusicRef.current.generativePlayers = [];
    elevatorMusicRef.current.timeoutIds = [];

    // Brian Eno inspired ambient effects chain
    const reverb = new Tone.Reverb({
      decay: 10, // Very long reverb decay
      wet: 0.8, // High reverb mix
    }).toDestination();

    const delay = new Tone.PingPongDelay({
      delayTime: 0.7,
      feedback: 0.5,
      wet: 0.3,
    }).connect(reverb);

    const filter = new Tone.Filter({
      type: "lowpass",
      frequency: 2000,
      Q: 1,
    }).connect(delay);

    // Create a note pool for generative composition
    // Using notes from Db major pentatonic scale, which gives an ethereal sound
    const notePool = [
      "Db3",
      "Eb3",
      "Gb3",
      "Ab3",
      "Bb3",
      "Db4",
      "Eb4",
      "Gb4",
      "Ab4",
      "Bb4",
      "Db5",
      "Eb5",
    ];
    elevatorMusicRef.current.notePool = notePool;

    // Create melody synth
    const melodySynth = new Tone.MonoSynth().connect(filter);
    melodySynth.set({
      volume: -15,
      oscillator: {
        type: "triangle",
      },
      envelope: {
        attack: 0.02,
        decay: 0.2,
        sustain: 0.2,
        release: 0.8,
      },
      filterEnvelope: {
        attack: 0.01,
        decay: 0.1,
        sustain: 0.6,
        release: 1.5,
        baseFrequency: 800,
        octaves: 2,
      },
    });

    // Initialize melody sequencer
    elevatorMusicRef.current.melodySequencer = {
      synth: melodySynth,
      currentMelody: [],
      currentIndex: 0,
      timeout: null,
    };

    // Create pad sounds
    const createPadSynth = () => {
      const padSynth = new Tone.PolySynth(Tone.FMSynth).connect(filter);
      padSynth.set({
        volume: -18,
        harmonicity: 3.5,
        modulationIndex: 10,
        oscillator: {
          type: "sine",
        },
        envelope: {
          attack: 3,
          decay: 2,
          sustain: 0.8,
          release: 8,
        },
        modulation: {
          type: "sine",
        },
        modulationEnvelope: {
          attack: 4,
          decay: 2,
          sustain: 0.5,
          release: 10,
        },
      });

      return padSynth;
    };

    // Create a soft piano/bell-like synth
    const createBellSynth = () => {
      const bellSynth = new Tone.MonoSynth().connect(filter);
      bellSynth.set({
        volume: -20,
        oscillator: {
          type: "sine",
        },
        envelope: {
          attack: 0.1,
          decay: 0.8,
          sustain: 0.4,
          release: 4,
        },
        filterEnvelope: {
          attack: 0.1,
          decay: 0.2,
          sustain: 0.1,
          release: 2,
          baseFrequency: 300,
          octaves: 2,
        },
      });

      return bellSynth;
    };

    // Create generative players
    const padSynth1 = createPadSynth();
    const padSynth2 = createPadSynth();
    const bellSynth = createBellSynth();

    // Store synths in ref
    elevatorMusicRef.current.generativePlayers = [
      { synth: padSynth1, pattern: null },
      { synth: padSynth2, pattern: null },
      { synth: bellSynth, pattern: null },
    ];

    // Store effects chain
    elevatorMusicRef.current.effects = [filter, delay, reverb];
  }, []);

  // Function to set up futuristic sound environment for time travel to the future
  const setupFuturisticEnvironment = useCallback(() => {
    // Dispose of any existing effects or players
    if (elevatorMusicRef.current.effects) {
      elevatorMusicRef.current.effects.forEach((effect) => effect.dispose());
    }

    elevatorMusicRef.current.players.forEach(({ player, interval }) => {
      if (player) player.dispose();
      if (interval) interval.dispose();
    });

    elevatorMusicRef.current.generativePlayers.forEach(({ synth, pattern }) => {
      if (synth) synth.dispose();
      if (pattern) pattern.dispose();
    });

    // Clear any ongoing timeouts
    elevatorMusicRef.current.timeoutIds.forEach((id) => 
      window.clearTimeout(id)
    );

    // Cancel any melody timeout
    if (elevatorMusicRef.current.melodySequencer.timeout) {
      window.clearTimeout(elevatorMusicRef.current.melodySequencer.timeout);
    }

    // Reset the arrays
    elevatorMusicRef.current.players = [];
    elevatorMusicRef.current.generativePlayers = [];
    elevatorMusicRef.current.timeoutIds = [];

    // Space warp effects chain - simplified and quieter
    const reverb = new Tone.Reverb({
      decay: 5, // Shorter decay for cleaner sound
      wet: 0.5,  // Less wet for more clarity
    }).toDestination();

    // Use PingPongDelay for a more stereo, sparkly effect
    const delay = new Tone.PingPongDelay({
      delayTime: "16n", // Shorter delay time for faster echoes
      feedback: 0.4,   // Slightly higher feedback
      wet: 0.35,       // Increase wetness for more prominent delay
    }).connect(reverb);

    // Adjust filter slightly for brightness
    const filter = new Tone.Filter({
      type: "lowpass",
      frequency: 2500, // Slightly higher cutoff
      Q: 0.7,          // Slightly higher Q for resonance
    }).connect(delay);

    // Create a note pool for simple, clean arpeggios
    // Using a major pentatonic scale for fewer dissonant notes
    const notePool = [
      "C4", "D4", "E4", "G4", "A4", 
      "C5", "D5", "E5", "G5", "A5"
    ];
    elevatorMusicRef.current.notePool = notePool;

    // Create main synth for arpeggios - brighter sound
    const leadSynth = new Tone.MonoSynth().connect(filter);
    leadSynth.set({
      volume: -17, // Slightly louder
      oscillator: {
        type: "triangle", // Brighter oscillator
      },
      envelope: {
        attack: 0.02,   // Faster attack
        decay: 0.15,    // Faster decay
        sustain: 0.2,
        release: 0.6,   // Shorter release
      },
      filterEnvelope: {
        attack: 0.02,
        decay: 0.1,
        sustain: 0.3,
        release: 0.5,
        baseFrequency: 1200, // Higher base frequency for brightness
        octaves: 2.5,        // More octaves for sparkle
      },
    });

    // Initialize melody sequencer with main synth
    elevatorMusicRef.current.melodySequencer = {
      synth: leadSynth,
      currentMelody: [],
      currentIndex: 0,
      timeout: null,
    };

    // Create a more complex, futuristic pad synth using FMSynth
    const createSimplePadSynth = () => {
      const padSynth = new Tone.PolySynth(Tone.FMSynth).connect(filter); // Use FMSynth
      padSynth.set({
        volume: -22, // Slightly louder pad
        harmonicity: 1.5, // Lower harmonicity for cleaner FM sound
        modulationIndex: 5, // Lower modulation index
        oscillator: {
          type: "sine"
        },
        envelope: {
          attack: 1.5, // Faster attack
          decay: 1.0,
          sustain: 0.4,
          release: 4.0, // Slightly longer release
        },
        modulation: {
          type: "triangle" // Triangle modulator for brighter FM
        },
        modulationEnvelope: {
          attack: 2.0,
          decay: 0.8,
          sustain: 0.2,
          release: 5.0,
        }
      });
      return padSynth;
    };

    // Single pad synth
    const padSynth = createSimplePadSynth();

    // Store synths in ref - just two synths
    elevatorMusicRef.current.generativePlayers = [
      { synth: padSynth, pattern: null },
      { synth: null, pattern: null }, // Not used
      { synth: null, pattern: null }, // Not used
    ];

    // Store effects chain
    elevatorMusicRef.current.effects = [filter, delay, reverb];
  }, []);

  // Function to randomly select notes from the pool
  const getRandomNote = useCallback(() => {
    const notePool = elevatorMusicRef.current.notePool;
    return notePool[Math.floor(Math.random() * notePool.length)];
  }, []);

  // Generate an evolving pattern of notes - simplified for coherence
  const generateEnoSequence = useCallback(() => {
    if (!elevatorMusicRef.current.isPlaying) return;

    const { generativePlayers, timeoutIds, timeMode } = elevatorMusicRef.current;

    // Only play very occasional chords in future mode
    if (timeMode === "future" && Math.random() < 0.1 && generativePlayers[0]?.synth) {
      const padSynth = generativePlayers[0].synth;
      
      // Simple dyad chords (just two notes for clarity)
      // C-G or C-E are always pleasant intervals
      const baseNote = Math.random() < 0.5 ? "C" : "G";
      const octave = 4;
      
      const rootNote = `${baseNote}${octave}`;
      const fifthNote = baseNote === "C" ? `G${octave}` : `D${octave+1}`;
      
      try {
        // Play simple dyad with gentle fade-in
        padSynth.triggerAttackRelease(rootNote, "2n");
        setTimeout(() => {
          padSynth.triggerAttackRelease(fifthNote, "2n");
        }, 200); // Gentle stagger
      } catch (error) {
        console.debug("Error playing pad chord:", error);
      }
    }

    // Schedule next event with longer intervals
    const nextInterval = timeMode === "future" 
      ? 6000 + Math.random() * 6000  // 6-12 seconds between events - much less frequent
      : 800 + Math.random() * 2500;  // Keep original timing for past/now

    const timeoutId = window.setTimeout(() => {
      generateEnoSequence();
    }, nextInterval);

    timeoutIds.push(timeoutId);
  }, [getRandomNote]);

  // Play occasional swelling pad chord
  const playSwellPad = useCallback(() => {
    if (!elevatorMusicRef.current.isPlaying) return;

    const { generativePlayers, timeoutIds, timeMode } = elevatorMusicRef.current;

    if (generativePlayers[0]?.synth) { // First synth is pad in both modes
      const padSynth = generativePlayers[0].synth;

      // Create a chord from notes in our pool
      const rootNote = getRandomNote();
      const chordNotes = [rootNote];

      // Add 1-2 more notes sometimes for a chord
      if (Math.random() < 0.7) {
        const secondNote =
          elevatorMusicRef.current.notePool[
            Math.floor(Math.random() * elevatorMusicRef.current.notePool.length)
          ];
        chordNotes.push(secondNote);

        if (Math.random() < 0.4) {
          const thirdNote =
            elevatorMusicRef.current.notePool[
              Math.floor(
                Math.random() * elevatorMusicRef.current.notePool.length
              )
            ];
          chordNotes.push(thirdNote);
        }
      }

      try {
        // Long sustain for ambient pad swells
        // Shorter for future, longer for past
        const duration = timeMode === "future" ? "4n" : "2n";
        
        padSynth.triggerAttackRelease(chordNotes[0], duration);
        if (chordNotes.length > 1) {
          // Trigger remaining notes individually
          for (let i = 1; i < chordNotes.length; i++) {
            padSynth.triggerAttackRelease(chordNotes[i], duration);
          }
        }
      } catch (error) {
        console.debug("Error playing swell pad:", error);
      }
    }

    // Schedule next pad swell with long, variable timing
    // More frequent for future mode
    const nextInterval = timeMode === "future"
      ? 2000 + Math.random() * 4000 // Between 2 and 6 seconds for future
      : 4000 + Math.random() * 8000; // Between 4 and 12 seconds for past
      
    const timeoutId = window.setTimeout(() => {
      playSwellPad();
    }, nextInterval);

    timeoutIds.push(timeoutId);
  }, [getRandomNote]);

  // Generate a melodic sequence from the note pool - highly simplified for coherence
  const generateMelodySequence = useCallback(() => {
    const { notePool, timeMode } = elevatorMusicRef.current;
    
    // Future mode uses simple predictable patterns
    if (timeMode === "future") {
      // Create very predictable patterns
      const patternType = Math.floor(Math.random() * 3); // 0, 1, or 2
      const melody: string[] = [];
      
      // Always start from one of the lower notes
      const startIndex = Math.floor(Math.random() * 3); // First 3 notes in pool
      melody.push(notePool[startIndex]);
      
      // Just 3 simple pattern types
      switch (patternType) {
        case 0: // Simple ascending scale
          for (let i = 1; i < 5; i++) { // 5 notes total
            const nextIndex = Math.min(startIndex + i, notePool.length - 1);
            melody.push(notePool[nextIndex]);
          }
          break;
          
        case 1: // Simple arpeggio (root, 3rd, 5th pattern)
          if (startIndex < notePool.length - 4) {
            melody.push(notePool[startIndex + 2]); // 3rd
            melody.push(notePool[startIndex + 4]); // 5th
            melody.push(notePool[startIndex + 4]); // Repeat 5th
            melody.push(notePool[startIndex + 2]); // Back to 3rd
          } else {
            // Fallback if we're too high in the scale
            for (let i = 1; i < 5; i++) {
              melody.push(notePool[Math.max(startIndex - i, 0)]);
            }
          }
          break;
          
        case 2: // Wave pattern up and down
          if (startIndex < notePool.length - 2) {
            melody.push(notePool[startIndex + 2]); // Up
            melody.push(notePool[startIndex + 1]); // Down a bit
            melody.push(notePool[startIndex + 3]); // Up higher
            melody.push(notePool[startIndex]);     // Back to start
          } else {
            // Fallback if we're too high in the scale
            for (let i = 1; i < 5; i++) {
              const idx = startIndex - i;
              melody.push(notePool[idx >= 0 ? idx : 0]);
            }
          }
          break;
      }
      
      return melody;
    } else {
      // Original past mode logic
      const length = 4 + Math.floor(Math.random() * 4);
      const melody: string[] = [];
      
      if (Math.random() < 0.4) {
        melody.push("Db4");
      } else {
        melody.push(notePool[Math.floor(Math.random() * notePool.length)]);
      }
      
      for (let i = 1; i < length; i++) {
        if (Math.random() < 0.6) {
          const lastIndex = notePool.indexOf(melody[i - 1]);
          const stepUp = Math.random() < 0.5;

          if (stepUp && lastIndex < notePool.length - 1) {
            melody.push(notePool[lastIndex + 1]);
          } else if (!stepUp && lastIndex > 0) {
            melody.push(notePool[lastIndex - 1]);
          } else {
            melody.push(notePool[Math.floor(Math.random() * notePool.length)]);
          }
        } else if (Math.random() < 0.25) {
          melody.push(melody[i - 1]);
        } else {
          melody.push(notePool[Math.floor(Math.random() * notePool.length)]);
        }
      }
      
      return melody;
    }
  }, []);

  // Play the next note in the current melody - simplified for clarity
  const playNextMelodyNote = useCallback(() => {
    if (!elevatorMusicRef.current.isPlaying) return;

    const { melodySequencer, timeoutIds, timeMode } = elevatorMusicRef.current;
    const { synth, currentMelody, currentIndex } = melodySequencer;

    if (!synth || currentMelody.length === 0) return;

    // Play the current note
    try {
      const note = currentMelody[currentIndex];
      
      // Moderate note duration for clarity
      const noteDuration = timeMode === "future" ? "8n" : "16n";
      
      // Consistent velocity for predictability
      const velocity = 0.7;
        
      synth.triggerAttackRelease(note, noteDuration, Tone.now(), velocity);

      // Move to next note or get new melody
      const nextIndex = (currentIndex + 1) % currentMelody.length;
      elevatorMusicRef.current.melodySequencer.currentIndex = nextIndex;

      // Generate new melody only after 2 full cycles (more repetition)
      if (nextIndex === 0) {
        // Count pattern repetitions before changing
        melodySequencer.repeatCount = (melodySequencer.repeatCount || 0) + 1;
        
        if (melodySequencer.repeatCount >= 2) { // Change pattern after 2 full cycles
          elevatorMusicRef.current.melodySequencer.currentMelody =
            generateMelodySequence();
          melodySequencer.repeatCount = 0;
        }
      }

      // Schedule next note with consistent timing for clarity
      const nextInterval = timeMode === "future"
        ? 200 + Math.random() * 50   // 200-250ms - more consistent
        : 200 + Math.random() * 150; // Original timing for past
        
      const timeoutId = window.setTimeout(() => {
        playNextMelodyNote();
      }, nextInterval);

      // Only start playing melodies occasionally
      if (melodySequencer.timeout !== null) {
        melodySequencer.timeout = timeoutId;
      }
      timeoutIds.push(timeoutId);
    } catch (error) {
      console.debug("Error playing melody note:", error);
    }
  }, [generateMelodySequence]);

  // Start melodies less frequently
  const scheduleNextMelody = useCallback(() => {
    if (!elevatorMusicRef.current.isPlaying) return;

    const { timeoutIds, timeMode } = elevatorMusicRef.current;

    // Future mode starts melodies less often for clarity
    const melodyThreshold = timeMode === "future" ? 0.3 : 0.4;
    
    // Sometimes start a new melody
    if (Math.random() < melodyThreshold) {
      // Generate a new melody
      elevatorMusicRef.current.melodySequencer.currentMelody =
        generateMelodySequence();
      elevatorMusicRef.current.melodySequencer.currentIndex = 0;
      elevatorMusicRef.current.melodySequencer.repeatCount = 0;

      // Start playing the melody
      playNextMelodyNote();
    }

    // Schedule next melody with longer gaps
    const nextMelodyInterval = timeMode === "future"
      ? 4000 + Math.random() * 4000 // 4-8 seconds between melodies - less frequent
      : 2000 + Math.random() * 5000; // Keep original for past
      
    const timeoutId = window.setTimeout(() => {
      scheduleNextMelody();
    }, nextMelodyInterval);

    timeoutIds.push(timeoutId);
    elevatorMusicRef.current.melodySequencer.timeout = timeoutId;
  }, [generateMelodySequence, playNextMelodyNote]);

  // For completion ding
  const dingSynthRef = useRef<Tone.Synth | null>(null);

  const resumeAudioContext = async () => {
    if (Tone.context.state === "suspended") {
      try {
        await Tone.context.resume();
        console.debug("Audio context resumed");
      } catch (error) {
        console.error("Failed to resume audio context:", error);
      }
    }
  };

  // New shared function to initialize Tone.js once
  const initializeToneOnce = async () => {
    // For Safari, ensure audio playback is allowed
    if (!(await ensureSafariAudioPlayback())) {
      console.debug("[useTerminalSounds] Safari audio playback not allowed");
      return false;
    }

    // If the underlying AudioContext has been closed (can happen on iOS when the
    // page is backgrounded for a while) we need to reset Tone with a fresh
    // context and dispose of any stale synth instances that belong to the old
    // context.
    if (Tone.context.state === "closed") {
      try {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore – setContext might be missing from the typings
        Tone.setContext(new Tone.Context());

        // Dispose of old synths and clear refs so they are recreated lazily
        Object.values(synthsRef.current).forEach((synth) => {
          if (synth) synth.dispose();
        });
        synthsRef.current = { command: null, error: null, aiResponse: null };

        if (dingSynthRef.current) {
          dingSynthRef.current.dispose();
          dingSynthRef.current = null;
        }

        console.debug("Tone context was closed – created a new context and cleared synth cache");
      } catch (err) {
        console.error("Failed to reset Tone context:", err);
      }
    }

    if (!isInitialized || Tone.context.state !== "running") {
      try {
        await Tone.start();
        setIsInitialized(true);
        
        // For iOS, explicitly resume the audio context
        if (Tone.context.state === "suspended") {
          await Tone.context.resume();
        }

        // Lazily create synths once Tone has started
        if (!synthsRef.current.command) {
          Object.entries(TERMINAL_SOUND_PRESETS).forEach(([type, preset]) => {
            synthsRef.current[type as SoundType] = createSynth(preset);
          });
          dingSynthRef.current = createSynth(DING_PRESET);
        }
        return true;
      } catch (error) {
        console.debug("Could not initialize Tone.js:", error);
        return false;
      }
    }
    return true;
  };

  // Add event listeners for visibility change and focus
  useEffect(() => {
    const handleFirstInteraction = () => {
      initializeToneOnce();
      window.removeEventListener("click", handleFirstInteraction);
    };
    window.addEventListener("click", handleFirstInteraction);
    
    // Handle page visibility change (when app is switched to/from background)
    const handleVisibilityChange = async () => {
      if (document.visibilityState === "visible") {
        await handleSafariVisibilityChange();
        await resumeAudioContext();
      }
    };

    // Handle window focus (when app regains focus)
    const handleFocus = async () => {
      await handleSafariVisibilityChange();
      await resumeAudioContext();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("click", handleFirstInteraction);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  const playSound = useCallback(
    async (type: SoundType) => {
      if (isMuted) return;

      // Use shared initialization function
      if (!(await initializeToneOnce())) return;

      const synth = synthsRef.current[type];
      if (!synth) return;

      const preset = TERMINAL_SOUND_PRESETS[type];
      const now = Tone.now();
      const minTimeBetweenSounds = 0.15; // prevent sounds from overlapping too much

      if (now - lastSoundTimeRef.current >= minTimeBetweenSounds) {
        try {
          synth.triggerAttackRelease(preset.note, preset.duration, now);
          lastSoundTimeRef.current = now;
        } catch (error) {
          console.debug("Skipping sound due to timing", error);
        }
      }
    },
    [isMuted, isInitialized]
  );

  // Play elevator music (atmospheric background sound)
  const playElevatorMusic = useCallback(async (timeMode: TimeMode = "now") => {
    if (isMuted) return;

    // Use shared initialization function
    if (!(await initializeToneOnce())) return;

    // Start playing elevator music if not already playing
    if (!elevatorMusicRef.current.isPlaying) {
      elevatorMusicRef.current.isPlaying = true;
      elevatorMusicRef.current.timeMode = timeMode;

      // Setup the appropriate environment based on time mode
      if (timeMode === "future") {
        setupFuturisticEnvironment();
      } else {
        setupAmbientEnvironment();
      }

      // Ensure context is running before starting sounds
      if (Tone.context.state !== "running") {
        try {
          await Tone.context.resume();
        } catch (error) {
          console.debug("Could not resume audio context:", error);
          return;
        }
      }

      // Start the generative processes
      generateEnoSequence();
      playSwellPad();
      scheduleNextMelody();

      // Start the transport if it's not already started
      if (Tone.Transport.state !== "started") {
        Tone.Transport.start();
      }
    }
  }, [
    isMuted,
    isInitialized,
    setupAmbientEnvironment,
    setupFuturisticEnvironment,
    generateEnoSequence,
    playSwellPad,
    scheduleNextMelody,
  ]);

  // Stop elevator music
  const stopElevatorMusic = useCallback(() => {
    elevatorMusicRef.current.isPlaying = false;

    // Clear all timeout ids
    elevatorMusicRef.current.timeoutIds.forEach((id) =>
      window.clearTimeout(id)
    );
    elevatorMusicRef.current.timeoutIds = [];

    // Stop all synths
    elevatorMusicRef.current.generativePlayers.forEach(({ synth }) => {
      if (synth) {
        try {
          if ("releaseAll" in synth) {
            (synth as Tone.PolySynth).releaseAll();
          } else {
            // For MonoSynth, trigger release
            (synth as Tone.MonoSynth).triggerRelease();
          }
        } catch (error) {
          console.debug("Error releasing synth:", error);
        }
      }
    });

    // Stop melody synth
    if (elevatorMusicRef.current.melodySequencer.synth) {
      try {
        elevatorMusicRef.current.melodySequencer.synth.triggerRelease();
      } catch (error) {
        console.debug("Error releasing melody synth:", error);
      }
    }

    // Cancel melody timeout
    if (elevatorMusicRef.current.melodySequencer.timeout) {
      window.clearTimeout(elevatorMusicRef.current.melodySequencer.timeout);
      elevatorMusicRef.current.melodySequencer.timeout = null;
    }
  }, []);

  // Play completion "ding" sound
  const playDingSound = useCallback(async () => {
    if (isMuted) return;

    // Use shared initialization function
    if (!(await initializeToneOnce())) return;

    if (dingSynthRef.current) {
      const now = Tone.now();
      try {
        dingSynthRef.current.triggerAttackRelease("C6", "16n", now);
      } catch (error) {
        console.debug("Error playing ding sound:", error);
      }
    }
  }, [isMuted, isInitialized]);

  const toggleMute = useCallback(() => {
    setTerminalSoundsEnabled(!useAppStore.getState().terminalSoundsEnabled);
  }, [setTerminalSoundsEnabled]);

  // Cleanup on unmount (synths are created lazily now)
  useEffect(() => {
    return () => {
      // Dispose synths on unmount
      Object.values(synthsRef.current).forEach((synth) => {
        if (synth) synth.dispose();
      });

      if (dingSynthRef.current) {
        dingSynthRef.current.dispose();
      }
    };
  }, []);

  return {
    playCommandSound: () => {
      return playSound("command");
    },
    playErrorSound: () => {
      return playSound("error");
    },
    playAiResponseSound: () => {
      return playSound("aiResponse");
    },
    playElevatorMusic,
    stopElevatorMusic,
    playDingSound,
    toggleMute,
    isMuted,
  };
}

function createSynth(
  preset: (typeof TERMINAL_SOUND_PRESETS)[SoundType] | typeof DING_PRESET
) {
  // Create effects chain
  const filter = new Tone.Filter({
    frequency: preset.filter.frequency,
    type: "lowpass",
    rolloff: preset.filter.rolloff,
  }).toDestination();

  const synth = new Tone.Synth({
    oscillator: preset.oscillator,
    envelope: preset.envelope,
  }).connect(filter);

  synth.volume.value = preset.volume;
  return synth;
}
