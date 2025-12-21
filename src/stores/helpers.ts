import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "./useAppStore";
import { useIpodStore } from "./useIpodStore";
import { useAudioSettingsStore } from "./useAudioSettingsStore";
import { useDisplaySettingsStore } from "./useDisplaySettingsStore";

// Generic helper to wrap a selector with Zustand's shallow comparator for AppStore
export function useAppStoreShallow<T>(
  selector: (state: ReturnType<typeof useAppStore.getState>) => T
): T {
  return useAppStore(useShallow(selector));
}

// Generic helper to wrap a selector with Zustand's shallow comparator for IpodStore
export function useIpodStoreShallow<T>(
  selector: (state: ReturnType<typeof useIpodStore.getState>) => T
): T {
  return useIpodStore(useShallow(selector));
}

// Generic helper to wrap a selector with Zustand's shallow comparator for AudioSettingsStore
export function useAudioSettingsStoreShallow<T>(
  selector: (state: ReturnType<typeof useAudioSettingsStore.getState>) => T
): T {
  return useAudioSettingsStore(useShallow(selector));
}

// Generic helper to wrap a selector with Zustand's shallow comparator for DisplaySettingsStore
export function useDisplaySettingsStoreShallow<T>(
  selector: (state: ReturnType<typeof useDisplaySettingsStore.getState>) => T
): T {
  return useDisplaySettingsStore(useShallow(selector));
}