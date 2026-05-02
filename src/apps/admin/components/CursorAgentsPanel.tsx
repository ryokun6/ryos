import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { getAdminCursorAgentRuns } from "@/api/admin";
import { ApiRequestError } from "@/api/core";
import { ArrowsClockwise, Robot } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface AdminCursorAgentRunRow {
  runId: string;
  agentId: string;
  status: string;
  createdAt: number | null;
  updatedAt: number | null;
  promptPreview?: string;
  agentTitle?: string;
  modelId?: string;
  prUrl?: string;
  terminalStatus?: string;
  summaryPreview?: string;
  errorPreview?: string;
  isFollowup?: boolean;
  previousRunId?: string;
}

interface CursorAgentsResponse {
  runs: AdminCursorAgentRunRow[];
  truncated?: boolean;
  scanIncomplete?: boolean;
}

interface CursorAgentsPanelProps {
  formatRelativeTime: (timestamp: number) => string;
  refreshSignal?: number;
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "running") {
    return "bg-amber-100 text-amber-800";
  }
  if (s === "finished") {
    return "bg-green-100 text-green-700";
  }
  if (s === "error" || s === "failed" || s === "cancelled" || s === "canceled") {
    return "bg-red-100 text-red-700";
  }
  return "bg-neutral-100 text-neutral-600";
}

export function CursorAgentsPanel({
  formatRelativeTime,
  refreshSignal = 0,
}: CursorAgentsPanelProps) {
  const { t } = useTranslation();
  const { username, isAuthenticated } = useAuth();
  const [runs, setRuns] = useState<AdminCursorAgentRunRow[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [scanIncomplete, setScanIncomplete] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRuns = useCallback(async () => {
    if (!username || !isAuthenticated) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAdminCursorAgentRuns<CursorAgentsResponse>(80);
      setRuns(data.runs ?? []);
      setTruncated(!!data.truncated);
      setScanIncomplete(!!data.scanIncomplete);
    } catch (err) {
      const message =
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("apps.admin.cursorAgents.loadFailed", "Could not load runs");
      setError(message);
      setRuns([]);
    } finally {
      setIsLoading(false);
    }
  }, [username, isAuthenticated, t]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns, refreshSignal]);

  const handleRefreshClick = () => {
    fetchRuns();
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 font-geneva-12">
        <ActivityIndicator size={24} />
        <span className="text-[11px] text-neutral-500">
          {t("apps.admin.cursorAgents.loading", "Loading Cursor agent runs…")}
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3 px-4 text-center font-geneva-12">
        <p className="text-[12px] text-red-600">{error}</p>
        <Button variant="outline" size="sm" onClick={handleRefreshClick} className="h-8 text-[11px]">
          <ArrowsClockwise className="h-3.5 w-3.5 mr-1" weight="bold" />
          {t("apps.admin.cursorAgents.retry", "Retry")}
        </Button>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-neutral-400 font-geneva-12 px-6 text-center gap-2">
        <Robot className="h-9 w-9 opacity-50" weight="bold" />
        <p className="text-[12px] font-medium text-neutral-500">
          {t("apps.admin.cursorAgents.emptyTitle", "No Cursor agent runs in Redis")}
        </p>
        <p className="text-[11px] max-w-sm text-neutral-400">
          {t(
            "apps.admin.cursorAgents.emptyHint",
            "Runs appear here when the repo agent tool starts a Cursor Cloud job (async mode with Redis). Data expires after about 24 hours."
          )}
        </p>
        <Button variant="ghost" size="sm" onClick={handleRefreshClick} className="h-7 text-[11px] mt-1">
          <ArrowsClockwise className="h-3 w-3 mr-1" weight="bold" />
          {t("apps.admin.cursorAgents.refresh", "Refresh")}
        </Button>
      </div>
    );
  }

  return (
    <div className="font-geneva-12">
      <div className="flex items-center justify-end px-2 py-1 border-b border-black/10">
        <Button variant="ghost" size="sm" onClick={handleRefreshClick} className="h-7 text-[11px]">
          <ArrowsClockwise className="h-3.5 w-3.5 mr-1" weight="bold" />
          {t("apps.admin.cursorAgents.refresh", "Refresh")}
        </Button>
      </div>
      {(truncated || scanIncomplete) && (
        <p className="text-[10px] text-amber-700 bg-amber-50 px-3 py-1 border-b border-amber-100">
          {scanIncomplete && !truncated
            ? t(
                "apps.admin.cursorAgents.scanIncompleteHint",
                "Redis key scan stopped early; raise the limit or try again."
              )
            : t(
                "apps.admin.cursorAgents.truncatedHint",
                "List may be truncated (scan cap or row limit)."
              )}
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow className="text-[10px] border-none font-normal">
            <TableHead className="font-normal bg-gray-100/50 h-[28px] w-[72px]">
              {t("apps.admin.cursorAgents.colStatus", "Status")}
            </TableHead>
            <TableHead className="font-normal bg-gray-100/50 h-[28px]">
              {t("apps.admin.cursorAgents.colRun", "Run / agent")}
            </TableHead>
            <TableHead className="font-normal bg-gray-100/50 h-[28px] whitespace-nowrap">
              {t("apps.admin.cursorAgents.colModel", "Model")}
            </TableHead>
            <TableHead className="font-normal bg-gray-100/50 h-[28px]">
              {t("apps.admin.cursorAgents.colTask", "Task")}
            </TableHead>
            <TableHead className="font-normal bg-gray-100/50 h-[28px] whitespace-nowrap">
              {t("apps.admin.cursorAgents.colUpdated", "Updated")}
            </TableHead>
            <TableHead className="font-normal bg-gray-100/50 h-[28px] w-16">
              {t("apps.admin.cursorAgents.colLink", "Link")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="text-[11px]">
          {runs.map((run) => {
            const summaryLine =
              run.summaryPreview ||
              run.errorPreview ||
              run.promptPreview ||
              "—";
            const updatedTs = run.updatedAt ?? run.createdAt ?? 0;
            const createdTs = run.createdAt ?? 0;

            return (
              <TableRow
                key={run.runId}
                className={cn(
                  "border-none odd:bg-gray-200/50",
                  run.status === "running" && "bg-amber-50/60 odd:bg-amber-50/70"
                )}
              >
                <TableCell className="align-top py-2">
                  <span
                    className={cn(
                      "inline-flex px-1.5 py-0.5 rounded text-[9px] font-medium capitalize",
                      statusBadgeClass(run.status)
                    )}
                  >
                    {run.status}
                  </span>
                </TableCell>
                <TableCell className="align-top py-2 max-w-[140px]">
                  <div className="truncate font-mono text-[10px]" title={run.runId}>
                    {run.runId}
                  </div>
                  {run.agentId ? (
                    <div className="truncate text-[10px] text-neutral-500 mt-0.5" title={run.agentId}>
                      {run.agentId}
                    </div>
                  ) : (
                    <div className="text-[10px] text-neutral-400 mt-0.5">—</div>
                  )}
                  {run.isFollowup && run.previousRunId ? (
                    <div className="text-[9px] text-neutral-400 mt-0.5 truncate">
                      {t("apps.admin.cursorAgents.followupFrom", {
                        id: `${run.previousRunId.slice(0, 12)}…`,
                      })}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="align-top py-2 whitespace-nowrap text-[10px] text-neutral-600">
                  {run.modelId ?? "—"}
                </TableCell>
                <TableCell className="align-top py-2 max-w-[220px]">
                  {run.agentTitle ? (
                    <div className="text-[11px] font-medium truncate" title={run.agentTitle}>
                      {run.agentTitle}
                    </div>
                  ) : null}
                  <div className="text-[10px] text-neutral-600 line-clamp-2" title={summaryLine}>
                    {summaryLine}
                  </div>
                </TableCell>
                <TableCell
                  className="align-top py-2 whitespace-nowrap text-[10px] text-neutral-500"
                  title={
                    updatedTs
                      ? new Date(updatedTs).toISOString()
                      : createdTs
                        ? new Date(createdTs).toISOString()
                        : undefined
                  }
                >
                  {updatedTs ? formatRelativeTime(updatedTs) : "—"}
                  {createdTs && createdTs !== updatedTs ? (
                    <div className="text-[9px] text-neutral-400">
                      {t("apps.admin.cursorAgents.startedLine", {
                        time: formatRelativeTime(createdTs),
                      })}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="align-top py-2">
                  {run.prUrl ? (
                    <a
                      href={run.prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-blue-600 hover:underline"
                    >
                      {t("apps.admin.cursorAgents.openPr", "PR")}
                    </a>
                  ) : (
                    <span className="text-[10px] text-neutral-300">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
