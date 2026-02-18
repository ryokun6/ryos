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

type StoreHook<TState> = {
  <T>(selector: (state: TState) => T): T;
  getState: () => TState;
};

function createShallowSelector<TState>(store: StoreHook<TState>) {
  return <T>(selector: (state: TState) => T): T => store(useShallow(selector));
}

export const useAppStoreShallow = createShallowSelector(useAppStore);
export const useIpodStoreShallow = createShallowSelector(useIpodStore);
export const useVideoStoreShallow = createShallowSelector(useVideoStore);
export const useAudioSettingsStoreShallow =
  createShallowSelector(useAudioSettingsStore);
export const useDisplaySettingsStoreShallow =
  createShallowSelector(useDisplaySettingsStore);
export const useChatsStoreShallow = createShallowSelector(useChatsStore);
export const useFilesStoreShallow = createShallowSelector(useFilesStore);
export const useTerminalStoreShallow = createShallowSelector(useTerminalStore);
export const useInternetExplorerStoreShallow = createShallowSelector(
  useInternetExplorerStore
);