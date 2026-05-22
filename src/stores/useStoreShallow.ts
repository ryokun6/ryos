import { useShallow } from "zustand/react/shallow";

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
