import { Mic } from "lucide-react";
import { useAudioTranscription } from "@/hooks/useAudioTranscription";
import { AudioBars } from "./audio-bars";
import { ActivityIndicator } from "./activity-indicator";
import { forwardRef, useEffect } from "react";

interface AudioInputButtonProps {
  onTranscriptionComplete: (text: string) => void;
  onTranscriptionStart?: () => void;
  onRecordingStateChange?: (recording: boolean) => void;
  onFrequenciesChange?: (frequencies: number[], isSilent: boolean) => void;
  isLoading?: boolean;
  className?: string;
  silenceThreshold?: number;
  /** If true, only shows mic icon and manages recording - waveform is rendered externally */
  externalWaveform?: boolean;
  /** Number of frequency bands to analyze (default 4, use higher for more waveform segments) */
  frequencyBands?: number;
}

export const AudioInputButton = forwardRef<
  HTMLButtonElement,
  AudioInputButtonProps
>(
  (
    {
      onTranscriptionComplete,
      onTranscriptionStart,
      onRecordingStateChange,
      onFrequenciesChange,
      isLoading = false,
      className = "",
      silenceThreshold = 1000,
      externalWaveform = false,
      frequencyBands = 4,
    },
    ref
  ) => {
    const {
      isRecording,
      frequencies,
      isSilent,
      startRecording,
      stopRecording,
    } = useAudioTranscription({
      onTranscriptionComplete: (text) => {
        onTranscriptionComplete(text);
      },
      onTranscriptionStart: () => {
        onTranscriptionStart?.();
      },
      onError: (error) => {
        console.error("Audio transcription error:", error);
        onTranscriptionComplete(""); // This will trigger the error UI in ChatInput
      },
      silenceThreshold,
      minRecordingDuration: 500, // Ensure we get at least 0.5s of audio
      frequencyBands,
    });

    useEffect(() => {
      onRecordingStateChange?.(isRecording);
    }, [isRecording, onRecordingStateChange]);

    useEffect(() => {
      onFrequenciesChange?.(frequencies, isSilent);
    }, [frequencies, isSilent, onFrequenciesChange]);

    return (
      <div className="relative">
        <button
          ref={ref}
          type="button"
          onClick={isRecording ? stopRecording : startRecording}
          className={className}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="sm" />
          ) : isRecording && !externalWaveform ? (
            <AudioBars
              frequencies={frequencies}
              color="black"
              isSilent={isSilent}
            />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </button>
      </div>
    );
  }
);
