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
// Import and export individual handlers
// ============================================================================

export { handleLaunchApp, handleCloseApp } from "./appHandlers";
export type { LaunchAppInput, CloseAppInput } from "./appHandlers";

export { handleSettings } from "./settingsHandler";
export type { SettingsInput } from "./settingsHandler";

export { handleIpodControl } from "./ipodHandler";
export type { IpodControlInput } from "./ipodHandler";

export { handleKaraokeControl } from "./karaokeHandler";
export type { KaraokeControlInput } from "./karaokeHandler";

// ============================================================================
// Register tool handlers for automatic dispatch (optional)
// ============================================================================

import { handleSettings } from "./settingsHandler";
import { handleIpodControl } from "./ipodHandler";
import { handleKaraokeControl } from "./karaokeHandler";

registerToolHandler("settings", handleSettings);
registerToolHandler("ipodControl", handleIpodControl);
registerToolHandler("karaokeControl", handleKaraokeControl);

// Note: launchApp and closeApp handlers require additional context (closeAppLegacy)
// so they are called directly from useAiChat rather than through the registry
