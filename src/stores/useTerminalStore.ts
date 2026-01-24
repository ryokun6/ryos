import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface TerminalCommand {
  command: string;
  timestamp: number;
}

interface TerminalStoreState {
  commandHistory: TerminalCommand[];
  currentPath: string;
  setCommandHistory: (history: TerminalCommand[] | ((prev: TerminalCommand[]) => TerminalCommand[])) => void;
  addCommand: (cmd: string) => void;
  setCurrentPath: (path: string) => void;
  reset: () => void;
  
  // AI mode state
  isInAiMode: boolean;
  setIsInAiMode: (isInAiMode: boolean) => void;
  initialAiPrompt?: string;
  setInitialAiPrompt: (prompt?: string) => void;
  
  // Vim mode state
  isInVimMode: boolean;
  setIsInVimMode: (isInVimMode: boolean) => void;
  vimFile: { name: string; content: string } | null;
  setVimFile: (file: { name: string; content: string } | null) => void;
  vimPosition: number;
  setVimPosition: (position: number | ((prev: number) => number)) => void;
  vimCursorLine: number;
  setVimCursorLine: (line: number | ((prev: number) => number)) => void;
  vimCursorColumn: number;
  setVimCursorColumn: (column: number | ((prev: number) => number)) => void;
  vimMode: "normal" | "command" | "insert" | "visual" | "search";
  setVimMode: (mode: "normal" | "command" | "insert" | "visual" | "search") => void;
  vimClipboard: string;
  setVimClipboard: (content: string) => void;
  // Undo/redo
  vimUndoStack: { content: string; cursorLine: number; cursorColumn: number }[];
  vimRedoStack: { content: string; cursorLine: number; cursorColumn: number }[];
  pushVimUndo: (snapshot: { content: string; cursorLine: number; cursorColumn: number }) => void;
  popVimUndo: () => { content: string; cursorLine: number; cursorColumn: number } | undefined;
  pushVimRedo: (snapshot: { content: string; cursorLine: number; cursorColumn: number }) => void;
  popVimRedo: () => { content: string; cursorLine: number; cursorColumn: number } | undefined;
  clearVimRedo: () => void;
  // Search
  vimSearchPattern: string;
  setVimSearchPattern: (pattern: string) => void;
  vimSearchForward: boolean;
  setVimSearchForward: (forward: boolean) => void;
  // Visual line mode
  vimVisualStartLine: number | null;
  setVimVisualStartLine: (line: number | null) => void;
}

const STORE_VERSION = 1;
const STORE_NAME = "ryos:terminal";

export const useTerminalStore = create<TerminalStoreState>()(
  persist(
    (set) => ({
      commandHistory: [],
      currentPath: "/", // default root
      setCommandHistory: (historyOrFn) =>
        set((state) => {
          const newHistory =
            typeof historyOrFn === "function"
              ? (historyOrFn as (prev: TerminalCommand[]) => TerminalCommand[])(
                  state.commandHistory
                )
              : historyOrFn;
          return { commandHistory: newHistory };
        }),
      addCommand: (cmd) =>
        set((state) => ({
          commandHistory: [
            ...state.commandHistory,
            { command: cmd, timestamp: Date.now() },
          ].slice(-500), // keep last 500 cmds
        })),
      setCurrentPath: (path) => set({ currentPath: path }),
      reset: () => set({ commandHistory: [], currentPath: "/" }),
      
      // AI mode state
      isInAiMode: false,
      setIsInAiMode: (isInAiMode) => set({ isInAiMode }),
      initialAiPrompt: undefined,
      setInitialAiPrompt: (prompt) => set({ initialAiPrompt: prompt }),
      
      // Vim mode state
      isInVimMode: false,
      setIsInVimMode: (isInVimMode) => set({ isInVimMode }),
      vimFile: null,
      setVimFile: (file) => set({ vimFile: file }),
      vimPosition: 0,
      setVimPosition: (position) => 
        set((state) => ({
          vimPosition: typeof position === 'function' ? position(state.vimPosition) : position
        })),
      vimCursorLine: 0,
      setVimCursorLine: (line) => 
        set((state) => ({
          vimCursorLine: typeof line === 'function' ? line(state.vimCursorLine) : line
        })),
      vimCursorColumn: 0,
      setVimCursorColumn: (column) => 
        set((state) => ({
          vimCursorColumn: typeof column === 'function' ? column(state.vimCursorColumn) : column
        })),
      vimMode: "normal",
      setVimMode: (mode) => set({ vimMode: mode }),
      vimClipboard: "",
      setVimClipboard: (content) => set({ vimClipboard: content }),
      vimUndoStack: [],
      vimRedoStack: [],
      pushVimUndo: (snapshot) =>
        set((state) => ({
          vimUndoStack: [...state.vimUndoStack, snapshot].slice(-100),
          vimRedoStack: [],
        })),
      popVimUndo: () => {
        const state = useTerminalStore.getState();
        if (state.vimUndoStack.length === 0) return undefined;
        const snapshot = state.vimUndoStack[state.vimUndoStack.length - 1];
        useTerminalStore.setState({
          vimUndoStack: state.vimUndoStack.slice(0, -1),
        });
        return snapshot;
      },
      pushVimRedo: (snapshot) =>
        set((state) => ({
          vimRedoStack: [...state.vimRedoStack, snapshot].slice(-100),
        })),
      popVimRedo: () => {
        const state = useTerminalStore.getState();
        if (state.vimRedoStack.length === 0) return undefined;
        const snapshot = state.vimRedoStack[state.vimRedoStack.length - 1];
        useTerminalStore.setState({
          vimRedoStack: state.vimRedoStack.slice(0, -1),
        });
        return snapshot;
      },
      clearVimRedo: () => set({ vimRedoStack: [] }),
      vimSearchPattern: "",
      setVimSearchPattern: (pattern) => set({ vimSearchPattern: pattern }),
      vimSearchForward: true,
      setVimSearchForward: (forward) => set({ vimSearchForward: forward }),
      vimVisualStartLine: null,
      setVimVisualStartLine: (line) => set({ vimVisualStartLine: line }),
    }),
    {
      name: STORE_NAME,
      version: STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        commandHistory: state.commandHistory,
        currentPath: state.currentPath,
      }),
      migrate: (persistedState, version) => {
        // Attempt to migrate from old localStorage keys if present
        if (!persistedState || version < STORE_VERSION) {
          try {
            const rawHistory = localStorage.getItem(
              "terminal:commandHistory" // legacy key from APP_STORAGE_KEYS.terminal.COMMAND_HISTORY
            );
            const rawCurrentPath = localStorage.getItem(
              "terminal:currentPath" // legacy key
            );
            const history: TerminalCommand[] = rawHistory
              ? JSON.parse(rawHistory)
              : [];
            const path = rawCurrentPath || "/";
            // Clean up old keys
            if (rawHistory) localStorage.removeItem("terminal:commandHistory");
            if (rawCurrentPath)
              localStorage.removeItem("terminal:currentPath");
            return {
              commandHistory: history,
              currentPath: path,
            } as Partial<TerminalStoreState>;
          } catch (e) {
            console.warn("[TerminalStore] Migration failed", e);
          }
        }
        return persistedState as Partial<TerminalStoreState>;
      },
    }
  )
); 