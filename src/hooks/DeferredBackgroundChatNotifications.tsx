import { useEffect, useState, type ComponentType } from "react";
import { useChatsStoreShallow } from "@/stores/useChatsStore";

/**
 * Loads background realtime notification wiring only for authenticated users,
 * after first paint. Anonymous sessions never download the runner.
 */
export function DeferredBackgroundChatNotifications() {
  const { username, isAuthenticated } = useChatsStoreShallow((state) => ({
    username: state.username,
    isAuthenticated: state.isAuthenticated,
  }));
  const [Runner, setRunner] = useState<ComponentType | null>(null);
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
      void import("./BackgroundChatNotificationsRunner").then((module) => {
        if (!cancelled) {
          setRunner(() => module.BackgroundChatNotificationsRunner);
        }
      });
    };

    const browserWindow = window;
    if (typeof browserWindow.requestIdleCallback === "function") {
      idleId = browserWindow.requestIdleCallback(load, { timeout: 3000 });
    } else {
      timeoutId = browserWindow.setTimeout(load, 0);
    }

    return () => {
      cancelled = true;
      if (
        idleId !== undefined &&
        typeof browserWindow.cancelIdleCallback === "function"
      ) {
        browserWindow.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) {
        browserWindow.clearTimeout(timeoutId);
      }
    };
  }, [shouldLoad]);

  return shouldLoad && Runner ? <Runner /> : null;
}
