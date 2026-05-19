import type { AppInstance } from "@/stores/useAppStore";

/**
 * Gate mounting of heavy per-instance app trees.
 * Open, non-minimized windows stay mounted so background apps remain visible when
 * another app is launched (only truly minimized instances are unmounted for perf).
 */
export function shouldMountInstance(
  instance: AppInstance,
  _foregroundInstanceId: string | null,
  _instanceOrder: string[],
  _instances: Record<string, AppInstance>,
  exposeMode: boolean,
  _onlyFinderInstanceId: string | null,
): boolean {
  if (!instance.isOpen) return false;

  if (instance.isLoading) return true;

  // Mission Control arranges live WindowFrames; stickies are omitted upstream in expose.
  if (exposeMode && !instance.isMinimized && instance.appId !== "stickies") {
    return true;
  }

  // Minimized windows are unmounted; restoring remounts via store updates.
  if (instance.isMinimized) return false;

  return true;
}
