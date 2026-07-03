export interface DesktopUpdateResult {
  type: "first-time" | "update" | "none";
  version: string | null;
}

let desktopUpdateCallback:
  | ((result: DesktopUpdateResult) => void)
  | null = null;

export function onDesktopUpdate(
  callback: (result: DesktopUpdateResult) => void
): void {
  desktopUpdateCallback = callback;
}

export function notifyDesktopUpdate(result: DesktopUpdateResult): void {
  desktopUpdateCallback?.(result);
}
