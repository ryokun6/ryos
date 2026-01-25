import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useThemeStore } from "@/stores/useThemeStore";
import { useAppStore } from "@/stores/useAppStore";
import { helpItems } from "..";

const INFINITEMAC_EMBED_BASE = "https://infinitemac.org/embed";

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

// Default window size for the preset grid
export const DEFAULT_WINDOW_SIZE = { width: 640, height: 480 };

export const MAC_PRESETS: MacPreset[] = [
  {
    id: "system-1",
    name: "System 1.0",
    year: "1984",
    disk: "System 1.0",
    description: "Initial Mac system software",
    image: "/icons/default/infinite-mac.png",
    screenSize: { width: 512, height: 342 },
  },
  {
    id: "system-6",
    name: "System 6.0.8",
    year: "1991",
    disk: "System 6.0.8",
    description: "Final System 6 release",
    image: "/icons/default/infinite-mac.png",
    screenSize: { width: 512, height: 342 },
  },
  {
    id: "system-7",
    name: "System 7.0",
    year: "1991",
    disk: "System 7.0",
    description: "Fully 32-bit clean, MultiFinder",
    image: "/icons/default/infinite-mac.png",
    screenSize: { width: 640, height: 480 },
  },
  {
    id: "system-7-5",
    name: "System 7.5.3",
    year: "1996",
    disk: "System 7.5.3",
    description: "Open Transport and broader Mac support",
    image: "/icons/default/infinite-mac.png",
    screenSize: { width: 640, height: 480 },
  },
  {
    id: "macos-8",
    name: "Mac OS 8.0",
    year: "1997",
    disk: "Mac OS 8.0",
    description: "Platinum appearance, multi-threaded Finder",
    image: "/icons/default/infinite-mac.png",
    screenSize: { width: 640, height: 480 },
  },
  {
    id: "macos-8-5",
    name: "Mac OS 8.5",
    year: "1998",
    disk: "Mac OS 8.5",
    description: "Sherlock, 32-bit icons, font smoothing",
    image: "/icons/default/infinite-mac.png",
    screenSize: { width: 674, height: 504 },
  },
  {
    id: "macos-9",
    name: "Mac OS 9.0",
    year: "1999",
    disk: "Mac OS 9.0",
    description: "Keychain, multiple users, Sherlock channels",
    image: "/icons/default/infinite-mac.png",
    screenSize: { width: 668, height: 500 },
  },
  {
    id: "macos-9-2",
    name: "Mac OS 9.2.2",
    year: "2001",
    disk: "Mac OS 9.2.2",
    description: "Final classic Mac OS release",
    image: "/icons/default/infinite-mac.png",
    screenSize: { width: 640, height: 480 },
  },
  {
    id: "macosx-10-1",
    name: "Mac OS X 10.1",
    year: "2001",
    disk: "Mac OS X 10.1",
    machine: "Power Macintosh G3 (Beige)",
    description: "Puma - improved performance, DVD playback",
    image: "/icons/default/infinite-mac.png",
    screenSize: { width: 640, height: 480 },
  },
  {
    id: "macosx-10-2",
    name: "Mac OS X 10.2",
    year: "2002",
    disk: "Mac OS X 10.2",
    machine: "Power Macintosh G4 (PCI Graphics)",
    description: "Jaguar - Quartz Extreme, Address Book, iChat",
    image: "/icons/default/infinite-mac.png",
    screenSize: { width: 800, height: 600 },
  },
  {
    id: "macosx-10-3",
    name: "Mac OS X 10.3",
    year: "2003",
    disk: "Mac OS X 10.3",
    machine: "Power Macintosh G4 (PCI Graphics)",
    description: "Panther - Exposé, fast user switching",
    image: "/icons/default/infinite-mac.png",
    screenSize: { width: 1024, height: 768 },
  },
  {
    id: "macosx-10-4",
    name: "Mac OS X 10.4",
    year: "2005",
    disk: "Mac OS X 10.4",
    machine: "Power Macintosh G4 (PCI Graphics)",
    description: "Tiger - Spotlight, Dashboard, Safari RSS",
    image: "/icons/default/infinite-mac.png",
    screenSize: { width: 800, height: 600 },
  },
];

function buildEmbedUrl(preset: MacPreset): string {
  const url = new URL(INFINITEMAC_EMBED_BASE);
  url.searchParams.set("disk", preset.disk);
  if (preset.machine) {
    url.searchParams.set("machine", preset.machine);
  }
  url.searchParams.set("infinite_hd", "true");
  url.searchParams.set("saved_hd", "true");
  url.searchParams.set("screen_scale", "1");
  url.searchParams.set("auto_pause", "true"); // Auto-pause when out of view
  return url.toString();
}

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
  const embedUrl = selectedPreset ? buildEmbedUrl(selectedPreset) : null;

  // Extra height for macOS X theme's titlebar spacer (h-6 = 24px)
  const MACOSX_TITLEBAR_HEIGHT = 24;

  const resizeWindow = useCallback(
    (size: { width: number; height: number }) => {
      if (!instanceId) return;
      // Get fresh state directly from store to avoid stale closures
      const { instances, updateInstanceWindowState } = useAppStore.getState();
      const theme = useThemeStore.getState().current;
      const instance = instances[instanceId];
      if (instance) {
        // Add extra height for macOS X theme's titlebar spacer
        const extraHeight = theme === "macosx" ? MACOSX_TITLEBAR_HEIGHT : 0;
        updateInstanceWindowState(
          instanceId,
          instance.position ?? { x: 100, y: 100 },
          { width: size.width, height: size.height + extraHeight }
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

  const handleIframeLoad = useCallback(() => {
    setIsEmulatorLoaded(true);
  }, []);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "emulator_loaded") {
        setIsEmulatorLoaded(true);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

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
