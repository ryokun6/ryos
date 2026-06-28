interface DesktopDragDebugZoneState {
  isDesktopApp: boolean;
  debugMode: boolean;
  showResizers: boolean;
}

export function shouldShowDesktopDragDebugZone({
  isDesktopApp,
  debugMode,
  showResizers,
}: DesktopDragDebugZoneState): boolean {
  return isDesktopApp && debugMode && showResizers;
}
