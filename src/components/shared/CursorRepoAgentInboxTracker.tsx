import { useEffect } from "react";
import { pollCursorAgentRunForInbox } from "@/lib/inbox/inboxRuntimeListeners";

/** Starts inbox polling for this Cursor Cloud agent run while the chat card is mounted. */
export function CursorRepoAgentInboxTracker({ runId }: { runId: string }) {
  useEffect(() => {
    const trimmed = runId.trim();
    if (!trimmed) return undefined;
    return pollCursorAgentRunForInbox(trimmed);
  }, [runId]);
  return null;
}
