import { useStoreShallow } from "./useStoreShallow";
import { useVideoStore } from "./useVideoStore";

export function useVideoStoreShallow<T>(
  selector: (state: ReturnType<typeof useVideoStore.getState>) => T
): T {
  return useStoreShallow(useVideoStore, selector);
}
