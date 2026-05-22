import { useStoreShallow } from "./useStoreShallow";
import { useAppStore } from "./useAppStore";

export function useAppStoreShallow<T>(
  selector: (state: ReturnType<typeof useAppStore.getState>) => T
): T {
  return useStoreShallow(useAppStore, selector);
}
