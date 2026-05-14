import { useCallback, useEffect, useReducer, useRef } from "react";
import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";

export interface CursorAgentRunMeta {
  agentId?: string;
  agentTitle?: string;
  prUrl?: string;
  /** Set on the meta when a follow-up has been queued; UI follows the chain. */
  nextRunId?: string;
  /** When non-null, a run is in flight on this agent. */
  activeRunId?: string;
  terminalStatus?: string;
}

interface CursorRunStatusResponse {
  events?: unknown[];
  done?: boolean;
  meta?: {
    agentId?: unknown;
    agentTitle?: unknown;
    prUrl?: unknown;
    nextRunId?: unknown;
    activeRunId?: unknown;
    terminalStatus?: unknown;
  };
  terminal?: { prUrl?: unknown } | null;
}

function pickMeta(raw: CursorRunStatusResponse | null): CursorAgentRunMeta {
  const m = raw?.meta ?? {};
  const next: CursorAgentRunMeta = {};
  if (typeof m.agentId === "string" && m.agentId.trim().length > 0) {
    next.agentId = m.agentId.trim();
  }
  if (typeof m.agentTitle === "string" && m.agentTitle.trim().length > 0) {
    next.agentTitle = m.agentTitle.trim();
  }
  if (typeof m.prUrl === "string" && m.prUrl.trim().length > 0) {
    next.prUrl = m.prUrl.trim();
  } else if (
    raw?.terminal &&
    typeof raw.terminal === "object" &&
    typeof (raw.terminal as { prUrl?: unknown }).prUrl === "string"
  ) {
    const tp = (raw.terminal as { prUrl?: string }).prUrl as string;
    if (tp.trim().length > 0) next.prUrl = tp.trim();
  }
  if (typeof m.nextRunId === "string" && m.nextRunId.trim().length > 0) {
    next.nextRunId = m.nextRunId.trim();
  }
  if (typeof m.activeRunId === "string" && m.activeRunId.trim().length > 0) {
    next.activeRunId = m.activeRunId.trim();
  }
  if (typeof m.terminalStatus === "string") {
    next.terminalStatus = m.terminalStatus;
  }
  return next;
}

export interface UseCursorAgentRunPollResult {
  events: unknown[];
  done: boolean;
  error: string | null;
  meta: CursorAgentRunMeta;
  /** Convenience accessor (kept for compatibility with existing callers). */
  metaAgentTitle: string | null;
  /** Run id currently being polled. May change after a follow-up is sent. */
  activeRunId: string;
  /** Send a follow-up prompt to the same agent and start tracking the new run. */
  sendFollowup: (prompt: string) => Promise<void>;
  /** True while a follow-up is being submitted. */
  isSendingFollowup: boolean;
  /** Last follow-up submission error (cleared on next attempt). */
  followupError: string | null;
}

/**
 * Polls `/api/ai/cursor-run-status` until the run emits a terminal event.
 * Reads `meta.agentTitle` from Redis so the banner matches catalog even when
 * tool JSON omits it. When the meta references a follow-up run, the hook
 * automatically swaps to the new run id so the chat card keeps streaming.
 */
export function useCursorAgentRunPoll(
  initialRunId: string
): UseCursorAgentRunPollResult {
  interface CursorAgentRunPollState {
    events: unknown[];
    done: boolean;
    error: string | null;
    meta: CursorAgentRunMeta;
    activeRunId: string;
    isSendingFollowup: boolean;
    followupError: string | null;
  }

  const initialState: CursorAgentRunPollState = {
    events: [],
    done: false,
    error: null,
    meta: {},
    activeRunId: initialRunId,
    isSendingFollowup: false,
    followupError: null,
  };

  type CursorAgentRunPollAction =
    | { type: "patch"; payload: Partial<CursorAgentRunPollState> }
    | { type: "resetForInitialRun"; initialRunId: string }
    | { type: "mergeMeta"; payload: CursorAgentRunMeta };

  const reducer = (
    state: CursorAgentRunPollState,
    action: CursorAgentRunPollAction
  ): CursorAgentRunPollState => {
    switch (action.type) {
      case "patch":
        return { ...state, ...action.payload };
      case "resetForInitialRun":
        return {
          ...state,
          activeRunId: action.initialRunId,
          events: [],
          done: false,
          error: null,
          meta: {},
        };
      case "mergeMeta": {
        const merged: CursorAgentRunMeta = { ...state.meta, ...action.payload };
        if (!merged.agentTitle && state.meta.agentTitle) {
          merged.agentTitle = state.meta.agentTitle;
        }
        if (!merged.prUrl && state.meta.prUrl) merged.prUrl = state.meta.prUrl;
        if (!merged.agentId && state.meta.agentId) merged.agentId = state.meta.agentId;
        return { ...state, meta: merged };
      }
      default:
        return state;
    }
  };

  const [state, dispatch] = useReducer(reducer, initialState);
  const {
    events,
    done,
    error,
    meta,
    activeRunId,
    isSendingFollowup,
    followupError,
  } = state;
  const tickRef = useRef<(force?: boolean) => Promise<void>>(async () => {});

  useEffect(() => {
    dispatch({ type: "resetForInitialRun", initialRunId });
  }, [initialRunId]);

  useEffect(() => {
    if (!activeRunId) return undefined;

    let cancelled = false;
    let pollInterval: number | null = null;

    async function tick(force = false) {
      try {
        const res = await abortableFetch(
          `${getApiUrl("/api/ai/cursor-run-status")}?runId=${encodeURIComponent(activeRunId)}`,
          {
            credentials: "include",
            timeout: 25000,
            retry: { maxAttempts: 1, initialDelayMs: 250 },
          }
        );
        const data = (await res.json()) as CursorRunStatusResponse;
        if (cancelled) return;

        const newEvents = Array.isArray(data.events) ? data.events : [];
        dispatch({
          type: "patch",
          payload: { events: newEvents, error: null },
        });

        const m = pickMeta(data);
        dispatch({ type: "mergeMeta", payload: m });

        // If a follow-up has been queued, swap to it on the next tick.
        if (m.nextRunId && m.nextRunId !== activeRunId) {
          dispatch({
            type: "patch",
            payload: {
              activeRunId: m.nextRunId,
              done: false,
              events: [],
            },
          });
          return;
        }

        if (data.done) dispatch({ type: "patch", payload: { done: true } });
        // After a force-refresh ping, if the server reports the run is now
        // done, stop polling immediately on this tick.
        if (force && data.done) dispatch({ type: "patch", payload: { done: true } });
      } catch (e) {
        if (!cancelled) {
          dispatch({
            type: "patch",
            payload: { error: e instanceof Error ? e.message : String(e) },
          });
        }
      }
    }
    tickRef.current = tick;

    void tick();
    if (!done) {
      pollInterval = window.setInterval(() => void tick(), 2000);
    }
    return () => {
      cancelled = true;
      if (pollInterval !== null) window.clearInterval(pollInterval);
    };
  }, [activeRunId, done]);

  const sendFollowup = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed) {
        dispatch({
          type: "patch",
          payload: { followupError: "Prompt is required" },
        });
        return;
      }
      if (!activeRunId) {
        dispatch({
          type: "patch",
          payload: { followupError: "No active run" },
        });
        return;
      }
      dispatch({
        type: "patch",
        payload: { isSendingFollowup: true, followupError: null },
      });
      try {
        const res = await abortableFetch(
          getApiUrl("/api/ai/cursor-run-followup"),
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ runId: activeRunId, prompt: trimmed }),
            timeout: 30000,
            throwOnHttpError: false,
            retry: { maxAttempts: 1, initialDelayMs: 250 },
          }
        );
        const data = (await res.json().catch(() => ({}))) as {
          runId?: string;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data?.error || `Failed (${res.status})`);
        }
        if (typeof data.runId !== "string" || data.runId.length === 0) {
          throw new Error("Server did not return a new runId");
        }
        dispatch({
          type: "patch",
          payload: {
            activeRunId: data.runId,
            events: [],
            done: false,
            meta: {
              ...meta,
              nextRunId: undefined,
              activeRunId: data.runId,
              terminalStatus: undefined,
            },
          },
        });
        // Kick a quick refresh so the spinner shows immediately.
        void tickRef.current?.(true);
      } catch (e) {
        dispatch({
          type: "patch",
          payload: { followupError: e instanceof Error ? e.message : String(e) },
        });
      } finally {
        dispatch({ type: "patch", payload: { isSendingFollowup: false } });
      }
    },
    [activeRunId, meta]
  );

  return {
    events,
    done,
    error,
    meta,
    metaAgentTitle: meta.agentTitle ?? null,
    activeRunId,
    sendFollowup,
    isSendingFollowup,
    followupError,
  };
}
