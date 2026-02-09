import { lazy, Suspense, ComponentType, useEffect } from "react";
import { type AppId } from "./appRegistryData";
import type {
  AppProps,
  BaseApp,
  ControlPanelsInitialData,
  InternetExplorerInitialData,
  IpodInitialData,
  PaintInitialData,
  VideosInitialData,
} from "@/apps/base/types";
import type { AppletViewerInitialData } from "@/apps/applet-viewer";
import { useAppStore } from "@/stores/useAppStore";

export type { AppId };

export interface WindowSize {
  width: number;
  height: number;
}

export interface WindowConstraints {
  minSize?: WindowSize;
  maxSize?: WindowSize;
  defaultSize: WindowSize;
  mobileDefaultSize?: WindowSize;
  /** If true, mobile height will be set to window.innerWidth (square) */
  mobileSquare?: boolean;
}

// Default window constraints for any app not specified
const defaultWindowConstraints: WindowConstraints = {
  defaultSize: { width: 730, height: 475 },
  minSize: { width: 300, height: 200 },
};

// ============================================================================
// LAZY LOADING WRAPPER
// ============================================================================

// Signal component to notify store when lazy component is loaded
const LoadSignal = ({ instanceId }: { instanceId?: string }) => {
  const markInstanceAsLoaded = useAppStore((state) => state.markInstanceAsLoaded);
  useEffect(() => {
    if (instanceId) {
      // Use requestIdleCallback for non-urgent loading signal, falling back to setTimeout
      // This ensures we don't block the main thread during heavy app initialization
      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        const handle = window.requestIdleCallback(
          () => {
            markInstanceAsLoaded(instanceId);
          },
          { timeout: 1000 }
        );
        return () => window.cancelIdleCallback(handle);
      } else {
        const timer = setTimeout(() => {
          markInstanceAsLoaded(instanceId);
        }, 50); 
        return () => clearTimeout(timer);
      }
    }
  }, [instanceId, markInstanceAsLoaded]);
  return null;
};

// Cache for lazy components to maintain stable references across HMR
const lazyComponentCache = new Map<string, ComponentType<AppProps<unknown>>>();

// Helper to create a lazy-loaded component with Suspense
// Uses a cache to maintain stable component references across HMR
function createLazyComponent<T = unknown>(
  importFn: () => Promise<{ default: ComponentType<AppProps<T>> }>,
  cacheKey: string
): ComponentType<AppProps<T>> {
  // Return cached component if it exists (prevents HMR issues)
  const cached = lazyComponentCache.get(cacheKey);
  if (cached) {
    return cached as ComponentType<AppProps<T>>;
  }

  const LazyComponent = lazy(importFn);
  
  // Wrap with Suspense to handle loading state
  const WrappedComponent = (props: AppProps<T>) => (
    <Suspense fallback={null}>
      <LazyComponent {...props} />
      <LoadSignal instanceId={props.instanceId} />
    </Suspense>
  );
  
  // Cache the component
  lazyComponentCache.set(cacheKey, WrappedComponent as ComponentType<AppProps<unknown>>);
  
  return WrappedComponent;
}

// ============================================================================
// LAZY-LOADED APP COMPONENTS
// ============================================================================

// Critical apps (load immediately for perceived performance)
// Finder is critical - users see it on desktop
import { FinderAppComponent } from "@/apps/finder/components/FinderAppComponent";

// Lazy-loaded apps (loaded on-demand when opened)
// Each uses a cache key to maintain stable references across HMR
const LazyTextEditApp = createLazyComponent<unknown>(
  () => import("@/apps/textedit/components/TextEditAppComponent").then(m => ({ default: m.TextEditAppComponent })),
  "textedit"
);

const LazyInternetExplorerApp = createLazyComponent<InternetExplorerInitialData>(
  () => import("@/apps/internet-explorer/components/InternetExplorerAppComponent").then(m => ({ default: m.InternetExplorerAppComponent })),
  "internet-explorer"
);

const LazyChatsApp = createLazyComponent<unknown>(
  () => import("@/apps/chats/components/ChatsAppComponent").then(m => ({ default: m.ChatsAppComponent })),
  "chats"
);

const LazyControlPanelsApp = createLazyComponent<ControlPanelsInitialData>(
  () => import("@/apps/control-panels/components/ControlPanelsAppComponent").then(m => ({ default: m.ControlPanelsAppComponent })),
  "control-panels"
);

const LazyMinesweeperApp = createLazyComponent<unknown>(
  () => import("@/apps/minesweeper/components/MinesweeperAppComponent").then(m => ({ default: m.MinesweeperAppComponent })),
  "minesweeper"
);

const LazySoundboardApp = createLazyComponent<unknown>(
  () => import("@/apps/soundboard/components/SoundboardAppComponent").then(m => ({ default: m.SoundboardAppComponent })),
  "soundboard"
);

const LazyPaintApp = createLazyComponent<PaintInitialData>(
  () => import("@/apps/paint/components/PaintAppComponent").then(m => ({ default: m.PaintAppComponent })),
  "paint"
);

const LazyVideosApp = createLazyComponent<VideosInitialData>(
  () => import("@/apps/videos/components/VideosAppComponent").then(m => ({ default: m.VideosAppComponent })),
  "videos"
);

const LazyPcApp = createLazyComponent<unknown>(
  () => import("@/apps/pc/components/PcAppComponent").then(m => ({ default: m.PcAppComponent })),
  "pc"
);

const LazyPhotoBoothApp = createLazyComponent<unknown>(
  () => import("@/apps/photo-booth/components/PhotoBoothComponent").then(m => ({ default: m.PhotoBoothComponent })),
  "photo-booth"
);

const LazySynthApp = createLazyComponent<unknown>(
  () => import("@/apps/synth/components/SynthAppComponent").then(m => ({ default: m.SynthAppComponent })),
  "synth"
);

const LazyIpodApp = createLazyComponent<IpodInitialData>(
  () => import("@/apps/ipod/components/IpodAppComponent").then(m => ({ default: m.IpodAppComponent })),
  "ipod"
);

const LazyKaraokeApp = createLazyComponent<IpodInitialData>(
  () => import("@/apps/karaoke/components/KaraokeAppComponent").then(m => ({ default: m.KaraokeAppComponent })),
  "karaoke"
);

const LazyTerminalApp = createLazyComponent<unknown>(
  () => import("@/apps/terminal/components/TerminalAppComponent").then(m => ({ default: m.TerminalAppComponent })),
  "terminal"
);

const LazyAppletViewerApp = createLazyComponent<AppletViewerInitialData>(
  () => import("@/apps/applet-viewer/components/AppletViewerAppComponent").then(m => ({ default: m.AppletViewerAppComponent })),
  "applet-viewer"
);

const LazyAdminApp = createLazyComponent<unknown>(
  () => import("@/apps/admin/components/AdminAppComponent").then(m => ({ default: m.AdminAppComponent })),
  "admin"
);

const LazyStickiesApp = createLazyComponent<unknown>(
  () => import("@/apps/stickies/components/StickiesAppComponent").then(m => ({ default: m.StickiesAppComponent })),
  "stickies"
);

const LazyInfiniteMacApp = createLazyComponent<unknown>(
  () => import("@/apps/infinite-mac/components/InfiniteMacAppComponent").then(m => ({ default: m.InfiniteMacAppComponent })),
  "infinite-mac"
);

// ============================================================================
// APP METADATA (loaded eagerly - small, isolated from components)
// Import from metadata.ts files to avoid eager loading of components
// ============================================================================

import { appMetadata as finderMetadata, helpItems as finderHelpItems } from "@/apps/finder/metadata";
import { appMetadata as soundboardMetadata, helpItems as soundboardHelpItems } from "@/apps/soundboard/metadata";
import { appMetadata as internetExplorerMetadata, helpItems as internetExplorerHelpItems } from "@/apps/internet-explorer/metadata";
import { appMetadata as chatsMetadata, helpItems as chatsHelpItems } from "@/apps/chats/metadata";
import { appMetadata as texteditMetadata, helpItems as texteditHelpItems } from "@/apps/textedit/metadata";
import { appMetadata as paintMetadata, helpItems as paintHelpItems } from "@/apps/paint";
import { appMetadata as photoboothMetadata, helpItems as photoboothHelpItems } from "@/apps/photo-booth/metadata";
import { appMetadata as minesweeperMetadata, helpItems as minesweeperHelpItems } from "@/apps/minesweeper";
import { appMetadata as videosMetadata, helpItems as videosHelpItems } from "@/apps/videos/metadata";
import { appMetadata as ipodMetadata, helpItems as ipodHelpItems } from "@/apps/ipod/metadata";
import { appMetadata as karaokeMetadata, helpItems as karaokeHelpItems } from "@/apps/karaoke/metadata";
import { appMetadata as synthMetadata, helpItems as synthHelpItems } from "@/apps/synth/metadata";
import { appMetadata as pcMetadata, helpItems as pcHelpItems } from "@/apps/pc/metadata";
import { appMetadata as terminalMetadata, helpItems as terminalHelpItems } from "@/apps/terminal";
import { appMetadata as appletViewerMetadata, helpItems as appletViewerHelpItems } from "@/apps/applet-viewer";
import { appMetadata as controlPanelsMetadata, helpItems as controlPanelsHelpItems } from "@/apps/control-panels";
import { appMetadata as adminMetadata, helpItems as adminHelpItems } from "@/apps/admin/metadata";
import { appMetadata as stickiesMetadata, helpItems as stickiesHelpItems } from "@/apps/stickies";
import {
  appMetadata as infiniteMacMetadata,
  helpItems as infiniteMacHelpItems,
} from "@/apps/infinite-mac/metadata";
import { DEFAULT_WINDOW_SIZE_WITH_TITLEBAR as infiniteMacDefaultSize } from "@/apps/infinite-mac/hooks/useInfiniteMacLogic";

// ============================================================================
// APP REGISTRY
// ============================================================================

// Registry of all available apps with their window configurations
export const appRegistry = {
  ["finder"]: {
    id: "finder",
    name: "Finder",
    icon: { type: "image", src: "/icons/mac.png" },
    description: "Browse and manage files",
    component: FinderAppComponent, // Critical - loaded eagerly
    helpItems: finderHelpItems,
    metadata: finderMetadata,
    windowConfig: {
      defaultSize: { width: 400, height: 300 },
      minSize: { width: 300, height: 200 },
    } as WindowConstraints,
  },
  ["soundboard"]: {
    id: "soundboard",
    name: "Soundboard",
    icon: { type: "image", src: soundboardMetadata.icon },
    description: "Play sound effects",
    component: LazySoundboardApp,
    helpItems: soundboardHelpItems,
    metadata: soundboardMetadata,
    windowConfig: {
      defaultSize: { width: 650, height: 475 },
      minSize: { width: 550, height: 375 },
    } as WindowConstraints,
  },
  ["internet-explorer"]: {
    id: "internet-explorer",
    name: "Internet Explorer",
    icon: { type: "image", src: internetExplorerMetadata.icon },
    description: "Browse the web",
    component: LazyInternetExplorerApp,
    helpItems: internetExplorerHelpItems,
    metadata: internetExplorerMetadata,
    windowConfig: {
      defaultSize: { width: 730, height: 600 },
      minSize: { width: 400, height: 300 },
    } as WindowConstraints,
  } as BaseApp<InternetExplorerInitialData> & { windowConfig: WindowConstraints },
  ["chats"]: {
    id: "chats",
    name: "Chats",
    icon: { type: "image", src: chatsMetadata.icon },
    description: "Chat with AI",
    component: LazyChatsApp,
    helpItems: chatsHelpItems,
    metadata: chatsMetadata,
    windowConfig: {
      defaultSize: { width: 560, height: 360 },
      minSize: { width: 300, height: 320 },
    } as WindowConstraints,
  },
  ["textedit"]: {
    id: "textedit",
    name: "TextEdit",
    icon: { type: "image", src: texteditMetadata.icon },
    description: "A simple rich text editor",
    component: LazyTextEditApp,
    helpItems: texteditHelpItems,
    metadata: texteditMetadata,
    windowConfig: {
      defaultSize: { width: 430, height: 475 },
      minSize: { width: 430, height: 200 },
    } as WindowConstraints,
  },
  ["paint"]: {
    id: "paint",
    name: "Paint",
    icon: { type: "image", src: paintMetadata.icon },
    description: "Draw and edit images",
    component: LazyPaintApp,
    helpItems: paintHelpItems,
    metadata: paintMetadata,
    windowConfig: {
      defaultSize: { width: 713, height: 480 },
      minSize: { width: 400, height: 400 },
      maxSize: { width: 713, height: 535 },
    } as WindowConstraints,
  } as BaseApp<PaintInitialData> & { windowConfig: WindowConstraints },
  ["photo-booth"]: {
    id: "photo-booth",
    name: "Photo Booth",
    icon: { type: "image", src: photoboothMetadata.icon },
    description: "Take photos with effects",
    component: LazyPhotoBoothApp,
    helpItems: photoboothHelpItems,
    metadata: photoboothMetadata,
    windowConfig: {
      defaultSize: { width: 644, height: 510 },
      minSize: { width: 644, height: 510 },
      maxSize: { width: 644, height: 510 },
    } as WindowConstraints,
  },
  ["minesweeper"]: {
    id: "minesweeper",
    name: "Minesweeper",
    icon: { type: "image", src: minesweeperMetadata!.icon },
    description: "Classic puzzle game",
    component: LazyMinesweeperApp,
    helpItems: minesweeperHelpItems,
    metadata: minesweeperMetadata,
    windowConfig: {
      defaultSize: { width: 305, height: 400 },
      minSize: { width: 305, height: 400 },
      maxSize: { width: 305, height: 400 },
    } as WindowConstraints,
  },
  ["videos"]: {
    id: "videos",
    name: "Videos",
    icon: { type: "image", src: videosMetadata.icon },
    description: "Watch videos",
    component: LazyVideosApp,
    helpItems: videosHelpItems,
    metadata: videosMetadata,
    windowConfig: {
      defaultSize: { width: 400, height: 420 },
      minSize: { width: 400, height: 340 },
    } as WindowConstraints,
  } as BaseApp<VideosInitialData> & { windowConfig: WindowConstraints },
  ["ipod"]: {
    id: "ipod",
    name: "iPod",
    icon: { type: "image", src: ipodMetadata.icon },
    description: "Music player",
    component: LazyIpodApp,
    helpItems: ipodHelpItems,
    metadata: ipodMetadata,
    windowConfig: {
      defaultSize: { width: 300, height: 480 },
      minSize: { width: 300, height: 480 },
    } as WindowConstraints,
  } as BaseApp<IpodInitialData> & { windowConfig: WindowConstraints },
  ["karaoke"]: {
    id: "karaoke",
    name: "Karaoke",
    icon: { type: "image", src: karaokeMetadata.icon },
    description: "Karaoke player with synced lyrics",
    component: LazyKaraokeApp,
    helpItems: karaokeHelpItems,
    metadata: karaokeMetadata,
    windowConfig: {
      defaultSize: { width: 560, height: 560 },
      minSize: { width: 400, height: 300 },
      mobileSquare: true,
    } as WindowConstraints,
  } as BaseApp<IpodInitialData> & { windowConfig: WindowConstraints },
  ["synth"]: {
    id: "synth",
    name: "Synth",
    icon: { type: "image", src: synthMetadata.icon },
    description: "Virtual synthesizer",
    component: LazySynthApp,
    helpItems: synthHelpItems,
    metadata: synthMetadata,
    windowConfig: {
      defaultSize: { width: 720, height: 400 },
      minSize: { width: 720, height: 290 },
    } as WindowConstraints,
  },
  ["pc"]: {
    id: "pc",
    name: "Virtual PC",
    icon: { type: "image", src: pcMetadata.icon },
    description: "3D PC simulation",
    component: LazyPcApp,
    helpItems: pcHelpItems,
    metadata: pcMetadata,
    windowConfig: {
      defaultSize: { width: 645, height: 511 },
      minSize: { width: 645, height: 511 },
      maxSize: { width: 645, height: 511 },
    } as WindowConstraints,
  },
  ["terminal"]: {
    id: "terminal",
    name: "Terminal",
    icon: { type: "image", src: terminalMetadata!.icon },
    description: "Command line interface",
    component: LazyTerminalApp,
    helpItems: terminalHelpItems,
    metadata: terminalMetadata,
    windowConfig: {
      defaultSize: { width: 600, height: 400 },
      minSize: { width: 400, height: 300 },
    } as WindowConstraints,
  },
  ["applet-viewer"]: {
    id: "applet-viewer",
    name: "Applet Store",
    icon: { type: "image", src: appletViewerMetadata.icon },
    description: "View and run applets",
    component: LazyAppletViewerApp,
    helpItems: appletViewerHelpItems,
    metadata: appletViewerMetadata,
    windowConfig: {
      defaultSize: { width: 320, height: 450 },
      minSize: { width: 300, height: 200 },
    } as WindowConstraints,
  } as BaseApp<AppletViewerInitialData> & { windowConfig: WindowConstraints },
  ["control-panels"]: {
    id: "control-panels",
    name: "Control Panels",
    icon: { type: "image", src: controlPanelsMetadata.icon },
    description: "System settings",
    component: LazyControlPanelsApp,
    helpItems: controlPanelsHelpItems,
    metadata: controlPanelsMetadata,
    windowConfig: {
      defaultSize: { width: 365, height: 415 },
      minSize: { width: 320, height: 415 },
      maxSize: { width: 365, height: 600 },
    } as WindowConstraints,
  } as BaseApp<ControlPanelsInitialData> & { windowConfig: WindowConstraints },
  ["admin"]: {
    id: "admin",
    name: "Admin",
    icon: { type: "image", src: adminMetadata.icon },
    description: "System administration panel",
    component: LazyAdminApp,
    helpItems: adminHelpItems,
    metadata: adminMetadata,
    adminOnly: true, // Only visible to admin user (ryo)
    windowConfig: {
      defaultSize: { width: 800, height: 500 },
      minSize: { width: 600, height: 400 },
    } as WindowConstraints,
  },
  ["stickies"]: {
    id: "stickies",
    name: "Stickies",
    icon: { type: "image", src: stickiesMetadata.icon },
    description: "Sticky notes for quick reminders",
    component: LazyStickiesApp,
    helpItems: stickiesHelpItems,
    metadata: stickiesMetadata,
    windowConfig: {
      defaultSize: { width: 500, height: 400 },
      minSize: { width: 300, height: 250 },
    } as WindowConstraints,
  },
  ["infinite-mac"]: {
    id: "infinite-mac",
    name: "Infinite Mac",
    icon: { type: "image", src: infiniteMacMetadata.icon },
    description: "Classic Mac OS emulators",
    component: LazyInfiniteMacApp,
    helpItems: infiniteMacHelpItems,
    metadata: infiniteMacMetadata,
    windowConfig: {
      defaultSize: infiniteMacDefaultSize,
      minSize: { width: 512, height: 342 },
      maxSize: { width: 1024, height: 792 }, // 768 + 24 for macOS X titlebar spacer
    } as WindowConstraints,
  },
} as const;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Helper function to get app icon path
export const getAppIconPath = (appId: AppId): string => {
  const app = appRegistry[appId];
  if (typeof app.icon === "string") {
    return app.icon;
  }
  return app.icon.src;
};

// Helper function to get all apps except Finder
// Pass isAdmin=true to include admin-only apps
export const getNonFinderApps = (isAdmin: boolean = false): Array<{
  name: string;
  icon: string;
  id: AppId;
}> => {
  return Object.entries(appRegistry)
    .filter(([id, app]) => {
      if (id === "finder") return false;
      // Filter out admin-only apps for non-admin users
      if ((app as { adminOnly?: boolean }).adminOnly && !isAdmin) return false;
      return true;
    })
    .map(([id, app]) => ({
      name: app.name,
      icon: getAppIconPath(id as AppId),
      id: id as AppId,
    }));
};

// Helper function to get app metadata
export const getAppMetadata = (appId: AppId) => {
  return appRegistry[appId].metadata;
};

// Helper function to get app component
export const getAppComponent = (appId: AppId) => {
  return appRegistry[appId].component;
};

// Helper function to get window configuration
export const getWindowConfig = (appId: AppId): WindowConstraints => {
  return appRegistry[appId].windowConfig || defaultWindowConstraints;
};

// Helper function to get mobile window size
export const getMobileWindowSize = (appId: AppId): WindowSize => {
  const config = getWindowConfig(appId);
  if (config.mobileDefaultSize) {
    return config.mobileDefaultSize;
  }
  // Square aspect ratio: height = width
  if (config.mobileSquare) {
    return {
      width: window.innerWidth,
      height: window.innerWidth,
    };
  }
  return {
    width: window.innerWidth,
    height: config.defaultSize.height,
  };
};
