import { forwardRef, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { createWaveform } from "@/utils/audio";
import type WaveSurfer from "wavesurfer.js";
import { useTranslation } from "react-i18next";

interface WaveformProps {
  className?: string;
  audioData: string | null;
  onWaveformCreate?: (waveform: WaveSurfer) => void;
  isPlaying?: boolean;
}

export const Waveform = forwardRef<HTMLDivElement, WaveformProps>(
  ({ className = "", audioData, onWaveformCreate, isPlaying = false }, ref) => {
    const { t } = useTranslation();
    const waveformRef = useRef<WaveSurfer | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      let isMounted = true;
      const currentContainer = containerRef.current;

      // Cleanup function to destroy waveform
      const cleanup = () => {
        if (waveformRef.current) {
          waveformRef.current.destroy();
          waveformRef.current = null;
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
            currentContainer.innerHTML = t("apps.soundboard.waveform.errorLoading");
          }
          cleanup(); // Ensure cleanup on error
        }
      };

      // Defer heavy waveform decoding to idle time / next tick to avoid blocking mobile Safari UI thread
      const schedule = (cb: () => void) => {
        if ("requestIdleCallback" in window) {
          window.requestIdleCallback(cb, { timeout: 750 });
        } else {
          setTimeout(cb, 0);
        }
      };
      schedule(initWaveform);

      return () => {
        isMounted = false;
        cleanup(); // Cleanup on unmount
      };
    }, [audioData, onWaveformCreate, isPlaying]); // isPlaying is now a dependency

    return (
      <div
        ref={(node) => {
          containerRef.current = node;
          if (ref) {
            if (typeof ref === "function") {
              ref(node);
            } else if (typeof ref === "object" && ref !== null) {
              (ref as MutableRefObject<HTMLDivElement | null>).current = node;
            }
          }
        }}
        className={`w-full h-12 flex-shrink-0 overflow-hidden ${className}`}
        aria-label={t("apps.soundboard.waveform.label")}
      />
    );
  }
);

Waveform.displayName = "Waveform";
