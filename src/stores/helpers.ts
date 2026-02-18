import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "./useAppStore";
import { useIpodStore } from "./useIpodStore";
import { useVideoStore } from "./useVideoStore";
import { useAudioSettingsStore } from "./useAudioSettingsStore";
import { useDisplaySettingsStore } from "./useDisplaySettingsStore";
import { useChatsStore } from "./useChatsStore";
import { useFilesStore } from "./useFilesStore";
import { useTerminalStore } from "./useTerminalStore";
import { useInternetExplorerStore } from "./useInternetExplorerStore";

/** Generic factory for Zustand shallow selectors. Creates a hook that wraps useShallow(selector). */
function createUseStoreShallow<S>(useStore: (selector: (s: S) => unknown) => unknown) {
  return function useStoreShallow<T>(selector: (state: S) => T): T {
    return useStore(useShallow(selector)) as T;
  };
}

export const useAppStoreShallow = createUseStoreShallow(useAppStore);
export const useIpodStoreShallow = createUseStoreShallow(useIpodStore);
export const useVideoStoreShallow = createUseStoreShallow(useVideoStore);
export const useAudioSettingsStoreShallow = createUseStoreShallow(useAudioSettingsStore);
export const useDisplaySettingsStoreShallow = createUseStoreShallow(useDisplaySettingsStore);
export const useChatsStoreShallow = createUseStoreShallow(useChatsStore);
export const useFilesStoreShallow = createUseStoreShallow(useFilesStore);
export const useTerminalStoreShallow = createUseStoreShallow(useTerminalStore);
export const useInternetExplorerStoreShallow = createUseStoreShallow(useInternetExplorerStore);