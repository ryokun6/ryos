import { useCallback, useEffect, useRef } from "react";
import { useAudioSettingsStore } from "@/stores/useAudioSettingsStore";
import { getAudioContext, resumeAudioContext } from "@/lib/audioContext";

// Global audio context and cache
const audioBufferCache = new Map<string, AudioBuffer>();
const activeSources = new Set<AudioBufferSourceNode>();

// Track the AudioContext instance we last saw so we can invalidate caches if a
// new one is created by the shared helper.
let lastCtx: AudioContext | null = null;

// Preload a single sound and add it to cache
const preloadSound = async (soundPath: string): Promise<AudioBuffer> => {
  // If a new AudioContext was created (e.g., after the old one was closed by
  // iOS), invalidate the decoded buffer cache so that we don't feed AudioBuffers
  // that belong to a defunct context back into the pipeline.
  const currentCtx = getAudioContext();
  if (currentCtx !== lastCtx) {
    audioBufferCache.clear();
    lastCtx = currentCtx;
  }

  if (audioBufferCache.has(soundPath)) {
    return audioBufferCache.get(soundPath)!;
  }

  try {
    const response = await fetch(soundPath);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await getAudioContext().decodeAudioData(arrayBuffer);
    audioBufferCache.set(soundPath, audioBuffer);
    return audioBuffer;
  } catch (error) {
    console.error("Error loading sound:", error);
    throw error;
  }
};

// Preload multiple sounds at once
export const preloadSounds = async (sounds: string[]) => {
  await Promise.all(sounds.map(preloadSound));
};

export function useSound(soundPath: string, volume: number = 0.3) {
  const gainNodeRef = useRef<GainNode | null>(null);
  // Track active sources for this specific hook instance so we can stop them
  const instanceSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  // Reactively track global UI volume from audio settings store
  const uiVolume = useAudioSettingsStore((s) => s.uiVolume);
  const masterVolume = useAudioSettingsStore((s) => s.masterVolume);

  useEffect(() => {
    // Create gain node for volume control
    gainNodeRef.current = getAudioContext().createGain();
    gainNodeRef.current.gain.value = volume * uiVolume * masterVolume; // Apply masterVolume

    // Connect to destination
    gainNodeRef.current.connect(getAudioContext().destination);

    return () => {
      if (gainNodeRef.current) {
        gainNodeRef.current.disconnect();
      }
      // Stop all instance sources on cleanup
      instanceSourcesRef.current.forEach((source) => {
        try {
          source.stop();
        } catch {
          // Source may have already ended
        }
      });
      instanceSourcesRef.current.clear();
    };
  }, [volume, uiVolume, masterVolume]);

  // Internal function to create and play a source
  const createAndPlaySource = useCallback(async (loop: boolean = false) => {
    // Check if UI sounds are enabled via audio settings store
    if (!useAudioSettingsStore.getState().uiSoundsEnabled) {
      return null;
    }

    try {
      // Ensure audio context is running before playing
      await resumeAudioContext();

      const audioBuffer = await preloadSound(soundPath);
      // If the gain node belongs to a stale AudioContext (closed), recreate it
      if (
        !gainNodeRef.current ||
        gainNodeRef.current.context.state === "closed"
      ) {
        if (gainNodeRef.current) {
          try {
            gainNodeRef.current.disconnect();
          } catch {
            console.error("Error disconnecting gain node");
          }
        }
        gainNodeRef.current = getAudioContext().createGain();
        gainNodeRef.current.gain.value = volume * uiVolume * masterVolume;
        gainNodeRef.current.connect(getAudioContext().destination);
      }

      const source = getAudioContext().createBufferSource();
      source.buffer = audioBuffer;
      source.loop = loop;

      // Connect to (possibly re-created) gain node
      source.connect(gainNodeRef.current);

      // Set volume (apply global scaling) - use setValueAtTime to override any scheduled changes
      const targetVolume = volume * uiVolume * masterVolume;
      gainNodeRef.current.gain.setValueAtTime(targetVolume, getAudioContext().currentTime);

      // If too many concurrent sources are active, skip to avoid audio congestion
      if (activeSources.size > 32) {
        console.debug("Skipping sound – too many concurrent sources");
        return null;
      }

      // Play the sound
      source.start(0);

      // Add to active sources (global and instance)
      activeSources.add(source);
      instanceSourcesRef.current.add(source);

      // Clean up when done (only for non-looping sounds)
      source.onended = () => {
        activeSources.delete(source);
        instanceSourcesRef.current.delete(source);
      };

      return source;
    } catch (error) {
      console.error("Error playing sound:", error);
      return null;
    }
  }, [volume, soundPath, uiVolume, masterVolume]);

  // Stop all currently playing sounds from this hook instance
  const stop = useCallback(() => {
    // Immediately cut gain to 0 for instant silence
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.setValueAtTime(0, getAudioContext().currentTime);
    }
    // Then stop all sources
    instanceSourcesRef.current.forEach((source) => {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Source may have already ended
      }
    });
    instanceSourcesRef.current.clear();
  }, []);

  const play = useCallback(async () => {
    await createAndPlaySource(false);
  }, [createAndPlaySource]);

  // Play sound in a loop (must call stop() to end)
  const playLoop = useCallback(async () => {
    // Stop any existing sounds first to avoid overlapping
    stop();
    await createAndPlaySource(true);
  }, [createAndPlaySource, stop]);

  const fadeOut = useCallback(
    (duration: number = 0.5) => {
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.setValueAtTime(
          volume,
          getAudioContext().currentTime
        );
        gainNodeRef.current.gain.linearRampToValueAtTime(
          0,
          getAudioContext().currentTime + duration
        );
      }
    },
    [volume]
  );

  const fadeIn = useCallback(
    (duration: number = 0.5) => {
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.setValueAtTime(
          0,
          getAudioContext().currentTime
        );
        gainNodeRef.current.gain.linearRampToValueAtTime(
          volume,
          getAudioContext().currentTime + duration
        );
      }
    },
    [volume]
  );

  return { play, playLoop, stop, fadeOut, fadeIn };
}

// Predefined sound paths for easy access
export const Sounds = {
  ALERT_SOSUMI: "/sounds/AlertSosumi.mp3",
  WINDOW_CLOSE: "/sounds/WindowClose.mp3",
  WINDOW_OPEN: "/sounds/WindowOpen.mp3",
  WINDOW_EXPAND: "/sounds/WindowExpand.mp3",
  WINDOW_COLLAPSE: "/sounds/WindowCollapse.mp3",
  WINDOW_ZOOM_MINIMIZE: "/sounds/WindowZoomMinimize.mp3",
  WINDOW_ZOOM_MAXIMIZE: "/sounds/WindowZoomMaximize.mp3",
  BUTTON_CLICK: "/sounds/ButtonClickDown.mp3",
  MENU_OPEN: "/sounds/MenuOpen.mp3",
  MENU_CLOSE: "/sounds/MenuClose.mp3",
  // Window movement and resize sounds
  WINDOW_MOVE_MOVING: "/sounds/WindowMoveMoving.mp3",
  WINDOW_MOVE_STOP: "/sounds/WindowMoveStop.mp3",
  WINDOW_RESIZE_RESIZING: "/sounds/WindowResizeResizing.mp3",
  WINDOW_RESIZE_STOP: "/sounds/WindowResizeStop.mp3",
  // Minesweeper sounds
  CLICK: "/sounds/Click.mp3",
  ALERT_BONK: "/sounds/AlertBonk.mp3",
  ALERT_INDIGO: "/sounds/AlertIndigo.mp3",
  MSN_NUDGE: "/sounds/MSNNudge.mp3",
  // Video player sounds
  VIDEO_TAPE: "/sounds/VideoTapeIn.mp3",
  // Photo booth sounds
  PHOTO_SHUTTER: "/sounds/PhotoShutter.mp3",
  // Boot sound
  BOOT: "/sounds/Boot.mp3",
  VOLUME_CHANGE: "/sounds/Volume.mp3",
  // iPod sounds
  IPOD_CLICK_WHEEL: "/sounds/WheelsOfTime.m4a",
} as const;

// Lazily preload sounds after the first user interaction (click or touch)
if (typeof document !== "undefined") {
  const handleFirstInteraction = () => {
    preloadSounds(Object.values(Sounds));
    // Remove listeners after first invocation to avoid repeated work
    document.removeEventListener("click", handleFirstInteraction);
    document.removeEventListener("touchstart", handleFirstInteraction);
  };

  // Use `once: true` to ensure the handler fires a single time
  document.addEventListener("click", handleFirstInteraction, { once: true });
  document.addEventListener("touchstart", handleFirstInteraction, {
    once: true,
  });
}
