import { useStoreShallow } from "./useStoreShallow";
import { useAudioSettingsStore } from "./useAudioSettingsStore";

export function useAudioSettingsStoreShallow<T>(
  selector: (state: ReturnType<typeof useAudioSettingsStore.getState>) => T
): T {
  return useStoreShallow(useAudioSettingsStore, selector);
}
