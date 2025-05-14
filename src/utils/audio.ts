import WaveSurfer from "wavesurfer.js";

export const createWaveform = (
  container: HTMLElement,
  base64Data: string
): Promise<WaveSurfer> => {
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const mimeType = getSupportedMimeType();
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
    wavesurfer.on("ready", () => {
      resolve(wavesurfer);
    });
    wavesurfer.on("error", (err) => {
      console.error("WaveSurfer error:", err);
      wavesurfer.destroy(); // Clean up on error
      reject(err);
    });

    try {
      wavesurfer.loadBlob(blob); // Start loading
    } catch (error) {
      console.error("Error calling wavesurfer.loadBlob:", error);
      wavesurfer.destroy(); // Clean up on synchronous error
      reject(error);
    }
  });
};

export const createAudioFromBase64 = (base64Data: string): HTMLAudioElement => {
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const mimeType = getSupportedMimeType();
  const blob = new Blob([bytes], { type: mimeType });
  return new Audio(URL.createObjectURL(blob));
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
