import { useState, useRef, useCallback } from "react";
import { getSupportedMimeType } from "@/utils/audio";
import { checkOfflineAndShowError } from "@/utils/offline";
import { getApiUrl } from "@/utils/platform";

// Constants
const DEFAULT_SILENCE_THRESHOLD = 2000; // ms
const DEFAULT_MIN_RECORDING_DURATION = 1000; // ms
const DEFAULT_FFT_SIZE = 256;
const CONSECUTIVE_SILENT_FRAMES_THRESHOLD = 3; // Number of consecutive silent frames needed
const DEFAULT_AUDIO_CONFIG = {
  channelCount: 1,
  sampleRate: 16000,
  echoCancellation: true,
  noiseSuppression: true,
} as const;

// Adaptive silence detection constants
const CALIBRATION_FRAMES = 10; // Number of frames to calibrate ambient noise
const SILENCE_MARGIN = 0.03; // How much above ambient noise is still considered "silent"
const MIN_SPEECH_THRESHOLD = 0.08; // Minimum level to be considered speech (prevents false triggers)
const FALLBACK_SILENCE_THRESHOLD = 0.05; // Fallback absolute threshold if calibration fails
const SPEECH_DROP_RATIO = 0.25; // Consider silent when volume drops to 25% of peak speech level
const LOW_FREQ_CUTOFF_RATIO = 0.15; // Skip lowest 15% of frequency bins (filters out hums/rumble)

// Types
type AudioAnalysis = {
  frequencies: number[];
  isSilent: boolean;
  averageVolume: number;
  speechBandVolume: number; // Volume in speech frequency range only
};

type DebugState = {
  isSilent: boolean;
  silenceDuration: number | null;
  recordingDuration: number;
  frequencies: number[];
};

export interface UseAudioTranscriptionProps {
  onTranscriptionComplete: (text: string) => void;
  onTranscriptionStart?: () => void;
  onError?: (error: Error) => void;
  onDebugState?: (state: DebugState) => void;
  silenceThreshold?: number; // Duration in ms to wait before stopping
  minRecordingDuration?: number; // Minimum recording duration in ms
  frequencyBands?: number; // Number of frequency bands for visualization (default 4)
  /** Called when recording state changes - called inline, not via effect */
  onRecordingStateChange?: (recording: boolean) => void;
  /** Called when frequencies or silence state changes - called inline, not via effect */
  onFrequenciesChange?: (frequencies: number[], isSilent: boolean) => void;
}

const analyzeAudioData = (
  analyser: AnalyserNode,
  bands: number = 4,
  ambientNoiseLevel: number | null = null,
  hasSpeechStarted: boolean = false,
  peakSpeechLevel: number = 0
): AudioAnalysis => {
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(dataArray);

  // Calculate frequency bands for visualization (all frequencies)
  const bandSize = Math.floor(dataArray.length / bands);
  const frequencies = Array.from({ length: bands }, (_, i) => {
    const start = i * bandSize;
    const end = start + bandSize;
    const bandData = dataArray.slice(start, end);
    const average =
      bandData.reduce((acc, val) => acc + val, 0) / bandData.length;
    return average / 255;
  });

  const averageVolume = frequencies.reduce((acc, val) => acc + val, 0) / bands;

  // Calculate speech band volume (skip low frequencies where hums/rumbles live)
  // With 16kHz sample rate and 256 FFT size, each bin is ~62.5Hz
  // Skip the lowest 15% of bins to filter out low-frequency noise (0-~600Hz)
  // Focus on speech frequencies (~300Hz-4kHz)
  const lowCutoffBin = Math.floor(dataArray.length * LOW_FREQ_CUTOFF_RATIO);
  const speechBins = dataArray.slice(lowCutoffBin);
  const speechBandVolume = speechBins.length > 0
    ? speechBins.reduce((acc, val) => acc + val, 0) / speechBins.length / 255
    : averageVolume;

  // Adaptive silence detection using speech band:
  // 1. If we have calibrated ambient noise level, use it as baseline
  // 2. Consider "silent" when speech band volume drops close to ambient level
  // 3. Also consider silent if volume drops significantly from peak speech level
  let isSilent: boolean;
  
  if (hasSpeechStarted && peakSpeechLevel > 0) {
    // Primary: relative drop detection - silent if dropped to 25% of peak speech level
    const relativeThreshold = peakSpeechLevel * SPEECH_DROP_RATIO;
    
    // Secondary: adaptive threshold based on ambient noise
    const adaptiveThreshold = ambientNoiseLevel !== null 
      ? ambientNoiseLevel + SILENCE_MARGIN 
      : FALLBACK_SILENCE_THRESHOLD;
    
    // Consider silent if EITHER condition is met (more robust)
    isSilent = speechBandVolume < relativeThreshold || speechBandVolume < adaptiveThreshold;
  } else {
    // During calibration or before speech, use fallback
    isSilent = speechBandVolume < FALLBACK_SILENCE_THRESHOLD;
  }

  return { frequencies, isSilent, averageVolume, speechBandVolume };
};

export function useAudioTranscription({
  onTranscriptionComplete,
  onTranscriptionStart,
  onError,
  onDebugState,
  silenceThreshold = DEFAULT_SILENCE_THRESHOLD,
  minRecordingDuration = DEFAULT_MIN_RECORDING_DURATION,
  frequencyBands = 4,
  onRecordingStateChange,
  onFrequenciesChange,
}: UseAudioTranscriptionProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [frequencies, setFrequencies] = useState<number[]>(Array(frequencyBands).fill(0));
  const [isSilent, setIsSilent] = useState(true);
  const frequencyBandsRef = useRef(frequencyBands);
  
  // Keep refs to latest callbacks to avoid stale closures
  const onRecordingStateChangeRef = useRef(onRecordingStateChange);
  onRecordingStateChangeRef.current = onRecordingStateChange;
  const onFrequenciesChangeRef = useRef(onFrequenciesChange);
  onFrequenciesChangeRef.current = onFrequenciesChange;

  // Refs for audio handling
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Refs for silence detection
  const silenceStartRef = useRef<number | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const silentFramesCountRef = useRef<number>(0);

  // Refs for adaptive silence detection
  const calibrationFramesRef = useRef<number[]>([]);
  const ambientNoiseLevelRef = useRef<number | null>(null);
  const hasSpeechStartedRef = useRef<boolean>(false);
  const peakVolumeLevelRef = useRef<number>(0);

  const sendAudioForTranscription = useCallback(
    async (chunks: Blob[]) => {
      if (chunks.length === 0) return;

      // Check if offline and show error
      if (checkOfflineAndShowError("Audio transcription requires an internet connection")) {
        onError?.(new Error("Audio transcription requires an internet connection"));
        return;
      }

      try {
        // Validate audio content
        const totalSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
        if (totalSize === 0) return;

        const mimeType = getSupportedMimeType();
        const audioBlob = new Blob(chunks, { type: mimeType });

        // Validate blob
        if (!audioBlob.size) {
          throw new Error("Generated audio blob is empty");
        }

        onTranscriptionStart?.();

        const formData = new FormData();
        // Extract extension from MIME type (e.g., "audio/webm;codecs=opus" -> "webm")
        const extension = mimeType.split(";")[0].split("/")[1];
        formData.append("audio", audioBlob, `recording.${extension}`);

        const response = await fetch(getApiUrl("/api/audio-transcribe"), {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const errorData = (await response.json()) as { error: string };
          throw new Error(errorData.error || "Transcription failed");
        }

        const { text } = (await response.json()) as { text: string };
        if (text && text.trim()) {
          onTranscriptionComplete(text);
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error("Unknown error");
        onError?.(err);
      }
    },
    [onTranscriptionComplete, onTranscriptionStart, onError]
  );

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current);
        silenceTimeoutRef.current = null;
      }
      silenceStartRef.current = null;

      // Ensure we stop the frequency analysis
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      // Stop the media recorder
      try {
        if (mediaRecorderRef.current.state === "recording") {
          mediaRecorderRef.current.stop();
          setIsRecording(false);
          onRecordingStateChangeRef.current?.(false);
        }
      } catch (error) {
        console.error("Error stopping media recorder:", error);
      }
    }
  }, []);

  const analyzeFrequencies = useCallback(() => {
    if (!analyserRef.current) return;

    const { frequencies: newFrequencies, isSilent: currentIsSilent, speechBandVolume } =
      analyzeAudioData(
        analyserRef.current,
        frequencyBandsRef.current,
        ambientNoiseLevelRef.current,
        hasSpeechStartedRef.current,
        peakVolumeLevelRef.current
      );

    setFrequencies(newFrequencies);
    
    // Note: We call onFrequenciesChange after setIsSilent below to batch the update
    if (calibrationFramesRef.current.length < CALIBRATION_FRAMES) {
      calibrationFramesRef.current.push(speechBandVolume);
      
      // Once calibration is complete, calculate ambient noise level
      if (calibrationFramesRef.current.length === CALIBRATION_FRAMES) {
        // Use the average of calibration frames as ambient noise baseline
        const avgAmbient = calibrationFramesRef.current.reduce((a, b) => a + b, 0) / CALIBRATION_FRAMES;
        ambientNoiseLevelRef.current = avgAmbient;
      }
    }

    // Track peak volume in speech band and detect when speech has started
    if (speechBandVolume > peakVolumeLevelRef.current) {
      peakVolumeLevelRef.current = speechBandVolume;
    }

    // Speech is considered started if speech band volume exceeds threshold above ambient
    if (!hasSpeechStartedRef.current && ambientNoiseLevelRef.current !== null) {
      const speechThreshold = Math.max(
        ambientNoiseLevelRef.current + SILENCE_MARGIN + 0.02,
        MIN_SPEECH_THRESHOLD
      );
      if (speechBandVolume > speechThreshold) {
        hasSpeechStartedRef.current = true;
      }
    }

    // Only update silence state if we have consecutive silent frames
    if (currentIsSilent) {
      silentFramesCountRef.current = (silentFramesCountRef.current || 0) + 1;
    } else {
      silentFramesCountRef.current = 0;
    }

    const isConsistentlySilent =
      silentFramesCountRef.current >= CONSECUTIVE_SILENT_FRAMES_THRESHOLD;
    setIsSilent(isConsistentlySilent);
    
    // Call frequency change callback with updated values
    onFrequenciesChangeRef.current?.(newFrequencies, isConsistentlySilent);

    const recordingDuration = Date.now() - recordingStartTimeRef.current;
    const currentlyRecording = mediaRecorderRef.current?.state === "recording";

    // Send debug state on every analysis
    onDebugState?.({
      isSilent: isConsistentlySilent,
      silenceDuration: silenceStartRef.current
        ? Date.now() - silenceStartRef.current
        : null,
      recordingDuration,
      frequencies: newFrequencies,
    });

    // Only trigger auto-stop after speech has been detected
    if (recordingDuration >= minRecordingDuration && hasSpeechStartedRef.current) {
      if (isConsistentlySilent && !silenceStartRef.current) {
        silenceStartRef.current = Date.now();
      } else if (isConsistentlySilent && silenceStartRef.current) {
        const silenceDuration = Date.now() - silenceStartRef.current;
        if (silenceDuration >= silenceThreshold) {
          if (currentlyRecording) {
            mediaRecorderRef.current?.requestData();
            stopRecording();
          }
        }
      } else if (!isConsistentlySilent && silenceStartRef.current) {
        silenceStartRef.current = null;
      }
    }

    animationFrameRef.current = requestAnimationFrame(analyzeFrequencies);
  }, [
    isRecording,
    minRecordingDuration,
    silenceThreshold,
    stopRecording,
    onDebugState,
  ]);

  const startRecording = useCallback(async () => {
    try {
      recordingStartTimeRef.current = Date.now();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: DEFAULT_AUDIO_CONFIG,
      });

      // Set up audio analysis - use default sample rate to match getUserMedia stream
      // (explicit sampleRate: 16000 caused NotSupportedError when connecting stream)
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = DEFAULT_FFT_SIZE;

      // Reset chunks and counters
      chunksRef.current = [];
      silentFramesCountRef.current = 0;
      silenceStartRef.current = null;

      // Reset adaptive silence detection
      calibrationFramesRef.current = [];
      ambientNoiseLevelRef.current = null;
      hasSpeechStartedRef.current = false;
      peakVolumeLevelRef.current = 0;

      // Start frequency analysis
      analyzeFrequencies();

      const mimeType = getSupportedMimeType();
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 32000,
      });
      mediaRecorderRef.current = mediaRecorder;

      // Request data more frequently and ensure we get the final chunk
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Immediately send audio for transcription
        const currentChunks = [...chunksRef.current];
        chunksRef.current = [];

        // Clean up first
        if (animationFrameRef.current !== null) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        if (audioContextRef.current) {
          await audioContextRef.current.close();
        }
        stream.getTracks().forEach((track) => track.stop());
        const resetFrequencies = Array(frequencyBandsRef.current).fill(0);
        setFrequencies(resetFrequencies);
        setIsSilent(true);
        onFrequenciesChangeRef.current?.(resetFrequencies, true);

        // Then send for transcription
        await sendAudioForTranscription(currentChunks);
      };

      // Start recording with smaller timeslice for more frequent data collection
      mediaRecorder.start(50); // Collect data every 50ms
      setIsRecording(true);
      onRecordingStateChangeRef.current?.(true);
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown error");
      onError?.(err);
    }
  }, [sendAudioForTranscription, analyzeFrequencies, onError]);

  return {
    isRecording,
    frequencies,
    isSilent,
    startRecording,
    stopRecording,
  };
}
