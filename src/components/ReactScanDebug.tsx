import { useEffect } from "react";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";

/**
 * Enables React Scan when Display settings "debug mode" is on (dev and prod).
 * Uses a dynamic import so react-scan is excluded from the main bundle and
 * only loaded on demand when debug mode is first enabled.
 */
export function ReactScanDebug() {
  const debugMode = useDisplaySettingsStore((s) => s.debugMode);

  useEffect(() => {
    // Only download the react-scan chunk when debug mode is actually on —
    // an unconditional import() fetched it on every session even though
    // scanning was disabled.
    if (!debugMode) return;
    import("react-scan").then(({ scan }) => {
      scan({
        enabled: true,
        showToolbar: true,
        dangerouslyForceRunInProduction: true,
      });
    });
    return () => {
      // Turn scanning off if debug mode is disabled after the module loaded.
      import("react-scan").then(({ scan }) => {
        scan({ enabled: false, showToolbar: false });
      });
    };
  }, [debugMode]);

  return null;
}
