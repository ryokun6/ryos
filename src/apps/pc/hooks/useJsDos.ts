import { useState, useEffect } from "react";

// Type declarations for js-dos v8
declare global {
  interface Window {
    Dos?: (container: HTMLElement, options: DosOptions) => DosProps;
  }
}

export type DosEvent =
  | "emu-ready"
  | "ci-ready"
  | "bnd-play"
  | "open-key"
  | "fullscreen-change"
  | "exit";

export interface DosOptions {
  url: string;
  onload?: () => void;
  onerror?: (error: Error) => void;
  theme?: string;
  renderAspect?: string;
  renderBackend?: string;
  imageRendering?: string;
  mouseCapture?: boolean;
  workerThread?: boolean;
  autoStart?: boolean;
  kiosk?: boolean;
  onEvent?: (event: DosEvent, arg?: unknown) => void;
}

export interface DosProps {
  stop: () => Promise<void>;
  setMouseCapture: (capture: boolean) => void;
  setFullScreen: (fullScreen: boolean) => void;
  setRenderAspect: (aspect: string) => void;
  setMouseSensitivity: (sensitivity: number) => void;
}

// Module-level variables to track script state
let scriptRef: HTMLScriptElement | null = null;
let isScriptLoadedRef = false;

export function useJsDos() {
  const [isScriptLoaded, setIsScriptLoaded] = useState(isScriptLoadedRef);

  useEffect(() => {
    let loadCheckTimeoutId: ReturnType<typeof setTimeout> | null = null;

    // Only load script if it hasn't been loaded yet
    if (!scriptRef && !window.Dos) {
      console.log("Loading js-dos script...");
      const script = document.createElement("script");
      script.src = "https://v8.js-dos.com/latest/js-dos.js";
      script.async = true;
      script.onload = () => {
        console.log("js-dos script loaded successfully");
        // Wait a bit to ensure the script is fully initialized
        loadCheckTimeoutId = setTimeout(() => {
          console.log("Checking if Dos function is available:", !!window.Dos);
          isScriptLoadedRef = true;
          setIsScriptLoaded(true);
          loadCheckTimeoutId = null;
        }, 1000);
      };
      script.onerror = (error) => {
        console.error("Failed to load js-dos script:", error);
      };
      scriptRef = script;
      document.body.appendChild(script);
    }

    // Cleanup only when component unmounts
    return () => {
      // Don't remove the script or clear the global Dos function
      // We want to keep it loaded for the entire app lifecycle
      if (loadCheckTimeoutId !== null) {
        clearTimeout(loadCheckTimeoutId);
      }
    };
  }, []);

  return { isScriptLoaded };
}
