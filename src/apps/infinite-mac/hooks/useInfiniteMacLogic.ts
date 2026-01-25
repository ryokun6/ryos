import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useThemeStore } from "@/stores/useThemeStore";
import { useAppStore } from "@/stores/useAppStore";
import { helpItems } from "..";

/** Same-origin wrapper URL with COEP/COOP for SharedArrayBuffer; params are forwarded to infinitemac.org */
function buildWrapperUrl(preset: MacPreset): string {
  const params = new URLSearchParams();
  params.set("disk", preset.disk);
  if (preset.machine) params.set("machine", preset.machine);
  params.set("infinite_hd", "true");
  params.set("saved_hd", "true");
  params.set("screen_scale", "1");
  params.set("auto_pause", "true");
  params.set("screen_update_messages", "true");
  return `/embed/infinite-mac?${params.toString()}`;
}

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

// Default window size for the preset grid (content only)
export const DEFAULT_WINDOW_SIZE = { width: 640, height: 480 };

// Default window size including titlebar (for app registry initial size)
const DEFAULT_TITLEBAR_HEIGHT = 24; // matches TITLEBAR_HEIGHT_BY_THEME fallback
export const DEFAULT_WINDOW_SIZE_WITH_TITLEBAR = {
  width: DEFAULT_WINDOW_SIZE.width,
  height: DEFAULT_WINDOW_SIZE.height + DEFAULT_TITLEBAR_HEIGHT,
};

const THUMBNAIL_BASE = "/assets/infinite-mac-thumbnails";

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


interface UseInfiniteMacLogicProps {
  isWindowOpen: boolean;
  instanceId?: string;
}

export function useInfiniteMacLogic({
  isWindowOpen: _isWindowOpen,
  instanceId,
}: UseInfiniteMacLogicProps) {
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<MacPreset | null>(null);
  const [isEmulatorLoaded, setIsEmulatorLoaded] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const translatedHelpItems = useTranslatedHelpItems("infinite-mac", helpItems);
  const embedUrl = selectedPreset ? buildWrapperUrl(selectedPreset) : null;

  // Titlebar height per theme so auto-resize fits content + titlebar (matches WindowFrame / themes.css)
  const TITLEBAR_HEIGHT_BY_THEME: Record<string, number> = {
    macosx: 24, // notitlebar h-6 spacer
    system7: 24, // 1.5rem
    xp: 30, // 1.875rem, WindowFrame minHeight 30px
    win98: 22, // 1.375rem
  };

  const resizeWindow = useCallback(
    (size: { width: number; height: number }) => {
      if (!instanceId) return;
      const { instances, updateInstanceWindowState } = useAppStore.getState();
      const theme = useThemeStore.getState().current;
      const instance = instances[instanceId];
      if (instance) {
        const titlebarHeight = TITLEBAR_HEIGHT_BY_THEME[theme] ?? 24;
        updateInstanceWindowState(
          instanceId,
          instance.position ?? { x: 100, y: 100 },
          { width: size.width, height: size.height + titlebarHeight }
        );
      }
    },
    [instanceId]
  );

  const handleSelectPreset = useCallback(
    (preset: MacPreset) => {
      setSelectedPreset(preset);
      setIsEmulatorLoaded(false);
      setIsPaused(false);
      // Resize window to match emulator screen size
      resizeWindow(preset.screenSize);
    },
    [resizeWindow]
  );

  const handleBackToPresets = useCallback(() => {
    setSelectedPreset(null);
    setIsEmulatorLoaded(false);
    setIsPaused(false);
    // Resize window back to default for preset grid
    resizeWindow(DEFAULT_WINDOW_SIZE);
  }, [resizeWindow]);

  const sendEmulatorCommand = useCallback(
    (type: string, payload?: Record<string, unknown>) => {
      const win = iframeRef.current?.contentWindow;
      if (win) {
        win.postMessage({ type, ...payload }, "*");
      }
    },
    []
  );

  const handlePause = useCallback(() => {
    sendEmulatorCommand("emulator_pause");
    setIsPaused(true);
  }, [sendEmulatorCommand]);

  const handleUnpause = useCallback(() => {
    sendEmulatorCommand("emulator_unpause");
    setIsPaused(false);
  }, [sendEmulatorCommand]);

  // Only show emulator after iframe sends {"type": "emulator_loaded"} via postMessage
  const handleIframeLoad = useCallback(() => {}, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      // Bridge wrapper forwards as { type: '_infinite_mac_bridge', payload }; payload is
      // the raw iframe message (emulator_loaded, emulator_screen, etc. per Infinite Mac embed API).
      const data =
        e.origin === window.location.origin && e.data?.type === "_infinite_mac_bridge"
          ? e.data.payload
          : e.origin === "https://infinitemac.org"
            ? e.data
            : undefined;
      if (!data || typeof data !== "object") return;
      switch (data.type) {
        case "emulator_loaded":
          setIsEmulatorLoaded(true);
          break;
        case "emulator_screen": {
          const w = data.width;
          const h = data.height;
          if (typeof w === "number" && typeof h === "number") {
            resizeWindow({ width: w, height: h });
          }
          break;
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [resizeWindow]);

  return {
    t,
    translatedHelpItems,
    currentTheme,
    isXpTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    selectedPreset,
    isEmulatorLoaded,
    isPaused,
    embedUrl,
    iframeRef,
    handleSelectPreset,
    handleBackToPresets,
    handlePause,
    handleUnpause,
    handleIframeLoad,
    sendEmulatorCommand,
  };
}
