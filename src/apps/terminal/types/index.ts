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

/** File system item for terminal commands */
export interface TerminalFileItem {
  path: string;
  name: string;
  isDirectory: boolean;
  type?: string;
  status: "active" | "trashed";
  uuid?: string;
  size?: number;
  createdAt?: number;
  modifiedAt?: number;
}

export interface CommandContext {
  currentPath: string;
  files: TerminalFileItem[];
  navigateToPath: (path: string) => void;
  saveFile: (file: TerminalFileItem) => Promise<void>;
  moveToTrash: (file: TerminalFileItem) => void;
  playCommandSound: () => void;
  playErrorSound: () => void;
  playMooSound: () => void;
  launchApp: (appId: string, options?: { initialData?: unknown }) => string;
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
  mode: "normal" | "command" | "insert";
  clipboard: string;
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