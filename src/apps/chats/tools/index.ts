/**
 * Tool Handler Registry
 *
 * This module provides a registry pattern for tool handlers, enabling
 * the gradual extraction of tool handling logic from the monolithic
 * useAiChat hook into individual, testable modules.
 *
 * ## Architecture
 *
 * The tool handler system follows these principles:
 * 1. Each tool handler is a pure function that receives input and context
 * 2. Handlers call addToolResult to return results to the chat
 * 3. Shared utilities are centralized in helpers.ts
 *
 * ## Migration Path
 *
 * To migrate a tool handler from useAiChat:
 * 1. Create a new file in src/apps/chats/tools/ (e.g., ipodHandler.ts)
 * 2. Export a handler function matching the ToolHandler type
 * 3. Register it in this file using registerToolHandler
 * 4. Remove the case from the switch statement in useAiChat
 *
 * ## Example Handler
 *
 * ```typescript
 * // src/apps/chats/tools/aquariumHandler.ts
 * import { ToolHandler } from './types';
 *
 * export const handleAquarium: ToolHandler = async (input, toolCallId, context) => {
 *   context.addToolResult({
 *     tool: 'aquarium',
 *     toolCallId,
 *     output: 'Aquarium displayed',
 *   });
 * };
 * ```
 *
 * Then register it:
 * ```typescript
 * registerToolHandler('aquarium', handleAquarium);
 * ```
 */

import type { ToolHandler, ToolHandlerEntry, ToolContext } from "./types";
import { resolveToolTranslator } from "./helpers";

// Re-export types and helpers for convenience
export * from "./types";
export * from "./helpers";

/**
 * Registry of tool handlers
 */
const toolHandlerRegistry = new Map<string, ToolHandlerEntry>();

/**
 * Register a tool handler
 */
export const registerToolHandler = <T = unknown>(
  toolName: string,
  handler: ToolHandler<T>
): void => {
  toolHandlerRegistry.set(toolName, {
    toolName,
    handler: handler as ToolHandler<unknown>,
  });
};

/**
 * Get a registered tool handler
 */
export const getToolHandler = (toolName: string): ToolHandler | undefined => {
  return toolHandlerRegistry.get(toolName)?.handler;
};

/**
 * Check if a tool handler is registered
 */
export const hasToolHandler = (toolName: string): boolean => {
  return toolHandlerRegistry.has(toolName);
};

/**
 * Execute a tool handler if registered
 * Returns true if the handler was found and executed, false otherwise
 */
export const executeToolHandler = async (
  toolName: string,
  input: unknown,
  toolCallId: string,
  context: ToolContext
): Promise<boolean> => {
  const handler = getToolHandler(toolName);
  if (!handler) {
    return false;
  }

  await handler(input, toolCallId, context);
  return true;
};

/**
 * Get list of all registered tool names
 */
export const getRegisteredTools = (): string[] => {
  return Array.from(toolHandlerRegistry.keys());
};

// ============================================================================
// Register tool handlers for automatic dispatch (lazy-loaded modules)
// ============================================================================

const resolveUnknownToolError = (context: ToolContext): string =>
  context.translate?.("apps.chats.toolCalls.unknownError") ?? "Unknown error";

const executeVfsToolFromContext = async (
  toolName: "list" | "open" | "read" | "write" | "edit",
  input: unknown,
  toolCallId: string,
  context: ToolContext,
): Promise<void> => {
  if (!context.vfs) {
    context.addToolResult({
      tool: toolName,
      toolCallId,
      state: "output-error",
      errorText: resolveUnknownToolError(context),
    });
    return;
  }

  const { handleChatVfsToolCall } = await import("../utils/chatFileToolHandlers");
  await handleChatVfsToolCall({
    toolName,
    input,
    toolCallId,
    addToolResult: context.addToolResult,
    t: resolveToolTranslator(context),
    ...context.vfs,
  });
};

registerToolHandler("aquarium", async (input, toolCallId, context) => {
  const { handleAquarium } = await import("./aquariumHandler");
  await handleAquarium(input, toolCallId, context);
});
registerToolHandler("generateHtml", async (input, toolCallId, context) => {
  const { handleGenerateHtml } = await import("./generateHtmlHandler");
  await handleGenerateHtml(input, toolCallId, context);
});
registerToolHandler("launchApp", async (input, toolCallId, context) => {
  const { handleLaunchApp } = await import("./appHandlers");
  const output = handleLaunchApp(
    input as { id: string; url?: string; year?: string },
    toolCallId,
    context,
  );
  if (output) {
    context.addToolResult({ tool: "launchApp", toolCallId, output });
  }
});
registerToolHandler("closeApp", async (input, toolCallId, context) => {
  const { handleCloseApp } = await import("./appHandlers");
  const output = handleCloseApp(input as { id: string }, toolCallId, context);
  if (output) {
    context.addToolResult({ tool: "closeApp", toolCallId, output });
  }
});
registerToolHandler("list", (input, toolCallId, context) =>
  executeVfsToolFromContext("list", input, toolCallId, context),
);
registerToolHandler("open", (input, toolCallId, context) =>
  executeVfsToolFromContext("open", input, toolCallId, context),
);
registerToolHandler("read", (input, toolCallId, context) =>
  executeVfsToolFromContext("read", input, toolCallId, context),
);
registerToolHandler("write", (input, toolCallId, context) =>
  executeVfsToolFromContext("write", input, toolCallId, context),
);
registerToolHandler("edit", (input, toolCallId, context) =>
  executeVfsToolFromContext("edit", input, toolCallId, context),
);
registerToolHandler("settings", async (input, toolCallId, context) => {
  const { handleSettings } = await import("./settingsHandler");
  handleSettings(input as never, toolCallId, context);
});
registerToolHandler("ipodControl", async (input, toolCallId, context) => {
  const { handleIpodControl } = await import("./ipodHandler");
  await handleIpodControl(input as never, toolCallId, context);
});
registerToolHandler("karaokeControl", async (input, toolCallId, context) => {
  const { handleKaraokeControl } = await import("./karaokeHandler");
  await handleKaraokeControl(input as never, toolCallId, context);
});
registerToolHandler("stickiesControl", async (input, toolCallId, context) => {
  const { handleStickiesControl } = await import("./stickiesHandler");
  handleStickiesControl(input as never, toolCallId, context);
});
registerToolHandler("infiniteMacControl", async (input, toolCallId, context) => {
  const { handleInfiniteMacControl } = await import("./infiniteMacHandler");
  await handleInfiniteMacControl(input as never, toolCallId, context);
});

// launchApp/closeApp use optional `context.appHandlers` dependencies.
