import { useEffect, useState, type ComponentType } from "react";
import { useChatsStoreShallow } from "@/stores/useChatsStore";

/**
 * Schedules dynamic import of the AirDrop listener for authenticated users
 * after first paint (idle, max 3s wait), so anonymous sessions never download
 * `useFileSystem` and the full Finder VFS dependency graph.
 */
export function DeferredAirDropListener() {
  const { username, isAuthenticated } = useChatsStoreShallow((state) => ({
    username: state.username,
    isAuthenticated: state.isAuthenticated,
  }));
  const [Listener, setListener] = useState<ComponentType | null>(null);
  const shouldLoad = Boolean(username && isAuthenticated);

  useEffect(() => {
    if (!shouldLoad) {
      return;
    }

    let cancelled = false;
    let idleId: number | undefined;
    let timeoutId: number | undefined;

    const load = () => {
      if (cancelled) return;
      void import("./AirDropListener").then((mod) => {
        if (!cancelled) setListener(() => mod.AirDropListener);
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
  }, [shouldLoad]);

  if (!shouldLoad || !Listener) return null;
  return <Listener />;
}
