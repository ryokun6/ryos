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

export function useAppStoreShallow<T>(
  selector: (state: ReturnType<typeof useAppStore.getState>) => T
): T {
  return useStoreShallow(useAppStore, selector);
}

export function useIpodStoreShallow<T>(
  selector: (state: ReturnType<typeof useIpodStore.getState>) => T
): T {
  return useStoreShallow(useIpodStore, selector);
}

export function useVideoStoreShallow<T>(
  selector: (state: ReturnType<typeof useVideoStore.getState>) => T
): T {
  return useStoreShallow(useVideoStore, selector);
}

export function useAudioSettingsStoreShallow<T>(
  selector: (state: ReturnType<typeof useAudioSettingsStore.getState>) => T
): T {
  return useStoreShallow(useAudioSettingsStore, selector);
}

export function useDisplaySettingsStoreShallow<T>(
  selector: (state: ReturnType<typeof useDisplaySettingsStore.getState>) => T
): T {
  return useStoreShallow(useDisplaySettingsStore, selector);
}

export function useChatsStoreShallow<T>(
  selector: (state: ReturnType<typeof useChatsStore.getState>) => T
): T {
  return useStoreShallow(useChatsStore, selector);
}

export function useFilesStoreShallow<T>(
  selector: (state: ReturnType<typeof useFilesStore.getState>) => T
): T {
  return useStoreShallow(useFilesStore, selector);
}

export function useTerminalStoreShallow<T>(
  selector: (state: ReturnType<typeof useTerminalStore.getState>) => T
): T {
  return useStoreShallow(useTerminalStore, selector);
}

export function useInternetExplorerStoreShallow<T>(
  selector: (state: ReturnType<typeof useInternetExplorerStore.getState>) => T
): T {
  return useStoreShallow(useInternetExplorerStore, selector);
}