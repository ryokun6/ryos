import type { AppInstance } from "@/stores/useAppStore";

/**
 * Whether to mount the heavy per-instance app tree.
 *
 * All open instances stay mounted (including minimized) so `WindowFrame` can run
 * minimize exit and dock-restore animations. Callers already skip closed instances.
 */
export function shouldMountInstance(
  instance: AppInstance,
  _exposeMode: boolean,
): boolean {
  return instance.isOpen;
}
