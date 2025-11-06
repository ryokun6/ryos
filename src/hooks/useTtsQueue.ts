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
  type BrowserUtteranceEntry = {
    utterance: SpeechSynthesisUtterance;
    onEnd?: () => void;
  };
  const browserUtterancesRef = useRef<Set<BrowserUtteranceEntry>>(new Set());
  // Promise chain that guarantees *scheduling* order while still allowing
  // individual fetches to run in parallel.
  const scheduleChainRef = useRef<Promise<void>>(Promise.resolve());
  // Flag to signal stop across async boundaries
  const isStoppedRef = useRef(false);

  // Parallel request limiting
  const MAX_PARALLEL_REQUESTS = 3;
  const activeRequestsCountRef = useRef(0);
  const pendingRequestsRef = useRef<
    Array<{
      text: string;
      resolve: (result: ArrayBuffer | null) => void;
      reject: (error: Error) => void;
    }>
  >([]);

  // Gain node for global speech volume
  const gainNodeRef = useRef<GainNode | null>(null);
  const speechVolume = useAppStore((s) => s.speechVolume);
  const masterVolume = useAppStore((s) => s.masterVolume);
  const setIpodVolumeGlobal = useAppStore((s) => s.setIpodVolume);
  const setChatSynthVolumeGlobal = useAppStore((s) => s.setChatSynthVolume);

  // Get TTS settings from app store
  const ttsModel = useAppStore((s) => s.ttsModel);
  const ttsVoice = useAppStore((s) => s.ttsVoice);
  const effectiveTtsModel = ttsModel ?? "browser";
  const isBrowserTts = effectiveTtsModel === "browser";

  // Keep track of iPod and chat synth volumes for duck/restore
  const originalIpodVolumeRef = useRef<number | null>(null);
  const originalChatSynthVolumeRef = useRef<number | null>(null);

  // Subscribe to iPod playing state so our effect reacts when playback starts/stops
  const ipodIsPlaying = useIpodStore((s) => s.isPlaying);

  // Detect iOS (Safari) environment where programmatic volume control is restricted
  const isIOS =
    typeof navigator !== "undefined" &&
    /iP(hone|od|ad)/.test(navigator.userAgent);

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
   * Process pending requests up to the maximum parallel limit
   */
  const processPendingRequests = useCallback(() => {
    while (
      pendingRequestsRef.current.length > 0 &&
      activeRequestsCountRef.current < MAX_PARALLEL_REQUESTS
    ) {
      const request = pendingRequestsRef.current.shift()!;
      activeRequestsCountRef.current++;

      const executeRequest = async () => {
        const controller = new AbortController();
        controllersRef.current.add(controller);
        try {
          // Prepare request body with TTS settings
          const requestBody: {
            text: string;
            model?: "openai" | "elevenlabs" | null;
            voice?: string | null;
            voice_id?: string | null;
            speed?: number;
            voice_settings?: {
              stability?: number;
              similarity_boost?: number;
              use_speaker_boost?: boolean;
              speed?: number;
            };
          } = {
            text: request.text,
          };

          if (effectiveTtsModel === "openai" || effectiveTtsModel === "elevenlabs") {
            requestBody.model = effectiveTtsModel;
          } else if (ttsModel === null) {
            requestBody.model = null;
          }

          // Add model-specific settings
          if (effectiveTtsModel === "elevenlabs") {
            requestBody.voice_id = ttsVoice; // Send null if null
          } else if (effectiveTtsModel === "openai") {
            // OpenAI settings
            requestBody.voice = ttsVoice; // Send null if null
          }
          // If model is browser or unspecified, let the server decide defaults

          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });
          controllersRef.current.delete(controller);
          if (!res.ok) {
            console.error("TTS request failed", await res.text());
            request.resolve(null);
            return;
          }
          const result = await res.arrayBuffer();
          request.resolve(result);
        } catch (err) {
          controllersRef.current.delete(controller);
          if ((err as DOMException)?.name !== "AbortError") {
            console.error("TTS fetch error", err);
          }
          request.resolve(null);
        } finally {
          activeRequestsCountRef.current--;
          processPendingRequests(); // Process next request
        }
      };

      executeRequest();
    }
  }, [endpoint, ttsModel, ttsVoice]);

  /**
   * Queue a fetch request with parallel limit enforcement
   */
  const queuedFetch = useCallback(
    (text: string): Promise<ArrayBuffer | null> => {
      return new Promise((resolve, reject) => {
        pendingRequestsRef.current.push({ text, resolve, reject });
        processPendingRequests();
      });
    },
    [processPendingRequests]
  );

  /**
   * Speak a chunk of text by fetching the TTS audio and scheduling it directly
   * after whatever is already queued.
   */
  const speak = useCallback(
    (text: string, onEnd?: () => void) => {
      if (!text || !text.trim()) return;

      // Signal that we are actively queueing again
      isStoppedRef.current = false;

      if (isBrowserTts) {
        if (typeof window === "undefined" || !window.speechSynthesis) {
          console.warn("SpeechSynthesis API is not available in this environment.");
          return;
        }

        const utterance = new SpeechSynthesisUtterance(text.trim());
        const combinedVolume = Math.max(0, Math.min(1, speechVolume * masterVolume));
        utterance.volume = combinedVolume;

        if (ttsVoice) {
          const availableVoices = window.speechSynthesis.getVoices();
          const matchedVoice = availableVoices.find(
            (voice) => voice.voiceURI === ttsVoice || voice.name === ttsVoice
          );
          if (matchedVoice) {
            utterance.voice = matchedVoice;
          }
        }

        const entry: BrowserUtteranceEntry = { utterance, onEnd };

        utterance.onstart = () => {
          browserUtterancesRef.current.add(entry);
          setIsSpeaking(true);
        };

        const handleUtteranceEnd = () => {
          browserUtterancesRef.current.delete(entry);
          if (browserUtterancesRef.current.size === 0) {
            setIsSpeaking(false);
          }
          if (onEnd) onEnd();
        };

        utterance.onend = handleUtteranceEnd;
        utterance.onerror = (event) => {
          console.error("SpeechSynthesisUtterance error", event);
          handleUtteranceEnd();
        };

        window.speechSynthesis.speak(utterance);
        return;
      }

      // Use queued fetch to limit parallel requests
      const fetchPromise = queuedFetch(text.trim());

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
    [queuedFetch, isBrowserTts, ttsModel, ttsVoice, speechVolume, masterVolume]
  );

  /** Cancel all in-flight requests and reset the queue so the next call starts immediately. */
  const stop = useCallback(() => {
    console.debug("Stopping TTS queue...");
    isStoppedRef.current = true; // Signal to pending operations to stop

    if (isBrowserTts) {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      browserUtterancesRef.current.clear();
      setIsSpeaking(false);
      return;
    }

    controllersRef.current.forEach((c) => c.abort());
    controllersRef.current.clear();
    scheduleChainRef.current = Promise.resolve();

    // Clear pending requests and reset counters
    pendingRequestsRef.current = [];
    activeRequestsCountRef.current = 0;

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
  }, [isBrowserTts]);

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
   * Duck iPod and chat synth volumes while TTS is speaking.
   * We only duck when audio is actively playing and we have not already
   * done so for the current speech session. When speech ends, we restore the
   * previous volumes.
   */
  useEffect(() => {
    if (isSpeaking) {
      // Activate ducking only once at the start of speech
      if (originalIpodVolumeRef.current === null && ipodIsPlaying && !isIOS) {
        originalIpodVolumeRef.current = useAppStore.getState().ipodVolume;
        const duckedIpod = Math.max(0, originalIpodVolumeRef.current * 0.35);
        setIpodVolumeGlobal(duckedIpod);
      }

      // Duck chat synth volume
      if (originalChatSynthVolumeRef.current === null) {
        originalChatSynthVolumeRef.current =
          useAppStore.getState().chatSynthVolume;
        const duckedChatSynth = Math.max(
          0,
          originalChatSynthVolumeRef.current * 0.6
        );
        setChatSynthVolumeGlobal(duckedChatSynth);
      }
    } else {
      // Restore iPod volume if it was ducked
      if (originalIpodVolumeRef.current !== null) {
        setIpodVolumeGlobal(originalIpodVolumeRef.current);
        originalIpodVolumeRef.current = null;
      }

      // Restore chat synth volume if it was ducked
      if (originalChatSynthVolumeRef.current !== null) {
        setChatSynthVolumeGlobal(originalChatSynthVolumeRef.current);
        originalChatSynthVolumeRef.current = null;
      }
    }
  }, [
    isSpeaking,
    ipodIsPlaying,
    setIpodVolumeGlobal,
    setChatSynthVolumeGlobal,
    isIOS,
  ]);

  return { speak, stop, isSpeaking };
}
