import { useEffect, useState } from "react";
import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";

/**
 * Polls `/api/ai/cursor-run-status` until the run emits a terminal event.
 * Reads `meta.agentTitle` from Redis so the banner matches catalog even when tool JSON omits it.
 */
export function useCursorAgentRunPoll(runId: string) {
  const [events, setEvents] = useState<unknown[]>([]);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metaAgentTitle, setMetaAgentTitle] = useState<string | null>(null);

  useEffect(() => {
    if (!runId || done) return undefined;

    let cancelled = false;

    async function tick() {
      try {
        const res = await abortableFetch(
          `${getApiUrl("/api/ai/cursor-run-status")}?runId=${encodeURIComponent(runId)}`,
          {
            credentials: "include",
            timeout: 25000,
            retry: { maxAttempts: 1, initialDelayMs: 250 },
          }
        );
        const data = (await res.json()) as {
          events?: unknown[];
          done?: boolean;
          meta?: { agentTitle?: unknown };
        };
        if (cancelled) return;
        setEvents(Array.isArray(data.events) ? data.events : []);
        setError(null);
        if (data.done) setDone(true);

        const raw = data.meta?.agentTitle;
        const agentTitle =
          typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : "";
        if (agentTitle) setMetaAgentTitle(agentTitle);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    }

    void tick();
    const id = window.setInterval(() => void tick(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [runId, done]);

  return { events, done, error, metaAgentTitle };
}
