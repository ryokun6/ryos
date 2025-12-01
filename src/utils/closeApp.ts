/**
 * Utility function to request closing an app instance with animation and sound.
 * This dispatches an event that WindowFrame listens to, ensuring consistent
 * close behavior (animation + sound) across all close methods.
 * 
 * @param instanceId - The instance ID to close (required for instance-based apps)
 * @param appId - The app ID (fallback for non-instance apps)
 */
export function requestCloseApp(instanceId?: string, appId?: string): void {
  if (instanceId) {
    const event = new CustomEvent(`requestCloseInstance-${instanceId}`, {
      detail: { instanceId }
    });
    window.dispatchEvent(event);
  } else if (appId) {
    const event = new CustomEvent(`requestCloseApp-${appId}`, {
      detail: { appId }
    });
    window.dispatchEvent(event);
  } else {
    console.warn('[requestCloseApp] No instanceId or appId provided');
  }
}
