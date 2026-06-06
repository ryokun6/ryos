import type { ToolHandler, ToolHandlerEntry, ToolContext } from "./types";

export * from "./types";
export * from "./helpers";

const toolHandlerRegistry = new Map<string, ToolHandlerEntry>();

export const registerToolHandler = <T = unknown>(
  toolName: string,
  handler: ToolHandler<T>
): void => {
  toolHandlerRegistry.set(toolName, {
    toolName,
    handler: handler as ToolHandler<unknown>,
  });
};

export const getToolHandler = (toolName: string): ToolHandler | undefined => {
  return toolHandlerRegistry.get(toolName)?.handler;
};

export const hasToolHandler = (toolName: string): boolean => {
  return toolHandlerRegistry.has(toolName);
};

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

export const getRegisteredTools = (): string[] => {
  return Array.from(toolHandlerRegistry.keys());
};

export { handleLaunchApp, handleCloseApp } from "./appHandlers";
export type { LaunchAppInput, CloseAppInput } from "./appHandlers";

export { handleSettings } from "./settingsHandler";
export type { SettingsInput } from "./settingsHandler";

export { handleIpodControl } from "./ipodHandler";
export type { IpodControlInput } from "./ipodHandler";

export { handleKaraokeControl } from "./karaokeHandler";
export type { KaraokeControlInput } from "./karaokeHandler";

export { handleStickiesControl } from "./stickiesHandler";
export type { StickiesControlInput } from "./stickiesHandler";

export { handleInfiniteMacControl } from "./infiniteMacHandler";
export type { InfiniteMacControlInput } from "./infiniteMacHandler";

export { handleCalendarControl } from "./calendarHandler";
export type { CalendarControlInput } from "./calendarHandler";

export { handleContactsControl } from "./contactsHandler";
export type { ContactsControlInput } from "./contactsHandler";

export { handleTvControl } from "./tvHandler";
export type { TvControlInput } from "./tvHandler";

// ============================================================================
// Register tool handlers for automatic dispatch (optional)
// ============================================================================

import { handleSettings } from "./settingsHandler";
import { handleIpodControl } from "./ipodHandler";
import { handleKaraokeControl } from "./karaokeHandler";
import { handleStickiesControl } from "./stickiesHandler";
import { handleInfiniteMacControl } from "./infiniteMacHandler";
import { handleCalendarControl } from "./calendarHandler";
import { handleContactsControl } from "./contactsHandler";
import { handleTvControl } from "./tvHandler";

registerToolHandler("settings", handleSettings);
registerToolHandler("ipodControl", handleIpodControl);
registerToolHandler("karaokeControl", handleKaraokeControl);
registerToolHandler("stickiesControl", handleStickiesControl);
registerToolHandler("infiniteMacControl", handleInfiniteMacControl);
registerToolHandler("calendarControl", handleCalendarControl);
registerToolHandler("contactsControl", handleContactsControl);
registerToolHandler("tvControl", handleTvControl);

// Note: launchApp and closeApp handlers require additional context
// so they are called directly from useAiChat rather than through the registry
