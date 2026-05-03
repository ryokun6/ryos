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
    import("react-scan").then(({ scan }) => {
      scan({
        enabled: debugMode,
        showToolbar: debugMode,
        dangerouslyForceRunInProduction: debugMode,
      });
    });
  }, [debugMode]);

  return null;
}
