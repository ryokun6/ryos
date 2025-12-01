/**
 * Window utilities for managing window close with animations and sounds.
 *
 * This module provides a centralized way to request window close operations
 * that properly trigger the WindowFrame's close animation and sound effects.
 */

/**
 * Request a window to close with its standard animation and sound.
 * This dispatches an event that WindowFrame listens for, allowing it to
 * trigger the proper close animation before actually removing the window.
 *
 * @param instanceId - The instance ID of the window to close
 */
export function requestCloseWindow(instanceId: string): void {
  window.dispatchEvent(
    new CustomEvent(`requestCloseWindow-${instanceId}`)
  );
}
