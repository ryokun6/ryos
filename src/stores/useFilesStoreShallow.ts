import { useStoreShallow } from "./useStoreShallow";
import { useFilesStore } from "./useFilesStore";

export function useFilesStoreShallow<T>(
  selector: (state: ReturnType<typeof useFilesStore.getState>) => T
): T {
  return useStoreShallow(useFilesStore, selector);
}
