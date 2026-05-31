import { ArrowSquareOut, Robot } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { cn } from "@/lib/utils";
import {
  toolInlineCardListClassName,
  toolInlineCardListRowClassName,
  toolInlineCardShellClassName,
} from "@/components/shared/toolInlineCardShell";

export interface CursorCloudAgentRunListRow {
  runId: string;
  agentId: string;
  status: string;
  agentTitle?: string;
  promptPreview?: string;
  summaryPreview?: string;
  errorPreview?: string;
  prUrl?: string;
  agentDashboardUrl?: string;
}

export interface CursorCloudAgentRunsListCardProps {
  runs: CursorCloudAgentRunListRow[];
}

function statusDotClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "running") return "bg-amber-500";
  if (s === "finished") return "bg-emerald-500";
  if (s === "error" || s === "failed" || s === "cancelled" || s === "canceled") {
    return "bg-red-500";
  }
  return "bg-neutral-400";
}

function rowPrimarySecondary(run: CursorCloudAgentRunListRow): {
  primary: string;
  secondary: string | null;
} {
  const summaryLine =
    run.summaryPreview || run.errorPreview || run.promptPreview || "—";
  const taskTitle = run.agentTitle?.trim();
  const primary = taskTitle || summaryLine;
  const secondary =
    taskTitle && summaryLine !== "—" && summaryLine !== taskTitle
      ? summaryLine
      : null;
  return { primary, secondary };
}

/**
 * Inline chat list for `listCursorCloudAgentRuns` — layout parallels
 * `MapsSearchPlacesCard` (pinstripe aqua shell, divided rows).
 */
export function CursorCloudAgentRunsListCard({
  runs,
}: CursorCloudAgentRunsListCardProps) {
  const { t } = useTranslation();
  const { isMacOSTheme, isXpTheme, isSystem7Theme, isDarkMode } = useThemeFlags();

  if (!runs.length) return null;

  const shell = toolInlineCardShellClassName({
    isMacOSTheme,
    isSystem7Theme,
    isXpTheme,
  });

  return (
    <div className={shell}>
      <ul
        className={toolInlineCardListClassName({ isMacOSTheme, isDarkMode })}
      >
        {runs.map((run) => {
          const { primary, secondary } = rowPrimarySecondary(run);
          const dash =
            run.agentDashboardUrl?.trim() ||
            (run.agentId
              ? `https://cursor.com/agents/${encodeURIComponent(run.agentId)}`
              : null);

          return (
            <li key={run.runId}>
              <div
                className={toolInlineCardListRowClassName({
                  isMacOSTheme,
                  isDarkMode,
                })}
              >
                <div
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-[0.35rem]",
                    isMacOSTheme && isDarkMode
                      ? "bg-white/10"
                      : isMacOSTheme
                        ? "bg-black/[0.06]"
                        : "bg-neutral-200 dark:bg-neutral-800"
                  )}
                  aria-hidden
                >
                  <Robot
                    className="size-5 text-os-text-secondary"
                    weight="duotone"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        statusDotClass(run.status)
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-tight text-os-text-primary">
                      {primary}
                    </div>
                  </div>
                  {secondary ? (
                    <div className="line-clamp-2 text-[11px] leading-snug text-os-text-secondary">
                      {secondary}
                    </div>
                  ) : null}
                  <div className="mt-0.5 text-[10px] text-os-text-secondary">
                    {run.status}
                  </div>
                </div>
                {dash ? (
                  <a
                    href={dash}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      "shrink-0 -mr-0.5 flex size-7 items-center justify-center rounded-full",
                      "focus:outline-none focus-visible:ring-1",
                      isMacOSTheme && isDarkMode
                        ? "text-os-text-secondary hover:bg-white/12 hover:text-os-text-primary focus-visible:ring-white/35"
                        : "text-os-text-secondary hover:bg-black/10 hover:text-os-text-primary focus-visible:ring-black/30"
                    )}
                    aria-label={t(
                      "apps.chats.toolCalls.listCursorCloudAgentRuns.openDashboard",
                      { defaultValue: "Open agent in Cursor" }
                    )}
                    title={t(
                      "apps.chats.toolCalls.listCursorCloudAgentRuns.openDashboard",
                      { defaultValue: "Open agent in Cursor" }
                    )}
                  >
                    <ArrowSquareOut size={14} weight="bold" />
                  </a>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
