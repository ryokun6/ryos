import type { AppState } from "@/apps/base/types";
import type { AppId } from "@/config/appRegistry";
import type { AIModel } from "@/types/aiModels";

/** Position rect for launch origin animation */
export interface LaunchOriginRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AppInstance extends AppState {
  instanceId: string;
  appId: AppId;
  title?: string;
  displayTitle?: string; // Dynamic title for dock menu (updated by WindowFrame)
  createdAt: number; // stable ordering for taskbar (creation time)
  isLoading?: boolean;
  isMinimized?: boolean;
  launchOrigin?: LaunchOriginRect; // Position of the icon that launched this instance
}

export interface RecentApp {
  appId: AppId;
  timestamp: number;
}

export interface RecentDocument {
  path: string;
  name: string;
  appId: AppId;
  icon?: string;
  timestamp: number;
}

export interface AppStoreState {
  // Instance (window) management
  instances: Record<string, AppInstance>;
  instanceOrder: string[]; // END = TOP (foreground)
  foregroundInstanceId: string | null;
  nextInstanceId: number;

  // Version / migration
  version: number;

  // Instance methods
  createAppInstance: (
    appId: AppId,
    initialData?: unknown,
    title?: string,
    launchOrigin?: LaunchOriginRect
  ) => string;
  markInstanceAsLoaded: (instanceId: string) => void;
  closeAppInstance: (instanceId: string) => void;
  bringInstanceToForeground: (instanceId: string) => void;
  updateInstanceWindowState: (
    instanceId: string,
    position: { x: number; y: number },
    size: { width: number; height: number }
  ) => void;
  getInstancesByAppId: (appId: AppId) => AppInstance[];
  getForegroundInstance: () => AppInstance | null;
  navigateToNextInstance: (currentInstanceId: string) => void;
  navigateToPreviousInstance: (currentInstanceId: string) => void;
  minimizeInstance: (instanceId: string) => void;
  restoreInstance: (instanceId: string) => void;
  updateInstanceTitle: (instanceId: string, title: string) => void;
  launchApp: (
    appId: AppId,
    initialData?: unknown,
    title?: string,
    multiWindow?: boolean,
    launchOrigin?: LaunchOriginRect
  ) => string;

  // Misc state & helpers
  clearInstanceInitialData: (instanceId: string) => void;
  updateInstanceInitialData: (instanceId: string, initialData: unknown) => void;
  aiModel: AIModel;
  setAiModel: (m: AIModel) => void;
  isFirstBoot: boolean;
  setHasBooted: () => void;
  macAppToastShown: boolean;
  setMacAppToastShown: () => void;
  lastSeenDesktopVersion: string | null;
  setLastSeenDesktopVersion: (version: string) => void;
  _debugCheckInstanceIntegrity: () => void;

  // Expose/Mission Control mode
  exposeMode: boolean;
  setExposeMode: (v: boolean) => void;

  // ryOS version (fetched from version.json)
  ryOSVersion: string | null;
  ryOSBuildNumber: string | null;
  ryOSBuildTime: string | null;
  setRyOSVersion: (version: string, buildNumber: string, buildTime?: string) => void;

  // Recent items
  recentApps: RecentApp[];
  recentDocuments: RecentDocument[];
  addRecentApp: (appId: AppId) => void;
  addRecentDocument: (path: string, name: string, appId: AppId, icon?: string) => void;
  clearRecentItems: () => void;
}
