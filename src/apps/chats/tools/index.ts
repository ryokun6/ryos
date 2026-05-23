/**
 * Tool Handlers — Public Surface
 *
 * Individual tool handlers live in their own files (`ipodHandler.ts`,
 * `karaokeHandler.ts`, etc.) and are imported directly by `useAiChat`'s
 * `onToolCall` dispatcher.
 *
 * Each handler is a pure function with the `ToolHandler` signature from
 * `./types` and receives a `ToolContext` for shared dependencies (launching
 * apps, returning tool results, OS detection).
 *
 * See `plans/chats_useaichat_tts_cleanup.md` (Wave 3) for the planned
 * unification of dispatch into `useChatTools`.
 */

export * from "./types";
export * from "./helpers";

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
