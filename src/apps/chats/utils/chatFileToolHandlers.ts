import type { ToolResultPayload } from "../tools/types";
import { executeChatFileEditOperation } from "./chatFileEditOperation";
import { executeChatFileWriteOperation } from "./chatFileWriteOperation";
import { resolveToolErrorText, validateFileEditInput } from "./chatFileToolValidation";

type TranslateFn = (key: string, params?: Record<string, unknown>) => string;
type AddToolResult = (result: ToolResultPayload) => void;

type ExecuteWriteOperationFn = typeof executeChatFileWriteOperation;
type ExecuteEditOperationFn = typeof executeChatFileEditOperation;
type SyncTextEditFn = (options: {
  path: string;
  content: string;
  fileName?: string;
  launchIfMissing: boolean;
  bringToForeground: boolean;
  includeFilePathOnUpdate: boolean;
}) => void;

type BaseToolCallContext = {
  toolName: string;
  toolCallId: string;
  addToolResult: AddToolResult;
  t: TranslateFn;
};

const publishToolError = ({
  toolName,
  toolCallId,
  addToolResult,
  errorText,
}: {
  toolName: string;
  toolCallId: string;
  addToolResult: AddToolResult;
  errorText: string;
}): void => {
  addToolResult({
    tool: toolName,
    toolCallId,
    state: "output-error",
    errorText,
  });
};

export const handleChatWriteToolCall = async ({
  path,
  content,
  mode,
  toolName,
  toolCallId,
  addToolResult,
  t,
  executeWriteOperation = executeChatFileWriteOperation,
  syncTextEdit,
}: BaseToolCallContext & {
  path: string;
  content: string;
  mode?: "overwrite" | "append" | "prepend";
  executeWriteOperation?: ExecuteWriteOperationFn;
  syncTextEdit: SyncTextEditFn;
}): Promise<void> => {
  console.log("[ToolCall] write:", { path, mode, contentLength: content?.length });

  try {
    const writeResult = await executeWriteOperation({
      path,
      content,
      mode,
    });

    if (!writeResult.ok) {
      publishToolError({
        toolName,
        toolCallId,
        addToolResult,
        errorText: resolveToolErrorText(t, writeResult.error),
      });
      return;
    }

    syncTextEdit({
      path: writeResult.path,
      content: writeResult.finalContent,
      fileName: writeResult.fileName,
      launchIfMissing: true,
      bringToForeground: true,
      includeFilePathOnUpdate: true,
    });

    addToolResult({
      tool: toolName,
      toolCallId,
      output: t(writeResult.successKey, { path: writeResult.path }),
    });
  } catch (error) {
    console.error("write error:", error);
    publishToolError({
      toolName,
      toolCallId,
      addToolResult,
      errorText:
        error instanceof Error ? error.message : t("apps.chats.toolCalls.failedToWriteFile"),
    });
  }
};

export const handleChatEditToolCall = async ({
  path,
  oldString,
  newString,
  toolName,
  toolCallId,
  addToolResult,
  t,
  executeEditOperation = executeChatFileEditOperation,
  syncTextEdit,
}: BaseToolCallContext & {
  path: string;
  oldString: string;
  newString: string;
  executeEditOperation?: ExecuteEditOperationFn;
  syncTextEdit: SyncTextEditFn;
}): Promise<void> => {
  const editValidation = validateFileEditInput({
    path,
    oldString,
    newString,
  });
  if (!editValidation.ok) {
    publishToolError({
      toolName,
      toolCallId,
      addToolResult,
      errorText: t(editValidation.errorKey),
    });
    return;
  }

  const normalizedPath = editValidation.path;
  const normalizedOldString = editValidation.oldString;
  const normalizedNewString = editValidation.newString;

  console.log("[ToolCall] edit:", {
    path: normalizedPath,
    old_string: normalizedOldString.substring(0, 50) + "...",
    new_string: normalizedNewString.substring(0, 50) + "...",
  });

  try {
    const editResult = await executeEditOperation({
      path: normalizedPath,
      oldString: normalizedOldString,
      newString: normalizedNewString,
    });

    if (!editResult.ok) {
      publishToolError({
        toolName,
        toolCallId,
        addToolResult,
        errorText: resolveToolErrorText(t, editResult.error),
      });
      return;
    }

    if (editResult.target === "document") {
      syncTextEdit({
        path: normalizedPath,
        content: editResult.updatedContent,
        launchIfMissing: false,
        bringToForeground: false,
        includeFilePathOnUpdate: false,
      });
    }

    addToolResult({
      tool: toolName,
      toolCallId,
      output: t(editResult.successKey, { path: normalizedPath }),
    });
  } catch (error) {
    console.error("edit error:", error);
    publishToolError({
      toolName,
      toolCallId,
      addToolResult,
      errorText:
        error instanceof Error ? error.message : t("apps.chats.toolCalls.failedToEditFile"),
    });
  }
};
