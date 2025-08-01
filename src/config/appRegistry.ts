import { TextEditApp } from "@/apps/textedit";
import { InternetExplorerApp } from "@/apps/internet-explorer";
import { ChatsApp } from "@/apps/chats";
import ControlPanelsApp from "@/apps/control-panels";
import { MinesweeperApp } from "@/apps/minesweeper";
import { SoundboardApp } from "@/apps/soundboard";
import { FinderApp } from "@/apps/finder";
import { PaintApp } from "@/apps/paint";
import { VideosApp } from "@/apps/videos";
import { PcApp } from "@/apps/pc";
import { PhotoBoothApp } from "@/apps/photo-booth";
import { SynthApp } from "@/apps/synth";
import { IpodApp } from "@/apps/ipod";
import { TerminalApp } from "@/apps/terminal";
import { DesignSystemAppConfig } from "@/apps/design-system/config";
import { appIds } from "./appIds";
import type {
  BaseApp,
  ControlPanelsInitialData,
  InternetExplorerInitialData,
  IpodInitialData,
  PaintInitialData,
  VideosInitialData,
} from "@/apps/base/types";

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

// Registry of all available apps with their window configurations
export const appRegistry = {
  [FinderApp.id]: {
    ...FinderApp,
    windowConfig: {
      defaultSize: { width: 400, height: 300 },
      minSize: { width: 300, height: 200 },
    } as WindowConstraints,
  },
  [SoundboardApp.id]: {
    ...SoundboardApp,
    windowConfig: {
      defaultSize: { width: 650, height: 475 },
      minSize: { width: 550, height: 375 },
    } as WindowConstraints,
  },
  [InternetExplorerApp.id]: {
    ...(InternetExplorerApp as BaseApp<InternetExplorerInitialData>),
    windowConfig: {
      defaultSize: { width: 730, height: 600 },
      minSize: { width: 400, height: 300 },
    } as WindowConstraints,
  },
  [ChatsApp.id]: {
    ...ChatsApp,
    windowConfig: {
      defaultSize: { width: 560, height: 360 },
      minSize: { width: 300, height: 320 },
    } as WindowConstraints,
  },
  [TextEditApp.id]: {
    ...TextEditApp,
    windowConfig: {
      defaultSize: { width: 388, height: 475 },
      minSize: { width: 388, height: 200 },
    } as WindowConstraints,
  },
  [PaintApp.id]: {
    ...(PaintApp as BaseApp<PaintInitialData>),
    windowConfig: {
      defaultSize: { width: 713, height: 480 },
      minSize: { width: 400, height: 400 },
      maxSize: { width: 713, height: 535 },
    } as WindowConstraints,
  },
  [PhotoBoothApp.id]: {
    ...PhotoBoothApp,
    windowConfig: {
      defaultSize: { width: 644, height: 510 },
      minSize: { width: 644, height: 510 },
      maxSize: { width: 644, height: 510 },
    } as WindowConstraints,
  },
  [MinesweeperApp.id]: {
    ...MinesweeperApp,
    windowConfig: {
      defaultSize: { width: 305, height: 400 },
      minSize: { width: 305, height: 400 },
      maxSize: { width: 305, height: 400 },
    } as WindowConstraints,
  },
  [VideosApp.id]: {
    ...(VideosApp as BaseApp<VideosInitialData>),
    windowConfig: {
      defaultSize: { width: 400, height: 420 },
      minSize: { width: 400, height: 340 },
    } as WindowConstraints,
  },
  [IpodApp.id]: {
    ...(IpodApp as BaseApp<IpodInitialData>),
    windowConfig: {
      defaultSize: { width: 300, height: 480 },
      minSize: { width: 300, height: 480 },
    } as WindowConstraints,
  },
  [SynthApp.id]: {
    ...SynthApp,
    windowConfig: {
      defaultSize: { width: 720, height: 400 },
      minSize: { width: 720, height: 290 },
    } as WindowConstraints,
  },
  [PcApp.id]: {
    ...PcApp,
    windowConfig: {
      defaultSize: { width: 645, height: 511 },
      minSize: { width: 645, height: 511 },
      maxSize: { width: 645, height: 511 },
    } as WindowConstraints,
  },
  [TerminalApp.id]: {
    ...TerminalApp,
    windowConfig: {
      defaultSize: { width: 600, height: 400 },
      minSize: { width: 400, height: 300 },
    } as WindowConstraints,
  },
  [ControlPanelsApp.id]: {
    ...(ControlPanelsApp as BaseApp<ControlPanelsInitialData>),
    windowConfig: {
      defaultSize: { width: 365, height: 415 },
      minSize: { width: 320, height: 415 },
      maxSize: { width: 365, height: 600 },
    } as WindowConstraints,
  },
  [DesignSystemAppConfig.id]: {
    ...DesignSystemAppConfig,
    windowConfig: {
      defaultSize: { width: 1200, height: 800 },
      minSize: { width: 800, height: 600 },
    } as WindowConstraints,
  },
} as const;

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
