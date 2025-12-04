import { useState, useCallback, useMemo } from "react";
import { useAppletActions, type Applet } from "../utils/appletActions";
import { getApiUrl } from "@/utils/platform";

export function useAppletUpdates() {
  const [applets, setApplets] = useState<Applet[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const actions = useAppletActions();

  const fetchApplets = useCallback(async (): Promise<Applet[]> => {
    // Check if offline
    if (typeof navigator !== "undefined" && "onLine" in navigator && !navigator.onLine) {
      setIsLoading(false);
      return [];
    }
    setIsLoading(true);
    try {
      const response = await fetch(getApiUrl("/api/share-applet?list=true"));
      if (response.ok) {
        const data = await response.json();
        // Sort by createdAt descending (latest first)
        const sortedApplets = (data.applets || []).sort((a: Applet, b: Applet) => {
          return (b.createdAt || 0) - (a.createdAt || 0);
        });
        setApplets(sortedApplets);
        return sortedApplets;
      }
      return [];
    } catch (error) {
      console.error("Error fetching applets:", error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check for updates
  const checkForUpdates = useCallback(async () => {
    const fetchedApplets = await fetchApplets();
    // Calculate updates from freshly fetched applets
    const updates = fetchedApplets.filter(
      (applet) =>
        actions.isAppletInstalled(applet.id) && actions.needsUpdate(applet)
    );
    return {
      count: updates.length,
      updates: updates,
    };
  }, [fetchApplets, actions]);

  // Get updates available - memoized to avoid recalculation on every render
  const updatesAvailable = useMemo(() => {
    return applets.filter(
      (applet) =>
        actions.isAppletInstalled(applet.id) && actions.needsUpdate(applet)
    );
  }, [applets, actions]);

  const updateCount = updatesAvailable.length;

  // Don't fetch on mount - only fetch when explicitly requested via checkForUpdates
  // This avoids duplicate fetches since AppStore component also fetches independently

  return {
    updateCount,
    updatesAvailable,
    isLoading,
    checkForUpdates,
    fetchApplets,
  };
}
