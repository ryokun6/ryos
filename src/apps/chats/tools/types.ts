import type { AppId } from "@/config/appIds";
import type { LaunchAppOptions } from "@/hooks/useLaunchApp";

/**
 * Tool Handler Types
 *
 * This module defines the types used by the tool handler registry pattern.
 * The goal is to enable extracting tool handlers from the monolithic useAiChat hook
 * into individual, testable modules.
 */

/**
 * Context provided to all tool handlers
 */
export interface ToolContext {
  /** Function to launch an app by ID */
  launchApp: (appId: AppId, options?: LaunchAppOptions) => string;
  /** Function to add tool result back to the chat */
  addToolResult: (result: ToolResultPayload) => void;
  /** Detect user's operating system */
  detectUserOS: () => string;
  /** Optional translation function for tool handlers */
  translate?: (key: string, params?: Record<string, unknown>) => string;
  /** Optional dependencies used by app launch/close handlers */
  appHandlers?: AppHandlerDependencies;
}

export interface AppHandlerDependencies {
  getAppNameById?: (appId: AppId) => string;
  getInstancesByAppId?: (
    appId: AppId,
  ) => Array<{ instanceId: string; isOpen: boolean }>;
  closeWindowByInstanceId?: (instanceId: string) => void;
  translate?: (key: string, params?: Record<string, unknown>) => string;
}

/**
 * Payload for tool results
 * Matches the AI SDK's addToolResult signature
 */
export type ToolResultPayload =
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

/**
 * Tool handler function signature
 */
export type ToolHandler<T = unknown> = (
  input: T,
  toolCallId: string,
  context: ToolContext
) => Promise<void> | void;

/**
 * Tool handler registry entry
 */
export interface ToolHandlerEntry<T = unknown> {
  /** Handler function */
  handler: ToolHandler<T>;
  /** Tool name for matching */
  toolName: string;
}
