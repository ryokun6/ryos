/**
 * Tracks which window instance currently has a macOS sheet dialog open.
 * No-titlebar windows subscribe so they can keep the titlebar visible for
 * the duration of the sheet, regardless of auto-hide.
 */

const pinnedInstanceIds = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function pinSheetWindow(instanceId: string): void {
  if (pinnedInstanceIds.has(instanceId)) return;
  pinnedInstanceIds.add(instanceId);
  emit();
}

export function unpinSheetWindow(instanceId: string): void {
  if (!pinnedInstanceIds.delete(instanceId)) return;
  emit();
}

export function isSheetWindowPinned(instanceId: string | null | undefined): boolean {
  return Boolean(instanceId && pinnedInstanceIds.has(instanceId));
}

export function subscribeSheetWindowPins(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}
