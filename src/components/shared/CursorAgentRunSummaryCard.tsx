import { ArrowSquareOut } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  cursorAgentDisplaySummary,
  cursorAgentDisplayTitle,
  cursorAgentStatusTone,
  cursorAgentDashboardUrl,
  formatCursorAgentTimestamp,
  type CursorAgentRunPreviewData,
} from "@/lib/cursorAgentChatPreview";
import { useCursorAgentRunStatusBadge } from "@/components/shared/useCursorAgentRunStatusBadge";

export interface CursorAgentRunSummaryCardProps {
  run: CursorAgentRunPreviewData;
  /** When true and run is still running, poll meta for live status (list/history rows). */
  enableLiveStatus?: boolean;
  className?: string;
}

function statusDotClass(tone: ReturnType<typeof cursorAgentStatusTone>): string {
  switch (tone) {
    case "running":
      return "bg-amber-500";
    case "finished":
      return "bg-emerald-500";
    case "error":
      return "bg-red-500";
    default:
      return "bg-neutral-400";
  }
}

function statusLabelKey(tone: ReturnType<typeof cursorAgentStatusTone>): string {
  switch (tone) {
    case "running":
      return "apps.chats.toolCalls.cursorCloudAgent.running";
    case "finished":
      return "apps.chats.toolCalls.cursorCloudAgent.finished";
    case "error":
      return "apps.chats.toolCalls.cursorCloudAgent.statusError";
    default:
      return "apps.chats.toolCalls.cursorCloudAgent.statusUnknown";
  }
}

/**
 * Compact Cursor agent preview for chat: list rows, dashboard-only links, etc.
 */
export function CursorAgentRunSummaryCard({
  run,
  enableLiveStatus = false,
  className,
}: CursorAgentRunSummaryCardProps) {
  const { t, i18n } = useTranslation();
  const live = useCursorAgentRunStatusBadge(
    enableLiveStatus ? run.runId : undefined,
    run.status
  );
  const status = live.status ?? run.status;
  const tone = cursorAgentStatusTone(status);
  const title =
    cursorAgentDisplayTitle(run) ||
    t("apps.chats.toolCalls.cursorCloudAgent.panelTitle");
  const summary = cursorAgentDisplaySummary(run);
  const dashboardUrl =
    run.agentDashboardUrl?.trim() ||
    (run.agentId?.trim() ? cursorAgentDashboardUrl(run.agentId) : undefined);
  const createdLabel = formatCursorAgentTimestamp(
    run.createdAt ?? run.updatedAt,
    i18n.language
  );
  const prUrl = (live.prUrl ?? run.prUrl)?.trim();

  return (
    <div
      className={cn(
        "my-1 overflow-hidden rounded bg-white font-geneva-12 dark:bg-neutral-950",
        className
      )}
      style={{ boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.3)" }}
      data-cursor-agent-preview
    >
      <div className="flex items-start gap-2 border-b border-neutral-300 bg-neutral-100 px-2.5 py-2 dark:border-neutral-600 dark:bg-neutral-800/90">
        <span className="relative inline-flex size-5 shrink-0 items-center justify-center pt-0.5" aria-hidden>
          <img
            src="/brands/cursor-cube-2d-light.svg"
            alt=""
            width={20}
            height={20}
            className="size-5 dark:hidden"
            draggable={false}
          />
          <img
            src="/brands/cursor-cube-2d-dark.svg"
            alt=""
            width={20}
            height={20}
            className="hidden size-5 dark:block"
            draggable={false}
          />
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-[12px] font-medium text-neutral-900 dark:text-neutral-100"
            title={title}
          >
            {title}
          </div>
          {summary ? (
            <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-neutral-600 dark:text-neutral-400">
              {summary}
            </div>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-neutral-600 dark:text-neutral-400">
            <span className="inline-flex items-center gap-1">
              <span
                className={cn("size-1.5 rounded-full", statusDotClass(tone))}
                aria-hidden
              />
              <span>{t(statusLabelKey(tone))}</span>
              {live.isPolling ? (
                <span className="text-neutral-400 dark:text-neutral-500">
                  · {t("apps.chats.toolCalls.cursorCloudAgent.live")}
                </span>
              ) : null}
            </span>
            {createdLabel ? (
              <span className="text-neutral-500 dark:text-neutral-500">
                {t("apps.chats.toolCalls.cursorCloudAgent.createdAt", {
                  time: createdLabel,
                })}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {(dashboardUrl || prUrl) && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-neutral-200 px-2.5 py-1.5 dark:border-neutral-700">
          {dashboardUrl ? (
            <a
              href={dashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 rounded border border-neutral-300 bg-white/85 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-900/70 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              <ArrowSquareOut className="size-3" weight="bold" />
              {t("apps.chats.toolCalls.cursorCloudAgent.openDashboard")}
            </a>
          ) : null}
          {prUrl ? (
            <a
              href={prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 rounded border border-neutral-300 bg-white/85 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-900/70 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              <ArrowSquareOut className="size-3" weight="bold" />
              {t("apps.chats.toolCalls.cursorCloudAgent.openPr")}
            </a>
          ) : null}
        </div>
      )}
    </div>
  );
}
