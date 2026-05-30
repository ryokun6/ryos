import { useTranslation } from "react-i18next";
import { CursorAgentRunSummaryCard } from "@/components/shared/CursorAgentRunSummaryCard";
import type { CursorAgentRunPreviewData } from "@/lib/cursorAgentChatPreview";

export interface CursorCloudAgentRunsListCardProps {
  runs: CursorAgentRunPreviewData[];
  truncated?: boolean;
}

/**
 * Inline chat card for `listCursorCloudAgentRuns` tool output.
 */
export function CursorCloudAgentRunsListCard({
  runs,
  truncated,
}: CursorCloudAgentRunsListCardProps) {
  const { t } = useTranslation();

  if (!runs.length) {
    return (
      <div className="my-1 px-0.5 text-[12px] text-neutral-600 dark:text-neutral-400">
        {t("apps.chats.toolCalls.listCursorCloudAgentRuns.empty")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5" data-cursor-agent-list-preview>
      {truncated ? (
        <p className="px-0.5 text-[10px] text-amber-800 dark:text-amber-200">
          {t("apps.chats.toolCalls.listCursorCloudAgentRuns.truncatedHint")}
        </p>
      ) : null}
      {runs.map((run) => (
        <CursorAgentRunSummaryCard
          key={run.runId}
          run={run}
          enableLiveStatus
        />
      ))}
    </div>
  );
}
