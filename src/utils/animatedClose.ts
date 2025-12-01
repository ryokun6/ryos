/**
 * Creates a handler that triggers animated close (with sound and animation)
 * by dispatching a custom event that WindowFrame listens to.
 * 
 * @param instanceId - The instance ID of the window to close
 * @param onClose - The actual close function to call after animation completes
 * @returns A function that dispatches the animated close event
 */
export function createAnimatedCloseHandler(
  instanceId: string | undefined,
  appId: string,
  onClose: () => void
): () => void {
  return () => {
    if (instanceId) {
      // Dispatch event to trigger animated close in WindowFrame
      const event = new CustomEvent(`triggerAnimatedClose-${instanceId}`);
      window.dispatchEvent(event);
      // Note: onClose will be called by WindowFrame after animation completes
    } else {
      // Fallback: if no instanceId, just call onClose directly
      onClose();
    }
  };
}
