export interface ToolContext {
  launchApp: (appId: string, options?: { initialData?: unknown; multiWindow?: boolean }) => string;
  addToolOutput: (result: ToolOutputPayload) => void;
}

export type ToolOutputPayload =
  | {
      state?: "output-available";
      tool: string;
      toolCallId: string;
      output: unknown;
      errorText?: undefined;
    }
  | {
      state: "output-error";
      tool: string;
      toolCallId: string;
      output?: undefined;
      errorText: string;
    };

export type ToolHandler<T = unknown> = (
  input: T,
  toolCallId: string,
  context: ToolContext
) => Promise<void> | void;
