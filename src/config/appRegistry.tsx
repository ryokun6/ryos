import { lazy, Suspense, ComponentType } from "react";
import { appIds } from "./appIds";
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
import { MenuBar } from "@/components/layout/MenuBar";

export type AppId = (typeof appIds)[number];

export interface WindowSize {
  width: number;
  height: number;
}

export interface WindowConstraints {
  minSize?: WindowSize;
  maxSize?: WindowSize;
  defaultSize: WindowSize;
  mobileDefaultSize?: WindowSize;
}

// Default window constraints for any app not specified
const defaultWindowConstraints: WindowConstraints = {
  defaultSize: { width: 730, height: 475 },
  minSize: { width: 300, height: 200 },
};

// ============================================================================
// LAZY LOADING WRAPPER
// ============================================================================

// Loading fallback that shows the MenuBar while app loads
// This prevents the menu bar from disappearing during lazy load
const LoadingFallback = () => <MenuBar />;

// Helper to create a lazy-loaded component with Suspense
function createLazyComponent<T = unknown>(
  importFn: () => Promise<{ default: ComponentType<AppProps<T>> }>
): ComponentType<AppProps<T>> {
  const LazyComponent = lazy(importFn);
  
  // Wrap with Suspense to handle loading state
  // Shows MenuBar while loading to prevent UI flash
  const WrappedComponent = (props: AppProps<T>) => (
    <Suspense fallback={<LoadingFallback />}>
      <LazyComponent {...props} />
    </Suspense>
  );
  
  return WrappedComponent;
}

// ============================================================================
// LAZY-LOADED APP COMPONENTS
// ============================================================================

// Critical apps (load immediately for perceived performance)
// Finder is critical - users see it on desktop
import { FinderAppComponent } from "@/apps/finder/components/FinderAppComponent";

// Lazy-loaded apps (loaded on-demand when opened)
const LazyTextEditApp = createLazyComponent(
  () => import("@/apps/textedit/components/TextEditAppComponent").then(m => ({ default: m.TextEditAppComponent }))
);

const LazyInternetExplorerApp = createLazyComponent<InternetExplorerInitialData>(
  () => import("@/apps/internet-explorer/components/InternetExplorerAppComponent").then(m => ({ default: m.InternetExplorerAppComponent }))
);

const LazyChatsApp = createLazyComponent(
  () => import("@/apps/chats/components/ChatsAppComponent").then(m => ({ default: m.ChatsAppComponent }))
);

const LazyControlPanelsApp = createLazyComponent<ControlPanelsInitialData>(
  () => import("@/apps/control-panels/components/ControlPanelsAppComponent").then(m => ({ default: m.ControlPanelsAppComponent }))
);

const LazyMinesweeperApp = createLazyComponent(
  () => import("@/apps/minesweeper/components/MinesweeperAppComponent").then(m => ({ default: m.MinesweeperAppComponent }))
);

const LazySoundboardApp = createLazyComponent(
  () => import("@/apps/soundboard/components/SoundboardAppComponent").then(m => ({ default: m.SoundboardAppComponent }))
);

const LazyPaintApp = createLazyComponent<PaintInitialData>(
  () => import("@/apps/paint/components/PaintAppComponent").then(m => ({ default: m.PaintAppComponent }))
);

const LazyVideosApp = createLazyComponent<VideosInitialData>(
  () => import("@/apps/videos/components/VideosAppComponent").then(m => ({ default: m.VideosAppComponent }))
);

const LazyPcApp = createLazyComponent(
  () => import("@/apps/pc/components/PcAppComponent").then(m => ({ default: m.PcAppComponent }))
);

const LazyPhotoBoothApp = createLazyComponent(
  () => import("@/apps/photo-booth/components/PhotoBoothComponent").then(m => ({ default: m.PhotoBoothAppComponent }))
);

const LazySynthApp = createLazyComponent(
  () => import("@/apps/synth/components/SynthAppComponent").then(m => ({ default: m.SynthAppComponent }))
);

const LazyIpodApp = createLazyComponent<IpodInitialData>(
  () => import("@/apps/ipod/components/IpodAppComponent").then(m => ({ default: m.IpodAppComponent }))
);

const LazyTerminalApp = createLazyComponent(
  () => import("@/apps/terminal/components/TerminalAppComponent").then(m => ({ default: m.TerminalAppComponent }))
);

const LazyAppletViewerApp = createLazyComponent<AppletViewerInitialData>(
  () => import("@/apps/applet-viewer/components/AppletViewerAppComponent").then(m => ({ default: m.AppletViewerAppComponent }))
);

// ============================================================================
// APP METADATA (loaded eagerly - small)
// ============================================================================

import { appMetadata as finderMetadata, helpItems as finderHelpItems } from "@/apps/finder";
import { appMetadata as soundboardMetadata, helpItems as soundboardHelpItems } from "@/apps/soundboard";
import { appMetadata as internetExplorerMetadata, helpItems as internetExplorerHelpItems } from "@/apps/internet-explorer";
import { appMetadata as chatsMetadata, helpItems as chatsHelpItems } from "@/apps/chats";
import { appMetadata as texteditMetadata, helpItems as texteditHelpItems } from "@/apps/textedit";
import { appMetadata as paintMetadata, helpItems as paintHelpItems } from "@/apps/paint";
import { appMetadata as photoboothMetadata, helpItems as photoboothHelpItems } from "@/apps/photo-booth";
import { appMetadata as minesweeperMetadata, helpItems as minesweeperHelpItems } from "@/apps/minesweeper";
import { appMetadata as videosMetadata, helpItems as videosHelpItems } from "@/apps/videos";
import { appMetadata as ipodMetadata, helpItems as ipodHelpItems } from "@/apps/ipod";
import { appMetadata as synthMetadata, helpItems as synthHelpItems } from "@/apps/synth";
import { appMetadata as pcMetadata, helpItems as pcHelpItems } from "@/apps/pc";
import { appMetadata as terminalMetadata, helpItems as terminalHelpItems } from "@/apps/terminal";
import { appMetadata as appletViewerMetadata, helpItems as appletViewerHelpItems } from "@/apps/applet-viewer";
import { appMetadata as controlPanelsMetadata, helpItems as controlPanelsHelpItems } from "@/apps/control-panels";

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
    icon: { type: "image", src: minesweeperMetadata.icon },
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
    name: "PC",
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
    icon: { type: "image", src: terminalMetadata.icon },
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
    name: "Applet Viewer",
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
export const getNonFinderApps = (): Array<{
  name: string;
  icon: string;
  id: AppId;
}> => {
  return Object.entries(appRegistry)
    .filter(([id]) => id !== "finder")
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
  return {
    width: window.innerWidth,
    height: config.defaultSize.height,
  };
};
