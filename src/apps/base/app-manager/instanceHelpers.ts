import type { AppId } from "@/config/appRegistry";
import { BASE_Z_INDEX } from "./constants";

export function getZIndexForInstance(
  instanceId: string,
  instanceOrder: string[]
): number {
  const index = instanceOrder.indexOf(instanceId);
  if (index === -1) return BASE_Z_INDEX;
  return BASE_Z_INDEX + index + 1;
}

/**
 * Zustand selector that returns a scalar z-index for one instance.
 * Prefer this over selecting `instanceOrder` (array identity) so windows
 * whose stack position is unchanged skip the ManagedAppInstance commit.
 */
export function selectZIndexForInstance(
  state: { instanceOrder: string[] },
  instanceId: string
): number {
  return getZIndexForInstance(instanceId, state.instanceOrder);
}

/** Count of open, non-minimized windows — used by Exposé layout. */
export function selectOpenInstanceCount(state: {
  instances: Record<string, { isOpen?: boolean; isMinimized?: boolean }>;
}): number {
  let count = 0;
  for (const inst of Object.values(state.instances)) {
    if (inst.isOpen && !inst.isMinimized) count += 1;
  }
  return count;
}

export function supportsMultiWindowApp(appId: AppId): boolean {
  return (
    appId === "textedit" ||
    appId === "finder" ||
    appId === "preview" ||
    appId === "applet-viewer"
  );
}
