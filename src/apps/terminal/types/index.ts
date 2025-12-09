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

export interface CommandContext {
  currentPath: string;
  files: any[]; // TODO: Add proper file type
  navigateToPath: (path: string) => void;
  saveFile: (file: any) => Promise<void>;
  moveToTrash: (file: any) => void;
  playCommandSound: () => void;
  playErrorSound: () => void;
  playMooSound: () => void;
  launchApp: (appId: any, options?: any) => string; // Use any for AppId to avoid import issues
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