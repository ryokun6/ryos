import { useEffect, useState, type ComponentType } from "react";

/**
 * Schedules dynamic import of the AirDrop listener after first paint (idle,
 * max 3s wait), so `useFileSystem` (the full finder VFS stack) and the chats /
 * files / textedit store graph it drags in are not in the App static graph.
 * AirDrop transfers arrive over a realtime channel that is only subscribed for
 * authenticated users, so a few seconds of deferral is unobservable.
 */
export function DeferredAirDropListener() {
  const [Listener, setListener] = useState<ComponentType | null>(null);

  useEffect(() => {
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
  }, []);

  if (!Listener) return null;
  return <Listener />;
}
