import { useState, useRef, useCallback, useEffect } from "react";

export interface VoiceDuckingOptions {
  enabled: boolean;
  /** 0–100; higher = more sensitive (triggers on quieter voice) */
  sensitivity: number;
  /** 0–100; how much to reduce volume (70 = reduce to 30%) */
  amount: number;
}

export interface VoiceDuckingResult {
  /** Volume multiplier to apply to playback (0–1, smoothly animated) */
  duckingMultiplier: number;
  /** Whether voice is currently detected above threshold */
  isVoiceDetected: boolean;
  /** Whether the microphone is actively listening */
  isListening: boolean;
  /** Error message if mic access was denied or failed */
  error: string | null;
}

/**
 * Maps sensitivity (0–100) to an RMS threshold (0–1).
 * sensitivity=0  → threshold ~0.10  (very hard to trigger)
 * sensitivity=50 → threshold ~0.01
 * sensitivity=100→ threshold ~0.001 (triggers on very quiet sounds)
 */
function sensitivityToThreshold(sensitivity: number): number {
  const clamped = Math.max(0, Math.min(100, sensitivity));
  return 0.10 * Math.pow(0.01, clamped / 100);
}

const ATTACK_MS = 50;
const RELEASE_MS = 400;
const ANALYSIS_INTERVAL_MS = 50;
const HOLD_MS = 200;

export function useVoiceDucking({
  enabled,
  sensitivity,
  amount,
}: VoiceDuckingOptions): VoiceDuckingResult {
  const [isListening, setIsListening] = useState(false);
  const [isVoiceDetected, setIsVoiceDetected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duckingMultiplier, setDuckingMultiplier] = useState(1);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const targetMultiplierRef = useRef(1);
  const currentMultiplierRef = useRef(1);
  const lastVoiceTimeRef = useRef(0);

  // Keep latest values in refs so interval/animation callbacks always read current values
  const sensitivityRef = useRef(sensitivity);
  sensitivityRef.current = sensitivity;
  const amountRef = useRef(amount);
  amountRef.current = amount;

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setIsListening(false);
    setIsVoiceDetected(false);
    targetMultiplierRef.current = 1;
    currentMultiplierRef.current = 1;
    setDuckingMultiplier(1);
  }, []);

  const startListening = useCallback(async () => {
    cleanup();
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const ctx = new AudioContext();
      audioContextRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.5;
      analyserRef.current = analyser;

      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      sourceRef.current = source;

      const dataArray = new Float32Array(analyser.fftSize);

      intervalRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        analyserRef.current.getFloatTimeDomainData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);

        const threshold = sensitivityToThreshold(sensitivityRef.current);
        const duckTarget = Math.max(0, Math.min(1, (100 - amountRef.current) / 100));
        const voiceDetected = rms > threshold;

        if (voiceDetected) {
          lastVoiceTimeRef.current = Date.now();
          targetMultiplierRef.current = duckTarget;
          setIsVoiceDetected(true);
        } else {
          const elapsed = Date.now() - lastVoiceTimeRef.current;
          if (elapsed > HOLD_MS) {
            targetMultiplierRef.current = 1;
            setIsVoiceDetected(false);
          }
        }
      }, ANALYSIS_INTERVAL_MS);

      let lastFrameTime = performance.now();
      const animate = (now: number) => {
        const dt = now - lastFrameTime;
        lastFrameTime = now;

        const target = targetMultiplierRef.current;
        const current = currentMultiplierRef.current;

        if (Math.abs(target - current) > 0.001) {
          const isAttacking = target < current;
          const timeConstant = isAttacking ? ATTACK_MS : RELEASE_MS;
          const alpha = 1 - Math.exp(-dt / timeConstant);
          const next = current + (target - current) * alpha;
          currentMultiplierRef.current = next;
          setDuckingMultiplier(next);
        } else if (current !== target) {
          currentMultiplierRef.current = target;
          setDuckingMultiplier(target);
        }

        animFrameRef.current = requestAnimationFrame(animate);
      };
      animFrameRef.current = requestAnimationFrame(animate);

      setIsListening(true);
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone access denied"
          : "Could not access microphone";
      setError(msg);
      cleanup();
    }
  }, [cleanup]);

  // Start/stop based on enabled flag
  useEffect(() => {
    if (enabled) {
      startListening();
    } else {
      cleanup();
    }
    return cleanup;
  }, [enabled, startListening, cleanup]);

  return {
    duckingMultiplier: enabled ? duckingMultiplier : 1,
    isVoiceDetected,
    isListening,
    error,
  };
}
