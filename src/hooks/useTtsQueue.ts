import { useRef, useEffect, useCallback, useState } from "react";
import { getAudioContext, resumeAudioContext } from "@/lib/audioContext";
import { useAppStore } from "@/stores/useAppStore";
import { useIpodStore } from "@/stores/useIpodStore";

/**
 * Hook that turns short text chunks into speech and queues them in the same
 * `AudioContext` so that playback starts almost immediately and remains
 * gap-free. It is purposely transport-agnostic – just point it at any endpoint
 * that accepts `{ text: string }` in a POST body and returns an audio payload
 * (`audio/mpeg`, `audio/wav`, etc.).
 */
export function useTtsQueue(endpoint: string = "/api/speech") {
  // Lazily instantiated AudioContext shared by this hook instance
  const ctxRef = useRef<AudioContext | null>(null);
  // Absolute start-time for the *next* clip in the queue (in AudioContext time)
  const nextStartRef = useRef(0);
  // Keep track of in-flight requests so we can cancel them if needed
  const controllersRef = useRef<Set<AbortController>>(new Set());
  // Expose whether any TTS audio is currently playing
  const [isSpeaking, setIsSpeaking] = useState(false);
  // Track any sources currently playing so we can stop them
  const playingSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  // Promise chain that guarantees *scheduling* order while still allowing
  // individual fetches to run in parallel.
  const scheduleChainRef = useRef<Promise<void>>(Promise.resolve());
  // Flag to signal stop across async boundaries
  const isStoppedRef = useRef(false);

  // Gain node for global speech volume
  const gainNodeRef = useRef<GainNode | null>(null);
  const speechVolume = useAppStore((s) => s.speechVolume);
  const masterVolume = useAppStore((s) => s.masterVolume);
  const setIpodVolumeGlobal = useAppStore((s) => s.setIpodVolume);

  // Keep track of iPod volume for duck/restore
  const originalIpodVolumeRef = useRef<number | null>(null);

  // Subscribe to iPod playing state so our effect reacts when playback starts/stops
  const ipodIsPlaying = useIpodStore((s) => s.isPlaying);
  const setIpodIsPlaying = useIpodStore((s) => s.setIsPlaying);

  // Detect iOS (Safari) environment where programmatic volume control is restricted
  const isIOS =
    typeof navigator !== "undefined" &&
    /iP(hone|od|ad)/.test(navigator.userAgent);

  // Track whether we paused the iPod ourselves (to avoid resuming if user paused)
  const didPauseIpodRef = useRef(false);

  const ensureContext = () => {
    // Always use the shared global context
    ctxRef.current = getAudioContext();
    // (Re)create gain node if needed or context changed
    if (
      !gainNodeRef.current ||
      gainNodeRef.current.context !== ctxRef.current
    ) {
      if (gainNodeRef.current) {
        try {
          gainNodeRef.current.disconnect();
        } catch {
          console.error("Error disconnecting gain node");
        }
      }
      gainNodeRef.current = ctxRef.current.createGain();
      gainNodeRef.current.gain.value = speechVolume * masterVolume;
      gainNodeRef.current.connect(ctxRef.current.destination);
    }
    return ctxRef.current;
  };

  /**
   * Speak a chunk of text by fetching the TTS audio and scheduling it directly
   * after whatever is already queued.
   */
  const speak = useCallback(
    (text: string, onEnd?: () => void) => {
      if (!text || !text.trim()) return;

      // Signal that we are actively queueing again
      isStoppedRef.current = false;

      // Begin fetching immediately so the network request runs in parallel
      const fetchPromise = (async () => {
        const controller = new AbortController();
        controllersRef.current.add(controller);
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
            signal: controller.signal,
          });
          controllersRef.current.delete(controller);
          if (!res.ok) {
            console.error("TTS request failed", await res.text());
            return null;
          }
          return await res.arrayBuffer();
        } catch (err) {
          controllersRef.current.delete(controller);
          if ((err as DOMException)?.name !== "AbortError") {
            console.error("TTS fetch error", err);
          }
          return null;
        }
      })();

      // Chain purely the *scheduling* to maintain correct order.
      scheduleChainRef.current = scheduleChainRef.current.then(async () => {
        // Check if stop was called while this chunk was waiting in the queue
        if (isStoppedRef.current) {
          console.debug("TTS queue stopped, skipping scheduled chunk.");
          return;
        }

        try {
          const arrayBuf = await fetchPromise;
          if (!arrayBuf) return;
          // Ensure the shared context is ready
          await resumeAudioContext();
          const ctx = ensureContext();

          const audioBuf = await ctx.decodeAudioData(arrayBuf);

          const now = ctx.currentTime;
          const start = Math.max(now, nextStartRef.current);

          const src = ctx.createBufferSource();
          src.buffer = audioBuf;
          if (gainNodeRef.current) {
            src.connect(gainNodeRef.current);
          } else {
            src.connect(ctx.destination);
          }

          // Keep track of active sources so we can stop them later
          playingSourcesRef.current.add(src);
          setIsSpeaking(true);

          src.onended = () => {
            playingSourcesRef.current.delete(src);
            if (playingSourcesRef.current.size === 0) {
              setIsSpeaking(false);
            }
            if (onEnd) onEnd();
          };

          src.start(start);

          nextStartRef.current = start + audioBuf.duration;
        } catch (err) {
          if ((err as DOMException)?.name !== "AbortError") {
            console.error("Error during speak()", err);
          }
        }
      });
    },
    [endpoint]
  );

  /** Cancel all in-flight requests and reset the queue so the next call starts immediately. */
  const stop = useCallback(() => {
    console.debug("Stopping TTS queue...");
    isStoppedRef.current = true; // Signal to pending operations to stop

    controllersRef.current.forEach((c) => c.abort());
    controllersRef.current.clear();
    scheduleChainRef.current = Promise.resolve();
    // Stop any sources that are currently playing
    playingSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch {
        /* ignore */
      }
    });
    playingSourcesRef.current.clear();
    setIsSpeaking(false);
    if (ctxRef.current) {
      nextStartRef.current = ctxRef.current.currentTime;
    }
  }, []);

  // Clean up when the component using the hook unmounts
  useEffect(() => {
    return () => {
      stop();
      // preserve AudioContext across hot reloads instead of closing
    };
  }, [stop]);

  // Effect to handle AudioContext resumption on window focus
  useEffect(() => {
    const handleFocus = async () => {
      await resumeAudioContext();
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  // Update gain when speechVolume or masterVolume changes
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = speechVolume * masterVolume;
    }
  }, [speechVolume, masterVolume]);

  /**
   * Duck iPod volume while TTS is speaking.
   * We only duck when the iPod is actively playing and we have not already
   * done so for the current speech session. When speech ends, we restore the
   * previous volume.
   */
  useEffect(() => {
    if (isSpeaking && ipodIsPlaying) {
      // Activate ducking only once at the start of speech
      if (originalIpodVolumeRef.current === null) {
        if (isIOS) {
          // iOS Safari does not allow programmatic volume changes. Pause playback instead.
          didPauseIpodRef.current = true;
          setIpodIsPlaying(false);
        } else {
          originalIpodVolumeRef.current = useAppStore.getState().ipodVolume;
          const ducked = Math.max(0, originalIpodVolumeRef.current * 0.15);
          setIpodVolumeGlobal(ducked);
        }
      }
    } else if (!isSpeaking) {
      // Restore after speech
      if (isIOS) {
        if (didPauseIpodRef.current) {
          setIpodIsPlaying(true);
        }
        didPauseIpodRef.current = false;
      }

      if (originalIpodVolumeRef.current !== null) {
        setIpodVolumeGlobal(originalIpodVolumeRef.current);
        originalIpodVolumeRef.current = null;
      }
    }
  }, [isSpeaking, ipodIsPlaying, setIpodVolumeGlobal, isIOS]);

  return { speak, stop, isSpeaking };
}
