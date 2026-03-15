import type { AppId } from "@/config/appRegistry";

const APPS_THAT_TRIGGER_CLOUD_SYNC_CHECK_ON_LAUNCH = new Set<AppId>([
  "finder",
  "textedit",
  "paint",
  "applet-viewer",
  "control-panels",
  "stickies",
  "calendar",
  "contacts",
  "ipod",
  "karaoke",
  "videos",
  "dashboard",
]);

export function shouldRequestCloudSyncOnAppLaunch(appId: AppId): boolean {
  return APPS_THAT_TRIGGER_CLOUD_SYNC_CHECK_ON_LAUNCH.has(appId);
}
