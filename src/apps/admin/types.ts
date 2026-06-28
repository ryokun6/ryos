import type { AdminSection } from "./utils/navigationState";

/** Deep-link / launch options for the Admin app window. */
export interface AdminInitialData {
  section?: AdminSection;
  /** Prefill the Cursor Agents toolbar prompt. */
  cursorAgentPrompt?: string;
  /** When true, submit `cursorAgentPrompt` via startCursorAgent on arrival. */
  autoStartCursorAgent?: boolean;
  /** Dedupes repeated launchApp calls with the same prompt (see Chats prefillRequestId). */
  cursorAgentRequestId?: string;
}
