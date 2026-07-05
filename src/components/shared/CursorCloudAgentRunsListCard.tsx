import { ArrowSquareOut } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { CursorBrandMark } from "@/components/shared/CursorBrandMark";
import { cn } from "@/lib/utils";
import {
  toolInlineCardListClassName,
  toolInlineCardListRowClassName,
  toolInlineCardShellClassName,
} from "@/components/shared/toolInlineCardShell";
import { osSubtleIconButtonClassName } from "@/components/shared/osThemePrimitives";

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
  /** Extra classes merged onto the card shell (e.g. compact-host overrides). */
  className?: string;
}

function formatRunStatusLabel(status: string): string {
  const normalized = status.trim().replace(/_/g, " ");
  if (!normalized) return normalized;
  return normalized
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
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
  className,
}: CursorCloudAgentRunsListCardProps) {
  const { t } = useTranslation();
  const { isMacOSTheme, isWindowsTheme, isSystem7Theme, isWin98 } = useThemeFlags();

  if (!runs.length) return null;

  const shell = cn(
    toolInlineCardShellClassName({
      isMacOSTheme,
      isSystem7Theme,
      isWindowsTheme,
      isWin98,
    }),
    className
  );

  return (
    <div className={shell}>
      <ul
        className={toolInlineCardListClassName({ isMacOSTheme })}
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
                })}
              >
                <CursorBrandMark
                  className={cn(
                    isMacOSTheme
                      ? "bg-black/[0.06] os-mac-aqua-dark:bg-white/10"
                      : "bg-neutral-200 dark:bg-neutral-800"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="min-w-0 truncate text-[13px] font-semibold leading-tight text-os-text-primary">
                    {primary}
                  </div>
                  {secondary ? (
                    <div className="line-clamp-2 text-[11px] leading-snug text-os-text-secondary">
                      {secondary}
                    </div>
                  ) : null}
                  <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-os-text-secondary">
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        statusDotClass(run.status)
                      )}
                      aria-hidden
                    />
                    <span>{formatRunStatusLabel(run.status)}</span>
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
                      osSubtleIconButtonClassName()
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
