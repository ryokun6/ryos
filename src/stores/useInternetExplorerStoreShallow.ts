import { useStoreShallow } from "./useStoreShallow";
import { useInternetExplorerStore } from "./useInternetExplorerStore";

export function useInternetExplorerStoreShallow<T>(
  selector: (state: ReturnType<typeof useInternetExplorerStore.getState>) => T
): T {
  return useStoreShallow(useInternetExplorerStore, selector);
}
