import { useShallow } from "zustand/react/shallow";

/**
 * Generic shallow-equality store subscription helper.
 *
 * IMPORTANT: this module must stay free of store imports. It used to be a
 * barrel that imported every major Zustand store, which dragged all of them
 * (and their transitive dependencies) into the entry chunk for any shell
 * component that needed a single helper. The per-store wrappers
 * (`useAppStoreShallow`, `useIpodStoreShallow`, …) are co-located with their
 * stores instead — import them from the store module, e.g.
 * `import { useAppStoreShallow } from "@/stores/useAppStore"`.
 */
type BoundStoreHook<TState> = {
  <TSelected>(selector: (state: TState) => TSelected): TSelected;
  getState: () => TState;
};

export function useStoreShallow<TState, TSelected>(
  store: BoundStoreHook<TState>,
  selector: (state: TState) => TSelected
): TSelected {
  return store(useShallow(selector));
}
