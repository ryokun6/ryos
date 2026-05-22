import { useStoreShallow } from "./useStoreShallow";
import { useDisplaySettingsStore } from "./useDisplaySettingsStore";

export function useDisplaySettingsStoreShallow<T>(
  selector: (state: ReturnType<typeof useDisplaySettingsStore.getState>) => T
): T {
  return useStoreShallow(useDisplaySettingsStore, selector);
}
