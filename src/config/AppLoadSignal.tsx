import { useEffect } from "react";
import { useAppStore } from "@/stores/useAppStore";

export function AppLoadSignal({ instanceId }: { instanceId?: string }) {
  const markInstanceAsLoaded = useAppStore((state) => state.markInstanceAsLoaded);

  useEffect(() => {
    if (!instanceId) {
      return;
    }

    // Use requestIdleCallback for non-urgent loading signal, falling back to setTimeout
    // This ensures we don't block the main thread during heavy app initialization
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const handle = window.requestIdleCallback(
        () => {
          markInstanceAsLoaded(instanceId);
        },
        { timeout: 1000 }
      );
      return () => window.cancelIdleCallback(handle);
    }

    const timer = setTimeout(() => {
      markInstanceAsLoaded(instanceId);
    }, 50);

    return () => clearTimeout(timer);
  }, [instanceId, markInstanceAsLoaded]);

  return null;
}
