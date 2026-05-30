import { useEffect, useState } from "react";
import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";

interface LiveBadgeState {
  status: string | undefined;
  prUrl: string | undefined;
  isPolling: boolean;
}

/**
 * Lightweight poll for list/history summary cards: only meta status + PR, not full event stream.
 */
export function useCursorAgentRunStatusBadge(
  runId: string | undefined,
  initialStatus: string | undefined
): LiveBadgeState {
  const [state, setState] = useState<LiveBadgeState>({
    status: initialStatus,
    prUrl: undefined,
    isPolling: false,
  });

  useEffect(() => {
    setState({
      status: initialStatus,
      prUrl: undefined,
      isPolling: false,
    });
  }, [runId, initialStatus]);

  useEffect(() => {
    const id = runId?.trim();
    const initial = (initialStatus ?? "").toLowerCase();
    if (!id || initial !== "running") return undefined;

    let cancelled = false;
    let interval: number | null = null;

    async function tick() {
      try {
        const res = await abortableFetch(
          `${getApiUrl("/api/ai/cursor-run-status")}?runId=${encodeURIComponent(id!)}`,
          {
            credentials: "include",
            timeout: 15000,
            retry: { maxAttempts: 1, initialDelayMs: 200 },
          }
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          done?: boolean;
          meta?: {
            terminalStatus?: unknown;
            prUrl?: unknown;
            activeRunId?: unknown;
          };
          terminal?: { prUrl?: unknown } | null;
        };
        if (cancelled) return;

        const meta = data.meta ?? {};
        let status = "running";
        if (data.done) {
          const term =
            typeof meta.terminalStatus === "string"
              ? meta.terminalStatus
              : "finished";
          status = term === "finished" ? "finished" : term;
        }

        let prUrl: string | undefined;
        if (typeof meta.prUrl === "string" && meta.prUrl.trim()) {
          prUrl = meta.prUrl.trim();
        } else if (
          data.terminal &&
          typeof data.terminal === "object" &&
          typeof (data.terminal as { prUrl?: unknown }).prUrl === "string"
        ) {
          const tp = (data.terminal as { prUrl: string }).prUrl.trim();
          if (tp) prUrl = tp;
        }

        setState({ status, prUrl, isPolling: !data.done });

        if (data.done && interval !== null) {
          window.clearInterval(interval);
          interval = null;
        }
      } catch {
        if (!cancelled) setState((s) => ({ ...s, isPolling: false }));
      }
    }

    setState((s) => ({ ...s, isPolling: true }));
    void tick();
    interval = window.setInterval(() => void tick(), 3000);

    return () => {
      cancelled = true;
      if (interval !== null) window.clearInterval(interval);
    };
  }, [runId, initialStatus]);

  return state;
}
