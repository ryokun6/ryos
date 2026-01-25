import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useThemeStore } from "@/stores/useThemeStore";
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
}

export const MAC_PRESETS: MacPreset[] = [
  {
    id: "system-1",
    name: "System 1.0",
    year: "1984",
    disk: "System 1.0",
    description: "Initial Mac system software",
    image: "/icons/default/infinite-mac.png",
  },
  {
    id: "system-6",
    name: "System 6.0.8",
    year: "1991",
    disk: "System 6.0.8",
    description: "Final System 6 release",
    image: "/icons/default/infinite-mac.png",
  },
  {
    id: "system-7",
    name: "System 7.0",
    year: "1991",
    disk: "System 7.0",
    description: "Fully 32-bit clean, MultiFinder",
    image: "/icons/default/infinite-mac.png",
  },
  {
    id: "system-7-5",
    name: "System 7.5.3",
    year: "1996",
    disk: "System 7.5.3",
    description: "Open Transport and broader Mac support",
    image: "/icons/default/infinite-mac.png",
  },
  {
    id: "macos-8",
    name: "Mac OS 8.0",
    year: "1997",
    disk: "Mac OS 8.0",
    description: "Platinum appearance, multi-threaded Finder",
    image: "/icons/default/infinite-mac.png",
  },
  {
    id: "macos-8-5",
    name: "Mac OS 8.5",
    year: "1998",
    disk: "Mac OS 8.5",
    description: "Sherlock, 32-bit icons, font smoothing",
    image: "/icons/default/infinite-mac.png",
  },
  {
    id: "macos-9",
    name: "Mac OS 9.0",
    year: "1999",
    disk: "Mac OS 9.0",
    description: "Keychain, multiple users, Sherlock channels",
    image: "/icons/default/infinite-mac.png",
  },
  {
    id: "macos-9-2",
    name: "Mac OS 9.2.2",
    year: "2001",
    disk: "Mac OS 9.2.2",
    description: "Final classic Mac OS release",
    image: "/icons/default/infinite-mac.png",
  },
  {
    id: "macosx-10-0",
    name: "Mac OS X 10.0",
    year: "2001",
    disk: "Mac OS X 10.0",
    machine: "Power Macintosh G3 (Blue & White)",
    description: "Aqua interface, Quartz graphics, the Dock",
    image: "/icons/default/infinite-mac.png",
  },
  {
    id: "macosx-10-2",
    name: "Mac OS X 10.2",
    year: "2002",
    disk: "Mac OS X 10.2",
    machine: "Power Macintosh G4 (PCI Graphics)",
    description: "Jaguar - Quartz Extreme, Address Book, iChat",
    image: "/icons/default/infinite-mac.png",
  },
  {
    id: "macosx-10-3",
    name: "Mac OS X 10.3",
    year: "2003",
    disk: "Mac OS X 10.3",
    machine: "Power Macintosh G4 (PCI Graphics)",
    description: "Panther - Exposé, fast user switching",
    image: "/icons/default/infinite-mac.png",
  },
  {
    id: "macosx-10-4",
    name: "Mac OS X 10.4",
    year: "2005",
    disk: "Mac OS X 10.4",
    machine: "Power Macintosh G4 (PCI Graphics)",
    description: "Tiger - Spotlight, Dashboard, Safari RSS",
    image: "/icons/default/infinite-mac.png",
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
  return url.toString();
}

interface UseInfiniteMacLogicProps {
  isWindowOpen: boolean;
  instanceId?: string;
}

export function useInfiniteMacLogic({
  isWindowOpen: _isWindowOpen,
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

  const handleSelectPreset = useCallback((preset: MacPreset) => {
    setSelectedPreset(preset);
    setIsEmulatorLoaded(false);
    setIsPaused(false);
  }, []);

  const handleBackToPresets = useCallback(() => {
    setSelectedPreset(null);
    setIsEmulatorLoaded(false);
    setIsPaused(false);
  }, []);

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
