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
  vimFilePath: string | null;
  setVimFilePath: (path: string | null) => void;
  vimPosition: number;
  setVimPosition: (position: number | ((prev: number) => number)) => void;
  vimCursorLine: number;
  setVimCursorLine: (line: number | ((prev: number) => number)) => void;
  vimCursorColumn: number;
  setVimCursorColumn: (column: number | ((prev: number) => number)) => void;
  vimMode: "normal" | "command" | "insert";
  setVimMode: (mode: "normal" | "command" | "insert") => void;
  vimClipboard: string;
  setVimClipboard: (content: string) => void;
  vimOriginalContent: string;
  setVimOriginalContent: (content: string) => void;
  vimIsDirty: boolean;
  setVimIsDirty: (dirty: boolean) => void;
  vimIsNewFile: boolean;
  setVimIsNewFile: (isNew: boolean) => void;
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
      vimFilePath: null,
      setVimFilePath: (path) => set({ vimFilePath: path }),
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
      vimOriginalContent: "",
      setVimOriginalContent: (content) => set({ vimOriginalContent: content }),
      vimIsDirty: false,
      setVimIsDirty: (dirty) => set({ vimIsDirty: dirty }),
      vimIsNewFile: false,
      setVimIsNewFile: (isNew) => set({ vimIsNewFile: isNew }),
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