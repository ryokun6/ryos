import type { AppId } from "@/config/appRegistry";
import type { AppInstance, AppStoreState, RecentApp, RecentDocument } from "./types";

/** Pure selector: get foreground instance from state */
export function getForegroundInstance(state: AppStoreState): AppInstance | null {
  const id = state.foregroundInstanceId;
  return id ? state.instances[id] || null : null;
}

/** Pure selector: get all instances for an app */
export function getInstancesByAppId(state: AppStoreState, appId: AppId): AppInstance[] {
  return Object.values(state.instances).filter((i) => i.appId === appId);
}

/** Pure selector: get recent apps */
export function getRecentApps(state: AppStoreState): RecentApp[] {
  return state.recentApps;
}

/** Pure selector: get recent documents */
export function getRecentDocuments(state: AppStoreState): RecentDocument[] {
  return state.recentDocuments;
}
