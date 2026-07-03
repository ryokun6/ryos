import { useEffect, useState, type ComponentType } from "react";
import { useChatsStoreShallow } from "@/stores/useChatsStore";

/**
 * Loads the AirDrop listener as soon as authentication is restored. Anonymous
 * sessions never download `useFileSystem` and the full Finder VFS dependency
 * graph.
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
    void import("./AirDropListener")
      .then((module) => {
        if (!cancelled) setListener(() => module.AirDropListener);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error("[AirDrop] Failed to load listener", error);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [shouldLoad]);

  if (!shouldLoad || !Listener) return null;
  return <Listener />;
}
