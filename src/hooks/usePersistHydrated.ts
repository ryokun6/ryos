import { useEffect, useState } from "react";

interface PersistHydrationApi<State> {
  hasHydrated: () => boolean;
  onFinishHydration: (listener: (state: State) => void) => () => void;
}

/**
 * Reactively exposes Zustand persist hydration for async storage adapters.
 * Stores backed by IndexedDB must not seed or mutate defaults until this is
 * true, or the pre-hydration state can overwrite restored data.
 */
export function usePersistHydrated<State>(
  persist: PersistHydrationApi<State>
): boolean {
  const [hasHydrated, setHasHydrated] = useState(() => persist.hasHydrated());

  useEffect(() => {
    if (persist.hasHydrated()) {
      setHasHydrated(true);
      return;
    }
    return persist.onFinishHydration(() => setHasHydrated(true));
  }, [persist]);

  return hasHydrated;
}
