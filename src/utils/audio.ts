// Dynamic waveform creation & lightweight audio helpers optimized for mobile Safari

import { resumeAudioContext } from "@/lib/audioContext";

export const createWaveform = async (
  container: HTMLElement,
  base64Data: string,
  format?: string
): Promise<import("wavesurfer.js").default> => {
  // Ensure shared audio context is ready before WaveSurfer creates its own
  // This helps avoid Safari's AudioContext limit issues by ensuring our main context is active
  await resumeAudioContext();

  // Dynamically import WaveSurfer to avoid adding it to the initial bundle
  const { default: WaveSurfer } = await import("wavesurfer.js");

  // Decode base64 → Uint8Array (keep synchronous but this now happens lazily only when waveform requested)
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  // Use provided format or detect from current browser
  const mimeType = format ? `audio/${format}` : getSupportedMimeType();
  const blob = new Blob([bytes], { type: mimeType });

  const wavesurfer = WaveSurfer.create({
    container,
    height: 55,
    progressColor: "rgba(0, 0, 0, 1)",
    cursorColor: "transparent",
    cursorWidth: 1,
    barWidth: 2,
    barGap: 1,
    barRadius: 2,
    interact: false,
  });

  wavesurfer.on("play", () => {
    wavesurfer.setOptions({ cursorColor: "rgba(199, 24, 24, 0.56)" });
  });

  wavesurfer.on("pause", () => {
    wavesurfer.setOptions({ cursorColor: "transparent" });
  });

  return new Promise((resolve, reject) => {
    wavesurfer.on("ready", () => resolve(wavesurfer));
    wavesurfer.on("error", (err) => {
      console.error("WaveSurfer error:", err);
      wavesurfer.destroy();
      reject(err);
    });
    try {
      wavesurfer.loadBlob(blob);
    } catch (error) {
      console.error("Error calling wavesurfer.loadBlob:", error);
      wavesurfer.destroy();
      reject(error);
    }
  });
};

export const createAudioFromBase64 = (base64Data: string, format?: string): HTMLAudioElement => {
  // Use provided format or detect from current browser
  const mimeType = format ? `audio/${format}` : getSupportedMimeType();
  // Some browsers (older) may choke on very large data URIs; these clips are short
  return new Audio(`data:${mimeType};base64,${base64Data}`);
};

export const getSupportedMimeType = (): string => {
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  if (isSafari) {
    return "audio/mp4";
  }

  // Chrome, Firefox, and other browsers support webm with opus
  return "audio/webm";
};

export const base64FromBlob = async (blob: Blob): Promise<string> => {
  const buffer = await blob.arrayBuffer();
  return btoa(String.fromCharCode(...Array.from(new Uint8Array(buffer))));
};

export function bufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...Array.from(new Uint8Array(buffer))));
}
