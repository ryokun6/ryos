import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "./useAppStore";
import { useIpodStore } from "./useIpodStore";
import { useAudioSettingsStore } from "./useAudioSettingsStore";
import { useDisplaySettingsStore } from "./useDisplaySettingsStore";
import { useChatsStore } from "./useChatsStore";
import { useFilesStore } from "./useFilesStore";
import { useTerminalStore } from "./useTerminalStore";

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

// Generic helper to wrap a selector with Zustand's shallow comparator for ChatsStore
export function useChatsStoreShallow<T>(
  selector: (state: ReturnType<typeof useChatsStore.getState>) => T
): T {
  return useChatsStore(useShallow(selector));
}

// Generic helper to wrap a selector with Zustand's shallow comparator for FilesStore
export function useFilesStoreShallow<T>(
  selector: (state: ReturnType<typeof useFilesStore.getState>) => T
): T {
  return useFilesStore(useShallow(selector));
}

// Generic helper to wrap a selector with Zustand's shallow comparator for TerminalStore
export function useTerminalStoreShallow<T>(
  selector: (state: ReturnType<typeof useTerminalStore.getState>) => T
): T {
  return useTerminalStore(useShallow(selector));
}