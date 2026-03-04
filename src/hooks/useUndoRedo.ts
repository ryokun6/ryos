import { useEffect, useCallback, useRef } from "react";
import {
  useUndoRedoStore,
  type UndoRedoHandlers,
} from "@/stores/useUndoRedoStore";

/**
 * Register undo/redo handlers for an app instance.
 *
 * Call this inside each app component that supports undo/redo.
 * The handlers are automatically cleaned up when the component unmounts.
 */
export function useRegisterUndoRedo(
  instanceId: string,
  handlers: UndoRedoHandlers
) {
  const register = useUndoRedoStore((s) => s.register);
  const unregister = useUndoRedoStore((s) => s.unregister);

  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    register(instanceId, {
      undo: () => handlersRef.current.undo(),
      redo: () => handlersRef.current.redo(),
      canUndo: handlersRef.current.canUndo,
      canRedo: handlersRef.current.canRedo,
    });
    return () => unregister(instanceId);
  }, [instanceId, register, unregister]);

  const updateState = useUndoRedoStore((s) => s.updateState);

  useEffect(() => {
    updateState(instanceId, {
      canUndo: handlers.canUndo,
      canRedo: handlers.canRedo,
    });
  }, [instanceId, handlers.canUndo, handlers.canRedo, updateState]);
}

/**
 * Returns undo/redo state and actions for the given instance.
 * Used by menu bars to wire up Edit > Undo / Redo items.
 */
export function useInstanceUndoRedo(instanceId: string) {
  const entry = useUndoRedoStore((s) => s.handlers[instanceId]);

  const undo = useCallback(() => entry?.undo(), [entry]);
  const redo = useCallback(() => entry?.redo(), [entry]);

  return {
    canUndo: entry?.canUndo ?? false,
    canRedo: entry?.canRedo ?? false,
    undo,
    redo,
  };
}
