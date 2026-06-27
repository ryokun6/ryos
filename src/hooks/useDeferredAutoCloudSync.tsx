import { useEffect, useState, type ComponentType } from "react";

/**
 * Schedules dynamic import of cloud sync after first paint (idle, max 3s wait),
 * so `useAutoCloudSync` and its heavy dependency graph are not in the App static graph.
 */
export function DeferredAutoCloudSync() {
  const [Runner, setRunner] = useState<ComponentType | null>(null);

  useEffect(() => {
    let cancelled = false;
    let idleId: number | undefined;
    let timeoutId: number | undefined;

    const load = () => {
      if (cancelled) return;
      void import("./AutoCloudSyncRunner").then((mod) => {
        if (!cancelled) {
          setRunner(() => mod.AutoCloudSyncRunner);
        }
      });
    };

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
  }, []);

  if (!Runner) return null;
  return <Runner />;
}
