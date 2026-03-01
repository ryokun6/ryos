import type { AppId } from "@/config/appRegistry";
import type { AppStoreState, RecentApp, RecentDocument } from "./types";

export function createRecentSlice(
  set: (partial: Partial<AppStoreState> | ((state: AppStoreState) => Partial<AppStoreState>)) => void
): Pick<
  AppStoreState,
  | "recentApps"
  | "recentDocuments"
  | "addRecentApp"
  | "addRecentDocument"
  | "clearRecentItems"
> {
  return {
    recentApps: [],
    recentDocuments: [],
    addRecentApp: (appId: AppId) =>
      set((state) => {
        const filtered = state.recentApps.filter((r) => r.appId !== appId);
        const newRecent: RecentApp = { appId, timestamp: Date.now() };
        return { recentApps: [newRecent, ...filtered].slice(0, 20) };
      }),
    addRecentDocument: (path: string, name: string, appId: AppId, icon?: string) =>
      set((state) => {
        const filtered = state.recentDocuments.filter((r) => r.path !== path);
        const newRecent: RecentDocument = { path, name, appId, icon, timestamp: Date.now() };
        return { recentDocuments: [newRecent, ...filtered].slice(0, 20) };
      }),
    clearRecentItems: () => set({ recentApps: [], recentDocuments: [] }),
  };
}
