import { useLayoutEffect } from "react";
import { useAppStore } from "@/stores/useAppStore";

export function LazyLoadSignal({ instanceId }: { instanceId?: string }) {
  const markInstanceAsLoaded = useAppStore((state) => state.markInstanceAsLoaded);

  // Mark loaded as soon as the lazy boundary commits (window can be shown).
  useLayoutEffect(() => {
    if (instanceId) {
      markInstanceAsLoaded(instanceId);
    }
  }, [instanceId, markInstanceAsLoaded]);

  return null;
}
