import type { AppId } from "@/config/appRegistry";

export interface ToolInvocationData {
  toolName: string;
  state?: "input-streaming" | "input-available" | "output-available" | "output-error";
  input?: Record<string, unknown>;
  output?: unknown;
}

export interface CommandHistory {
  command: string;
  output: string;
  path: string;
  messageId?: string;
  hasAquarium?: boolean;
  toolInvocations?: ToolInvocationData[];
  isSystemMessage?: boolean; // Gray-styled informational messages (errors, usage hints, etc.)
}

export interface CommandResult {
  output: string;
  isError: boolean;
  isSystemMessage?: boolean; // Optional: if true, output will be styled in gray (defaults to isError value)
}

export interface ParsedCommand {
  cmd: string;
  args: string[];
}

/** File system item for terminal commands - uses generic types to match useFileSystem */
export interface TerminalFileItem {
  path: string;
  name: string;
  isDirectory: boolean;
  type?: string;
  status?: "active" | "trashed";
  uuid?: string;
  size?: number;
  createdAt?: Date;
  modifiedAt?: Date;
  content?: string | Blob;
  icon?: string;
  shareId?: string;
  createdBy?: string;
}

/** Save file data structure matching useFileSystem.saveFile signature */
export interface SaveFileData {
  path: string;
  name: string;
  content: string | Blob;
  type?: string;
  icon?: string;
  shareId?: string;
  createdBy?: string;
}

export interface CommandContext {
  currentPath: string;
  files: TerminalFileItem[]; // File items from useFileSystem
  navigateToPath: (path: string) => void;
  saveFile: (file: SaveFileData) => Promise<void>;
  moveToTrash: (file: TerminalFileItem) => void;
  playCommandSound: () => void;
  playErrorSound: () => void;
  playMooSound: () => void;
  launchApp: (appId: AppId, options?: { initialData?: unknown }) => string;
  setIsAboutDialogOpen: (isOpen: boolean) => void;
  username?: string | null;
}

export interface VimState {
  file: {
    name: string;
    content: string;
  } | null;
  position: number;
  cursorLine: number;
  cursorColumn: number;
  mode: "normal" | "command" | "insert" | "visual" | "search";
  clipboard: string;
}

/** Snapshot for undo/redo */
export interface VimUndoSnapshot {
  content: string;
  cursorLine: number;
  cursorColumn: number;
}

export type CommandHandler = (
  args: string[],
  context: CommandContext
) => CommandResult | Promise<CommandResult>;

export interface Command {
  name: string;
  description: string;
  usage?: string;
  handler: CommandHandler;
}