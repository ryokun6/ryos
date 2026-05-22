import { useStoreShallow } from "./useStoreShallow";
import { useTerminalStore } from "./useTerminalStore";

export function useTerminalStoreShallow<T>(
  selector: (state: ReturnType<typeof useTerminalStore.getState>) => T
): T {
  return useStoreShallow(useTerminalStore, selector);
}
