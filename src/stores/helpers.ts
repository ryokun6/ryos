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

type BoundStoreHook<TState> = {
  <TSelected>(selector: (state: TState) => TSelected): TSelected;
  getState: () => TState;
};

export function useStoreShallow<TState, TSelected>(
  store: BoundStoreHook<TState>,
  selector: (state: TState) => TSelected
): TSelected {
  return store(useShallow(selector));
}

const createShallowHook = <TState>(store: BoundStoreHook<TState>) =>
  <TSelected>(selector: (state: TState) => TSelected): TSelected =>
    useStoreShallow(store, selector);

export const useAppStoreShallow = createShallowHook(useAppStore);
export const useIpodStoreShallow = createShallowHook(useIpodStore);
export const useVideoStoreShallow = createShallowHook(useVideoStore);
export const useAudioSettingsStoreShallow = createShallowHook(
  useAudioSettingsStore
);
export const useDisplaySettingsStoreShallow = createShallowHook(
  useDisplaySettingsStore
);
export const useChatsStoreShallow = createShallowHook(useChatsStore);
export const useFilesStoreShallow = createShallowHook(useFilesStore);
export const useTerminalStoreShallow = createShallowHook(useTerminalStore);
export const useInternetExplorerStoreShallow = createShallowHook(
  useInternetExplorerStore
);