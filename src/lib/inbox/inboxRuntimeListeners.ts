import { useEffect } from "react";
import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";
import { onAppletUpdated, type AppletUpdatedEventDetail } from "@/utils/appEventBus";
import { useInboxStore } from "@/stores/useInboxStore";

interface CursorRunMetaSlice {
  agentId?: string;
  agentTitle?: string;
  prUrl?: string;
}

interface CursorRunStatusResponse {
  done?: boolean;
  meta?: Record<string, unknown>;
  terminal?: { prUrl?: unknown } | null;
}

function pickMeta(raw: CursorRunStatusResponse | null): CursorRunMetaSlice {
  const m = raw?.meta ?? {};
  const next: CursorRunMetaSlice = {};
  if (typeof m.agentId === "string" && m.agentId.trim()) {
    next.agentId = m.agentId.trim();
  }
  if (typeof m.agentTitle === "string" && m.agentTitle.trim()) {
    next.agentTitle = m.agentTitle.trim();
  }
  if (typeof m.prUrl === "string" && m.prUrl.trim()) {
    next.prUrl = m.prUrl.trim();
  } else if (
    raw?.terminal &&
    typeof raw.terminal === "object" &&
    typeof (raw.terminal as { prUrl?: unknown }).prUrl === "string"
  ) {
    const tp = (raw.terminal as { prUrl: string }).prUrl;
    if (tp.trim()) next.prUrl = tp.trim();
  }
  return next;
}

function appletDisplayPath(path?: string): string {
  if (!path || !path.trim()) return "Applet";
  const leaf = path.replace(/^\/+|\/+$/g, "").split("/").pop();
  return leaf && leaf.length > 0 ? leaf : path;
}

export function recordAppletUpdatedInbox(detail: AppletUpdatedEventDetail) {
  const path = detail.path?.trim();
  const dedupeKey =
    path && path.length > 0
      ? (`applet_updated:${path}` as const)
      : (`applet_updated:unknown:${Date.now()}` as const);

  useInboxStore.getState().upsertItem({
    dedupeKey,
    category: "applet",
    title: "Applet updated",
    preview: path
      ? `“${appletDisplayPath(path)}” was saved from Chats.`
      : "An applet was saved from Chats.",
    body: path
      ? `Ryo edited and saved:\n${path}\n\nOpen the Applet Store or your Applets folder to run it.`
      : "An applet file was updated from Chats.",
    action: {
      kind: "launch_app",
      appId: "applet-viewer",
      initialData: path ? { path } : undefined,
    },
    source: { producer: "chats_edit_applet", extras: path ? { path } : undefined },
  });
}

/** Dedupe Cursor polls across remounts / duplicate events */
const cursorPollCleanups = new Map<string, () => void>();

/** Poll Cursor Cloud agent run until terminal; one inbox row per chat-started run (`cursor_agent:${rootRunId}`). */
export function pollCursorAgentRunForInbox(rootRunId: string) {
  const existing = cursorPollCleanups.get(rootRunId);
  existing?.();

  let cancelled = false;
  let timer: number | null = null;
  let activeRunId = rootRunId;
  let mergedMeta: CursorRunMetaSlice = {};

  const dedupeKey = `cursor_agent:${rootRunId}` as const;

  async function tick() {
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

      mergedMeta = { ...mergedMeta, ...pickMeta(data) };

      const title =
        mergedMeta.agentTitle && mergedMeta.agentTitle.trim().length > 0
          ? mergedMeta.agentTitle.trim()
          : "Cursor agent";

      const done = !!data.done;
      const preview = done
        ? mergedMeta.prUrl
          ? "Finished — pull request available."
          : "Finished."
        : "Running…";

      const body = mergedMeta.prUrl
        ? `Agent finished.\n\nPull request:\n${mergedMeta.prUrl}`
        : done
          ? "The Cursor Cloud agent run finished."
          : "This agent is still running. Details refresh until it completes.";

      const action = mergedMeta.prUrl
        ? { kind: "open_url" as const, url: mergedMeta.prUrl }
        : mergedMeta.agentId
          ? {
              kind: "open_url" as const,
              url: `https://cursor.com/agents/${encodeURIComponent(mergedMeta.agentId)}`,
            }
          : undefined;

      useInboxStore.getState().upsertItem({
        dedupeKey,
        category: "cursor_agent",
        title,
        preview,
        body,
        action,
        source: {
          producer: "cursor_cloud_agent",
          extras: {
            rootRunId,
            activeRunId,
            ...(mergedMeta.agentId ? { agentId: mergedMeta.agentId } : {}),
          },
        },
      });

      const nextRunRaw = data.meta?.nextRunId;
      const nextRun =
        typeof nextRunRaw === "string" && nextRunRaw.trim().length > 0
          ? nextRunRaw.trim()
          : "";
      if (nextRun && nextRun !== activeRunId) {
        activeRunId = nextRun;
      }

      if (done) return;

      timer = window.setTimeout(() => void tick(), 2000);
    } catch {
      if (!cancelled) timer = window.setTimeout(() => void tick(), 4000);
    }
  }

  void tick();

  const cleanup = () => {
    cancelled = true;
    if (timer !== null) window.clearTimeout(timer);
    cursorPollCleanups.delete(rootRunId);
  };
  cursorPollCleanups.set(rootRunId, cleanup);
  return cleanup;
}

export function useInboxRuntimeSubscriptions() {
  useEffect(() => {
    return onAppletUpdated((e) => recordAppletUpdatedInbox(e.detail));
  }, []);
}
