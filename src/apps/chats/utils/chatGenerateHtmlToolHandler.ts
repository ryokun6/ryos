import type { ToolResultPayload } from "../tools/types";

type TranslateFn = (key: string, params?: Record<string, unknown>) => string;
type AddToolResult = (result: ToolResultPayload) => void;

export const handleChatGenerateHtmlToolCall = ({
  html,
  toolName,
  toolCallId,
  addToolResult,
  t,
}: {
  html: unknown;
  toolName: string;
  toolCallId: string;
  addToolResult: AddToolResult;
  t: TranslateFn;
}): void => {
  if (typeof html !== "string" || html.trim().length === 0) {
    addToolResult({
      tool: toolName,
      toolCallId,
      state: "output-error",
      errorText: t("apps.chats.toolCalls.noContentProvided"),
    });
    return;
  }

  console.log("[ToolCall] generateHtml:", {
    htmlLength: html.length,
  });
  console.log("[ToolCall] Generated HTML:", html.substring(0, 100) + "...");
};
