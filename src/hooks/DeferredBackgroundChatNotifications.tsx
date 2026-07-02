import { useEffect, useState, type ComponentType } from "react";
import { useChatsStoreShallow } from "@/stores/useChatsStore";

/**
 * Loads background realtime notification wiring only for authenticated users,
 * as soon as authentication is restored. Anonymous sessions never download
 * the runner.
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
    void import("./BackgroundChatNotificationsRunner")
      .then((module) => {
        if (!cancelled) {
          setRunner(() => module.BackgroundChatNotificationsRunner);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error(
            "[BackgroundChatNotifications] Failed to load realtime wiring",
            error
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [shouldLoad]);

  return shouldLoad && Runner ? <Runner /> : null;
}
