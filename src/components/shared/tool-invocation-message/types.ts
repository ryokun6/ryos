// AI SDK v5 tool invocation structure
export interface ToolInvocationPart {
  type: string; // e.g., "tool-launchApp", "tool-switchTheme", etc.
  toolCallId: string;
  state:
    | "input-streaming"
    | "input-available"
    | "output-available"
    | "output-error"
    // Tool-approval flow (needsApproval tools, e.g. getLocation)
    | "approval-requested"
    | "approval-responded"
    | "output-denied";
  input?: {
    id?: string;
    url?: string;
    year?: string;
    html?: string;
    path?: string;
    [key: string]: unknown;
  };
  output?: unknown;
  errorText?: string;
  /** Present on approval-gated tool parts (AI SDK tool-approval flow). */
  approval?: {
    id: string;
    approved?: boolean;
    reason?: string;
  };
}

export interface ToolInvocationMessageProps {
  part: ToolInvocationPart;
  partKey: string;
  isLoading: boolean;
  getAppName: (id?: string) => string;
  formatToolName: (name: string) => string;
  setIsInteractingWithPreview: (val: boolean) => void;
  playElevatorMusic: () => void;
  stopElevatorMusic: () => void;
  playDingSound: () => void;
}

/** Extract tool name from type (e.g., "tool-launchApp" -> "launchApp") */
export function getToolName(part: ToolInvocationPart): string {
  if (part.type.startsWith("tool-")) {
    return part.type.slice(5);
  }
  return part.type;
}

export type ToolInvocationDisplayHelpers = {
  getAppName: (id?: string) => string;
  formatToolName: (name: string) => string;
};
