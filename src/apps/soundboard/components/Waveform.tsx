import { forwardRef, useEffect, useRef } from "react";
import { createWaveform } from "@/utils/audio";
import type WaveSurfer from "wavesurfer.js";

interface WaveformProps {
  className?: string;
  audioData: string | null;
  onWaveformCreate?: (waveform: WaveSurfer) => void;
  isPlaying?: boolean;
}

export const Waveform = forwardRef<HTMLDivElement, WaveformProps>(
  ({ className = "", audioData, onWaveformCreate, isPlaying = false }, ref) => {
    const waveformRef = useRef<WaveSurfer>();
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      let isMounted = true;
      const currentContainer = containerRef.current;

      // Cleanup function to destroy waveform
      const cleanup = () => {
        if (waveformRef.current) {
          waveformRef.current.destroy();
          waveformRef.current = undefined;
        }
      };

      if (!audioData || !currentContainer) {
        cleanup(); // Clean up if no data or container
        return;
      }

      const initWaveform = async () => {
        cleanup(); // Clean up previous instance before creating new one

        if (!currentContainer || !isMounted) return; // Check again before async operation

        currentContainer.innerHTML = ""; // Clear container

        try {
          const wavesurfer = await createWaveform(currentContainer, audioData);

          if (isMounted) {
            wavesurfer.setMuted(true);
            waveformRef.current = wavesurfer;
            onWaveformCreate?.(wavesurfer);

            // Set initial play state
            // createWaveform now ensures the instance is ready when the promise resolves
            if (isPlaying) {
              wavesurfer.play();
            } else {
              wavesurfer.seekTo(0);
              // Per v7 docs, use setOptions to trigger redraw instead of drawBuffer
              wavesurfer.setOptions({});
            }
          } else {
            wavesurfer.destroy(); // Destroy if unmounted during creation
          }
        } catch (error) {
          console.error("Failed to initialize waveform:", error);
          if (isMounted && currentContainer) {
            currentContainer.innerHTML = "Error loading waveform";
          }
          cleanup(); // Ensure cleanup on error
        }
      };

      initWaveform();

      return () => {
        isMounted = false;
        cleanup(); // Cleanup on unmount
      };
    }, [audioData, onWaveformCreate, isPlaying]); // isPlaying is now a dependency

    return (
      <div
        ref={(node) => {
          if (node) {
            containerRef.current = node;
            if (ref) {
              if (typeof ref === "function") ref(node);
              // Note: Handling ref objects might require assigning to ref.current
            }
          }
        }}
        className={`w-full h-12 flex-shrink-0 overflow-hidden ${className}`}
      />
    );
  }
);

Waveform.displayName = "Waveform";
