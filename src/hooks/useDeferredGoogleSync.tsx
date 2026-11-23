import { useEffect, useState, type ComponentType } from "react";
import { useGoogleSyncStore } from "@/stores/useGoogleSyncStore";

/**
 * Schedules dynamic import of Google background sync + prompt host after first paint
 * (or immediately when a sync prompt is requested), keeping Google sync orchestration
 * out of the critical initial bundle.
 */
export function DeferredGoogleSync() {
  const [Runner, setRunner] = useState<ComponentType | null>(null);
  const hasPendingPrompt = useGoogleSyncStore(
    (s) => s.pendingInitialSyncPrompt !== null
  );

  useEffect(() => {
    if (Runner) return;
    let cancelled = false;
    let idleId: number | undefined;
    let timeoutId: number | undefined;

    const load = () => {
      if (cancelled) return;
      void import("./GoogleSyncRunner").then((mod) => {
        if (!cancelled) setRunner(() => mod.GoogleSyncRunner);
      });
    };

    if (hasPendingPrompt) {
      load();
      return () => {
        cancelled = true;
      };
    }

    const w = window;
    if (typeof w.requestIdleCallback === "function") {
      idleId = w.requestIdleCallback(load, { timeout: 3000 });
    } else {
      timeoutId = w.setTimeout(load, 0);
    }

    return () => {
      cancelled = true;
      if (idleId !== undefined && typeof w.cancelIdleCallback === "function") {
        w.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) {
        w.clearTimeout(timeoutId);
      }
    };
  }, [Runner, hasPendingPrompt]);

  if (!Runner) return null;
  return <Runner />;
}
