import { create } from "zustand";

export interface UndoRedoHandlers {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

interface UndoRedoStoreState {
  handlers: Record<string, UndoRedoHandlers>;
  register: (instanceId: string, handlers: UndoRedoHandlers) => void;
  unregister: (instanceId: string) => void;
  updateState: (
    instanceId: string,
    state: { canUndo: boolean; canRedo: boolean }
  ) => void;
  getHandlers: (instanceId: string) => UndoRedoHandlers | null;
}

export const useUndoRedoStore = create<UndoRedoStoreState>()((set, get) => ({
  handlers: {},

  register: (instanceId, handlers) =>
    set((state) => ({
      handlers: { ...state.handlers, [instanceId]: handlers },
    })),

  unregister: (instanceId) =>
    set((state) => {
      const { [instanceId]: _, ...rest } = state.handlers;
      return { handlers: rest };
    }),

  updateState: (instanceId, { canUndo, canRedo }) =>
    set((state) => {
      const existing = state.handlers[instanceId];
      if (!existing) return state;
      if (existing.canUndo === canUndo && existing.canRedo === canRedo)
        return state;
      return {
        handlers: {
          ...state.handlers,
          [instanceId]: { ...existing, canUndo, canRedo },
        },
      };
    }),

  getHandlers: (instanceId) => get().handlers[instanceId] ?? null,
}));
