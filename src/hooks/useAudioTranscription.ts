import { useState, useRef, useCallback } from "react";
import { getSupportedMimeType } from "@/utils/audio";
import { checkOfflineAndShowError } from "@/utils/offline";

// Constants
const DEFAULT_SILENCE_THRESHOLD = 2000; // ms
const DEFAULT_MIN_RECORDING_DURATION = 1000; // ms
const DEFAULT_VOLUME_SILENCE_THRESHOLD = 0.05; // Lowered from 0.08 to be more sensitive
const DEFAULT_FFT_SIZE = 256;
const CONSECUTIVE_SILENT_FRAMES_THRESHOLD = 3; // Number of consecutive silent frames needed
const DEFAULT_AUDIO_CONFIG = {
  channelCount: 1,
  sampleRate: 16000,
  echoCancellation: true,
  noiseSuppression: true,
} as const;

// Types
type AudioAnalysis = {
  frequencies: number[];
  isSilent: boolean;
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
}

const analyzeAudioData = (analyser: AnalyserNode): AudioAnalysis => {
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(dataArray);

  const bandSize = Math.floor(dataArray.length / 4);
  const frequencies = Array.from({ length: 4 }, (_, i) => {
    const start = i * bandSize;
    const end = start + bandSize;
    const bandData = dataArray.slice(start, end);
    const average =
      bandData.reduce((acc, val) => acc + val, 0) / bandData.length;
    return average / 255;
  });

  const averageVolume = frequencies.reduce((acc, val) => acc + val, 0) / 4;
  const isSilent = averageVolume < DEFAULT_VOLUME_SILENCE_THRESHOLD;

  return { frequencies, isSilent };
};

export function useAudioTranscription({
  onTranscriptionComplete,
  onTranscriptionStart,
  onError,
  onDebugState,
  silenceThreshold = DEFAULT_SILENCE_THRESHOLD,
  minRecordingDuration = DEFAULT_MIN_RECORDING_DURATION,
}: UseAudioTranscriptionProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [frequencies, setFrequencies] = useState<number[]>([0, 0, 0, 0]);
  const [isSilent, setIsSilent] = useState(true);

  // Refs for audio handling
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number>();

  // Refs for silence detection
  const silenceStartRef = useRef<number | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout>();
  const recordingStartTimeRef = useRef<number>(0);
  const silentFramesCountRef = useRef<number>(0);

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

        const response = await fetch("/api/audio-transcribe", {
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
      }
      silenceStartRef.current = null;

      // Ensure we stop the frequency analysis
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      // Stop the media recorder
      try {
        if (mediaRecorderRef.current.state === "recording") {
          mediaRecorderRef.current.stop();
          setIsRecording(false);
        }
      } catch (error) {
        console.error("Error stopping media recorder:", error);
      }
    }
  }, []);

  const analyzeFrequencies = useCallback(() => {
    if (!analyserRef.current) return;

    const { frequencies: newFrequencies, isSilent: currentIsSilent } =
      analyzeAudioData(analyserRef.current);

    setFrequencies(newFrequencies);

    // Only update silence state if we have consecutive silent frames
    if (currentIsSilent) {
      silentFramesCountRef.current = (silentFramesCountRef.current || 0) + 1;
    } else {
      silentFramesCountRef.current = 0;
    }

    const isConsistentlySilent =
      silentFramesCountRef.current >= CONSECUTIVE_SILENT_FRAMES_THRESHOLD;
    setIsSilent(isConsistentlySilent);

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

    if (recordingDuration >= minRecordingDuration) {
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

      // Set up audio analysis
      audioContextRef.current = new AudioContext({ sampleRate: 16000 });
      analyserRef.current = audioContextRef.current.createAnalyser();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      source.connect(analyserRef.current);
      analyserRef.current.fftSize = DEFAULT_FFT_SIZE;

      // Reset chunks and counters
      chunksRef.current = [];
      silentFramesCountRef.current = 0;
      silenceStartRef.current = null;

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
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        if (audioContextRef.current) {
          await audioContextRef.current.close();
        }
        stream.getTracks().forEach((track) => track.stop());
        setFrequencies([0, 0, 0, 0]);
        setIsSilent(true);

        // Then send for transcription
        await sendAudioForTranscription(currentChunks);
      };

      // Start recording with smaller timeslice for more frequent data collection
      mediaRecorder.start(50); // Collect data every 50ms
      setIsRecording(true);
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
