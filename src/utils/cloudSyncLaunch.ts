import type { AppId } from "@/config/appRegistry";
import type { CloudSyncDomain } from "@/utils/cloudSyncShared";

const APP_CLOUD_SYNC_DOMAINS: Partial<Record<AppId, CloudSyncDomain[]>> = {
  stickies: ["stickies"],
  calendar: ["calendar"],
  contacts: ["contacts"],
  maps: ["maps"],
  ipod: ["songs", "settings"],
  karaoke: ["songs", "settings"],
  videos: ["videos"],
  tv: ["tv"],
};

const APPS_THAT_TRIGGER_CLOUD_SYNC_CHECK_ON_LAUNCH = new Set<AppId>([
  "finder",
  "textedit",
  "paint",
  "applet-viewer",
  "control-panels",
  "stickies",
  "calendar",
  "contacts",
  "maps",
  "ipod",
  "karaoke",
  "videos",
  "tv",
  "dashboard",
]);

export function shouldRequestCloudSyncOnAppLaunch(appId: AppId): boolean {
  return APPS_THAT_TRIGGER_CLOUD_SYNC_CHECK_ON_LAUNCH.has(appId);
}

export function getCloudSyncDomainsForApp(appId: AppId): CloudSyncDomain[] | null {
  return APP_CLOUD_SYNC_DOMAINS[appId] ?? null;
}
