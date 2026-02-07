import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ScaleOption = 1 | 1.5 | 2;

/**
 * Mac preset definition for Infinite Mac systems
 */
export interface MacPreset {
  id: string;
  name: string;
  year: string;
  disk: string;
  machine?: string;
  description: string;
  image: string;
  screenSize: { width: number; height: number };
}

const THUMBNAIL_BASE = "/assets/infinite-mac-thumbnails";

/**
 * Available Mac OS presets for the Infinite Mac emulator
 */
export const MAC_PRESETS: MacPreset[] = [
  {
    id: "system-1",
    name: "System 1.0",
    year: "1984",
    disk: "System 1.0",
    description: "Initial Mac system software",
    image: `${THUMBNAIL_BASE}/system-1.png`,
    screenSize: { width: 512, height: 342 },
  },
  {
    id: "system-6",
    name: "System 6.0.8",
    year: "1991",
    disk: "System 6.0.8",
    description: "Final System 6 release",
    image: `${THUMBNAIL_BASE}/system-6.png`,
    screenSize: { width: 512, height: 342 },
  },
  {
    id: "system-7-5",
    name: "System 7.5.3",
    year: "1996",
    disk: "System 7.5.3",
    description: "Open Transport and broader Mac support",
    image: `${THUMBNAIL_BASE}/system-7-5.png`,
    screenSize: { width: 640, height: 480 },
  },
  {
    id: "kanjitalk-7-5",
    name: "KanjiTalk 7.5.3",
    year: "1996",
    disk: "KanjiTalk 7.5.3",
    description: "Japanese edition of System 7.5.3",
    image: `${THUMBNAIL_BASE}/kanjitalk-7-5.png`,
    screenSize: { width: 640, height: 480 },
  },
  {
    id: "macos-8",
    name: "Mac OS 8.0",
    year: "1997",
    disk: "Mac OS 8.0",
    description: "Platinum appearance, multi-threaded Finder",
    image: `${THUMBNAIL_BASE}/macos-8.png`,
    screenSize: { width: 640, height: 480 },
  },
  {
    id: "macos-8-5",
    name: "Mac OS 8.5",
    year: "1998",
    disk: "Mac OS 8.5",
    description: "Sherlock, 32-bit icons, font smoothing",
    image: `${THUMBNAIL_BASE}/macos-8-5.png`,
    screenSize: { width: 640, height: 480 },
  },
  {
    id: "macos-9",
    name: "Mac OS 9.0",
    year: "1999",
    disk: "Mac OS 9.0",
    description: "Keychain, multiple users, Sherlock channels",
    image: `${THUMBNAIL_BASE}/macos-9.png`,
    screenSize: { width: 640, height: 480 },
  },
  {
    id: "macos-9-2",
    name: "Mac OS 9.2.2",
    year: "2001",
    disk: "Mac OS 9.2.2",
    description: "Final classic Mac OS release",
    image: `${THUMBNAIL_BASE}/macos-9-2.png`,
    screenSize: { width: 640, height: 480 },
  },
  {
    id: "macosx-10-1",
    name: "Mac OS X 10.1",
    year: "2001",
    disk: "Mac OS X 10.1",
    machine: "Power Macintosh G3 (Beige)",
    description: "Puma - improved performance, DVD playback",
    image: `${THUMBNAIL_BASE}/macosx-10-1.png`,
    screenSize: { width: 640, height: 480 },
  },
  {
    id: "macosx-10-2",
    name: "Mac OS X 10.2",
    year: "2002",
    disk: "Mac OS X 10.2",
    machine: "Power Macintosh G4 (PCI Graphics)",
    description: "Jaguar - Quartz Extreme, Address Book, iChat",
    image: `${THUMBNAIL_BASE}/macosx-10-2.png`,
    screenSize: { width: 640, height: 480 },
  },
  {
    id: "macosx-10-3",
    name: "Mac OS X 10.3",
    year: "2003",
    disk: "Mac OS X 10.3",
    machine: "Power Macintosh G4 (PCI Graphics)",
    description: "Panther - Exposé, fast user switching",
    image: `${THUMBNAIL_BASE}/macosx-10-3.png`,
    screenSize: { width: 640, height: 480 },
  },
  {
    id: "macosx-10-4",
    name: "Mac OS X 10.4",
    year: "2005",
    disk: "Mac OS X 10.4",
    machine: "Power Macintosh G4 (PCI Graphics)",
    description: "Tiger - Spotlight, Dashboard, Safari RSS",
    image: `${THUMBNAIL_BASE}/macosx-10-4.png`,
    screenSize: { width: 640, height: 480 },
  },
];

/**
 * Screen data from emulator for screenshots
 */
export interface ScreenData {
  width: number;
  height: number;
  data: Uint8Array;
}

/**
 * Emulator command payload types (per Infinite Mac embed API)
 */
export type EmulatorCommand =
  | { type: "emulator_pause" }
  | { type: "emulator_unpause" }
  | { type: "emulator_mouse_move"; x: number; y: number; deltaX?: number; deltaY?: number }
  | { type: "emulator_mouse_down"; button?: number }
  | { type: "emulator_mouse_up"; button?: number }
  | { type: "emulator_key_down"; code: string }
  | { type: "emulator_key_up"; code: string }
  | { type: "emulator_load_disk"; url: string };

interface InfiniteMacStoreState {
  // Persisted preferences
  scale: ScaleOption;
  setScale: (scale: ScaleOption) => void;

  // Runtime state (not persisted)
  activeIframeWindow: Window | null;
  selectedPreset: MacPreset | null;
  isEmulatorLoaded: boolean;
  isPaused: boolean;
  lastScreenData: ScreenData | null;

  // Actions
  setActiveIframe: (iframeWindow: Window | null) => void;
  setSelectedPreset: (preset: MacPreset | null) => void;
  setIsEmulatorLoaded: (loaded: boolean) => void;
  setIsPaused: (paused: boolean) => void;
  setLastScreenData: (data: ScreenData | null) => void;
  sendEmulatorCommand: (command: EmulatorCommand) => boolean;
  getScreenAsBase64: () => Promise<string | null>;
}

export const useInfiniteMacStore = create<InfiniteMacStoreState>()(
  persist(
    (set, get) => ({
      // Persisted preferences
      scale: 1,
      setScale: (scale) => set({ scale }),

      // Runtime state
      activeIframeWindow: null,
      selectedPreset: null,
      isEmulatorLoaded: false,
      isPaused: false,
      lastScreenData: null,

      // Actions
      setActiveIframe: (iframeWindow) => set({ activeIframeWindow: iframeWindow }),
      setSelectedPreset: (preset) => set({ selectedPreset: preset }),
      setIsEmulatorLoaded: (loaded) => set({ isEmulatorLoaded: loaded }),
      setIsPaused: (paused) => set({ isPaused: paused }),
      setLastScreenData: (data) => set({ lastScreenData: data }),

      sendEmulatorCommand: (command) => {
        const { activeIframeWindow, isEmulatorLoaded } = get();
        if (!activeIframeWindow || !isEmulatorLoaded) {
          console.warn("[InfiniteMacStore] Cannot send command: no active emulator");
          return false;
        }
        try {
          const targetOrigin =
            typeof window !== "undefined" ? window.location.origin : "*";
          activeIframeWindow.postMessage(command, targetOrigin);
          return true;
        } catch (error) {
          console.error("[InfiniteMacStore] Failed to send command:", error);
          return false;
        }
      },

      getScreenAsBase64: async () => {
        const { lastScreenData } = get();
        if (!lastScreenData || lastScreenData.data.length === 0) {
          return null;
        }
        try {
          // Create canvas from the RGBA pixel data
          const canvas = document.createElement("canvas");
          canvas.width = lastScreenData.width;
          canvas.height = lastScreenData.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) return null;

          // Create ImageData from the Uint8Array (RGBA format)
          const imageData = new ImageData(
            new Uint8ClampedArray(lastScreenData.data),
            lastScreenData.width,
            lastScreenData.height
          );
          ctx.putImageData(imageData, 0, 0);

          // Convert to base64 PNG
          return canvas.toDataURL("image/png");
        } catch (error) {
          console.error("[InfiniteMacStore] Failed to convert screen to base64:", error);
          return null;
        }
      },
    }),
    {
      name: "ryos:infinite-mac",
      version: 1,
      // Only persist the scale preference, not runtime state
      partialize: (state) => ({ scale: state.scale }),
    }
  )
);
