import { createAppStore } from "./app-store/create-store";

export type { AIModel } from "@/types/aiModels";
export type {
  AppInstance,
  AppStoreState,
  LaunchOriginRect,
  RecentApp,
  RecentDocument,
} from "./app-store/types";

// Preserve store across Vite HMR to prevent "split-brain" instances.
let useAppStore = createAppStore();
if (import.meta.hot) {
  const data = import.meta.hot.data as { useAppStore?: typeof useAppStore };
  if (data.useAppStore) {
    useAppStore = data.useAppStore;
  } else {
    data.useAppStore = useAppStore;
  }
}
export { useAppStore };

export const clearAllAppStates = (): void => {
  try {
    localStorage.clear();
  } catch (e) {
    console.error("clearAllAppStates", e);
  }
};
