import { useScan } from "react-scan";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";

/**
 * Enables React Scan when Display settings "debug mode" is on (dev and prod).
 */
export function ReactScanDebug() {
  const debugMode = useDisplaySettingsStore((s) => s.debugMode);

  useScan({
    enabled: debugMode,
    showToolbar: debugMode,
    dangerouslyForceRunInProduction: debugMode,
  });

  return null;
}
