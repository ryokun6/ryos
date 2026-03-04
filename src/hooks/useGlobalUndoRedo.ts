import { useEffect } from "react";
import { useUndoRedoStore } from "@/stores/useUndoRedoStore";
import { useAppStore } from "@/stores/useAppStore";

/**
 * Global keyboard listener that dispatches Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z
 * to the undo/redo handlers registered by the foreground app instance.
 *
 * Mount this once at the top level (e.g. in AppManager).
 */
export function useGlobalUndoRedo() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const cmdKey = isMac ? e.metaKey : e.ctrlKey;

      if (!cmdKey || e.altKey) return;
      if (e.key.toLowerCase() !== "z" && e.key.toLowerCase() !== "y") return;

      const foregroundId = useAppStore.getState().foregroundInstanceId;
      if (!foregroundId) return;

      const handlers = useUndoRedoStore.getState().getHandlers(foregroundId);
      if (!handlers) return;

      if (e.key.toLowerCase() === "z") {
        if (e.shiftKey) {
          if (handlers.canRedo) {
            e.preventDefault();
            handlers.redo();
          }
        } else {
          if (handlers.canUndo) {
            e.preventDefault();
            handlers.undo();
          }
        }
      } else if (e.key.toLowerCase() === "y" && !e.shiftKey) {
        if (handlers.canRedo) {
          e.preventDefault();
          handlers.redo();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
