import type { ToolContext, ToolResultPayload } from "../tools/types";

type TranslateFn = (key: string, params?: Record<string, unknown>) => string;
type AddToolResult = (result: ToolResultPayload) => void;

type ExecuteToolHandlerFn = (
  toolName: string,
  input: unknown,
  toolCallId: string,
  context: ToolContext,
) => Promise<boolean>;

export const executeChatToolCall = async ({
  toolCall,
  toolContext,
  addToolResult,
  t,
  executeTool,
}: {
  toolCall: { toolName: string; toolCallId: string; input: unknown };
  toolContext: ToolContext;
  addToolResult: AddToolResult;
  t: TranslateFn;
  executeTool: ExecuteToolHandlerFn;
}): Promise<void> => {
  try {
    const wasExecuted = await executeTool(
      toolCall.toolName,
      toolCall.input,
      toolCall.toolCallId,
      toolContext,
    );

    if (!wasExecuted) {
      console.warn("Unhandled tool call:", toolCall.toolName);
      addToolResult({
        tool: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        state: "output-error",
        errorText: t("apps.chats.toolCalls.unknownError"),
      });
    }
  } catch (error) {
    console.error("Error executing tool call:", error);
    addToolResult({
      tool: toolCall.toolName,
      toolCallId: toolCall.toolCallId,
      state: "output-error",
      errorText:
        error instanceof Error
          ? error.message
          : t("apps.chats.toolCalls.unknownError"),
    });
  }
};
