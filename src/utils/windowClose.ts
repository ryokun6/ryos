/**
 * Utility function to trigger window close animation and sound.
 * This ensures all close actions (menu bars, right-click menus, tool calls)
 * go through the same animation and sound as the close button.
 * 
 * @param instanceId - The instance ID of the window to close (preferred)
 * @param appId - The app ID as fallback if instanceId is not available
 */
export function triggerWindowClose(instanceId?: string, appId?: string): void {
  if (!instanceId && !appId) {
    console.warn("[triggerWindowClose] No instanceId or appId provided");
    return;
  }
  
  const eventName = `triggerClose-${instanceId || appId}`;
  window.dispatchEvent(new CustomEvent(eventName));
}
