import { useStoreShallow } from "./useStoreShallow";
import { useChatsStore } from "./useChatsStore";

export function useChatsStoreShallow<T>(
  selector: (state: ReturnType<typeof useChatsStore.getState>) => T
): T {
  return useStoreShallow(useChatsStore, selector);
}
