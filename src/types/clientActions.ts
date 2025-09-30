/**
 * Client Actions - Server-side tools can request client-side actions
 * This enables proper sequential tool execution with state dependencies
 */

export type ClientActionType =
  | "launchApp"
  | "closeApp"
  | "textEditNewFile"
  | "textEditInsertText"
  | "textEditSearchReplace"
  | "switchTheme"
  | "ipodPlayPause"
  | "ipodPlaySong"
  | "ipodAddAndPlaySong"
  | "ipodNextTrack"
  | "ipodPreviousTrack";

export interface ClientAction {
  type: ClientActionType;
  params: Record<string, unknown>;
}

export interface ClientActionResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

// Specific action param types for type safety
export interface LaunchAppActionParams {
  id: string;
  url?: string;
  year?: string;
}

export interface TextEditNewFileActionParams {
  title?: string;
}

export interface TextEditInsertTextActionParams {
  instanceId: string;
  text: string;
  position?: "start" | "end";
}

export interface TextEditSearchReplaceActionParams {
  instanceId: string;
  search: string;
  replace: string;
  isRegex?: boolean;
}

