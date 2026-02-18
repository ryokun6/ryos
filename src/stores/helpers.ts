import { useShallow } from "zustand/react/shallow";
import type { StoreApi, UseBoundStore } from "zustand";
import { useAppStore } from "./useAppStore";
import { useIpodStore } from "./useIpodStore";
import { useVideoStore } from "./useVideoStore";
import { useAudioSettingsStore } from "./useAudioSettingsStore";
import { useDisplaySettingsStore } from "./useDisplaySettingsStore";
import { useChatsStore } from "./useChatsStore";
import { useFilesStore } from "./useFilesStore";
import { useTerminalStore } from "./useTerminalStore";
import { useInternetExplorerStore } from "./useInternetExplorerStore";

function createShallowSelector<S>(store: UseBoundStore<StoreApi<S>>) {
  return <T>(selector: (state: S) => T): T => store(useShallow(selector));
}

export const useAppStoreShallow = createShallowSelector(useAppStore);
export const useIpodStoreShallow = createShallowSelector(useIpodStore);
export const useVideoStoreShallow = createShallowSelector(useVideoStore);
export const useAudioSettingsStoreShallow = createShallowSelector(useAudioSettingsStore);
export const useDisplaySettingsStoreShallow = createShallowSelector(useDisplaySettingsStore);
export const useChatsStoreShallow = createShallowSelector(useChatsStore);
export const useFilesStoreShallow = createShallowSelector(useFilesStore);
export const useTerminalStoreShallow = createShallowSelector(useTerminalStore);
export const useInternetExplorerStoreShallow = createShallowSelector(useInternetExplorerStore);
