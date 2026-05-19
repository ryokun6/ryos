import type { AppInstance } from "@/stores/useAppStore";

/**
 * Gate mounting of heavy per-instance app trees.
 * Open, non-minimized windows stay mounted so background apps remain visible when
 * another app is launched (only minimized instances are unmounted for perf).
 */
export function shouldMountInstance(
  instance: AppInstance,
  exposeMode: boolean,
): boolean {
  if (!instance.isOpen) return false;
  if (instance.isLoading) return true;

  if (exposeMode && !instance.isMinimized && instance.appId !== "stickies") {
    return true;
  }

  return !instance.isMinimized;
}
