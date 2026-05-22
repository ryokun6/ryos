import { useStoreShallow } from "./useStoreShallow";
import { useIpodStore } from "./useIpodStore";

export function useIpodStoreShallow<T>(
  selector: (state: ReturnType<typeof useIpodStore.getState>) => T
): T {
  return useStoreShallow(useIpodStore, selector);
}
