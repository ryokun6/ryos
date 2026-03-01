import type { AIModel } from "@/types/aiModels";
import type { AppStoreState } from "./types";

export function createPreferencesSlice(
  set: (partial: Partial<AppStoreState> | ((state: AppStoreState) => Partial<AppStoreState>)) => void
): Pick<
  AppStoreState,
  | "aiModel"
  | "setAiModel"
  | "isFirstBoot"
  | "setHasBooted"
  | "macAppToastShown"
  | "setMacAppToastShown"
  | "lastSeenDesktopVersion"
  | "setLastSeenDesktopVersion"
  | "exposeMode"
  | "setExposeMode"
  | "ryOSVersion"
  | "ryOSBuildNumber"
  | "ryOSBuildTime"
  | "setRyOSVersion"
> {
  return {
    aiModel: null,
    setAiModel: (m: AIModel) => set({ aiModel: m }),

    isFirstBoot: true,
    setHasBooted: () => set({ isFirstBoot: false }),
    macAppToastShown: false,
    setMacAppToastShown: () => set({ macAppToastShown: true }),
    lastSeenDesktopVersion: null,
    setLastSeenDesktopVersion: (version: string) => set({ lastSeenDesktopVersion: version }),

    exposeMode: false,
    setExposeMode: (v: boolean) => set({ exposeMode: v }),

    ryOSVersion: null,
    ryOSBuildNumber: null,
    ryOSBuildTime: null,
    setRyOSVersion: (version: string, buildNumber: string, buildTime?: string) =>
      set({
        ryOSVersion: version,
        ryOSBuildNumber: buildNumber,
        ryOSBuildTime: buildTime || null,
      }),
  };
}
