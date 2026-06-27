import { useEffect, useState, type ComponentType } from "react";
import { writeAgentDebugLog } from "@/utils/agentDebugLog";

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
      const startedAt = performance.now();
      // #region agent log
      writeAgentDebugLog({
        hypothesisId: "H1,H2",
        location: "src/hooks/useDeferredAutoCloudSync.tsx:19",
        message: "deferred cloud sync import started",
        data: {
          idleDelayMs: Math.round(startedAt),
          visibilityState: document.visibilityState,
        },
      });
      // #endregion
      void import("./AutoCloudSyncRunner").then((mod) => {
        if (!cancelled) {
          // #region agent log
          writeAgentDebugLog({
            hypothesisId: "H1,H2",
            location: "src/hooks/useDeferredAutoCloudSync.tsx:30",
            message: "deferred cloud sync import resolved",
            data: {
              importMs: Math.round(performance.now() - startedAt),
            },
          });
          // #endregion
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
