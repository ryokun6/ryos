import { useShallow } from "zustand/react/shallow";

type BoundStoreHook<TState> = {
  <TSelected>(selector: (state: TState) => TSelected): TSelected;
  getState: () => TState;
};

/**
 * Generic shallow-compare selector hook for any zustand store.
 *
 * Per-store convenience wrappers (e.g. `useIpodStoreShallow`) live in their
 * respective store files so that importing one does not drag every other
 * store into the importing chunk. Keep this file free of store imports.
 */
export function useStoreShallow<TState, TSelected>(
  store: BoundStoreHook<TState>,
  selector: (state: TState) => TSelected
): TSelected {
  return store(useShallow(selector));
}
