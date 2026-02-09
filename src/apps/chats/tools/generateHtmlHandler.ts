import type { ToolHandler } from "./types";

const translateOrFallback = (
  t: ((key: string, params?: Record<string, unknown>) => string) | undefined,
  key: string,
  fallback: string,
): string => {
  const translated = t?.(key);
  return typeof translated === "string" && translated.trim().length > 0
    ? translated
    : fallback;
};

export const handleGenerateHtml: ToolHandler = (input, toolCallId, context) => {
  const html = (input as { html?: unknown })?.html;
  if (typeof html !== "string" || html.trim().length === 0) {
    context.addToolResult({
      tool: "generateHtml",
      toolCallId,
      state: "output-error",
      errorText: translateOrFallback(
        context.translate,
        "apps.chats.toolCalls.noContentProvided",
        "No content provided",
      ),
    });
    return;
  }

  console.log("[ToolCall] generateHtml:", { htmlLength: html.length });
  console.log("[ToolCall] Generated HTML:", html.substring(0, 100) + "...");
};
