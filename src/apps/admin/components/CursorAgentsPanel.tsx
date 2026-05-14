import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import {
  getAdminCursorAgentRuns,
  postAdminStartCursorAgent,
} from "@/api/admin";
import { ApiRequestError } from "@/api/core";
import { ArrowsClockwise, Robot } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { CursorRepoAgentChatCard } from "@/components/shared/CursorRepoAgentChatCard";

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
  nextRunId?: string;
  /** Same shape as API — https://cursor.com/agents/{agentId} */
  agentDashboardUrl?: string;
}

interface CursorAgentsResponse {
  runs: AdminCursorAgentRunRow[];
  totalCount?: number;
  truncated?: boolean;
  scanIncomplete?: boolean;
}

interface CursorAgentsPanelProps {
  refreshSignal?: number;
  onTotalCountChange?: (count: number) => void;
}

function cursorAgentPageUrl(agentId: string): string {
  return `https://cursor.com/agents/${encodeURIComponent(agentId)}`;
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

function CursorAgentsToolbar({
  prompt,
  onPromptChange,
  onSubmit,
  isSubmitting,
  submitError,
  onRefresh,
  refreshDisabled,
}: {
  prompt: string;
  onPromptChange: (value: string) => void;
  onSubmit: () => void;
  isSubmitting: boolean;
  submitError: string | null;
  onRefresh: () => void;
  refreshDisabled?: boolean;
}) {
  const { t } = useTranslation();
  const { isMacOSTheme: isMacOSXTheme, isWindowsTheme: isXpTheme } =
    useThemeFlags();

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !prompt.trim()) return;
    onSubmit();
  };

  return (
    <div className="shrink-0">
      <form
        className={cn(
          "flex items-center gap-2 border-b px-2 py-1.5",
          isXpTheme
            ? "border-[#919b9c]"
            : isMacOSXTheme
              ? "border-black/10"
              : "border-black/20"
        )}
        style={
          isMacOSXTheme
            ? { backgroundImage: "var(--os-pinstripe-window)" }
            : undefined
        }
        onSubmit={handleFormSubmit}
      >
        <Input
          type="text"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          placeholder={t(
            "apps.admin.cursorAgents.newAgentPlaceholder",
            "Send to Cursor"
          )}
          disabled={isSubmitting}
          className="h-7 min-w-0 flex-1 text-[12px]"
          aria-label={t(
            "apps.admin.cursorAgents.newAgentAria",
            "New Cursor agent prompt"
          )}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={refreshDisabled || isSubmitting}
          className="size-7 shrink-0 p-0"
          aria-label={t("apps.admin.cursorAgents.refresh", "Refresh")}
          title={t("apps.admin.cursorAgents.refresh", "Refresh")}
        >
          {isSubmitting ? (
            <ActivityIndicator size={14} />
          ) : (
            <ArrowsClockwise size={14} weight="bold" />
          )}
        </Button>
      </form>
      {submitError ? (
        <p className="border-b border-black/10 px-2 pb-1.5 text-[10px] text-red-600">
          {submitError}
        </p>
      ) : null}
    </div>
  );
}

export function CursorAgentsPanel({
  refreshSignal = 0,
  onTotalCountChange,
}: CursorAgentsPanelProps) {
  const { t } = useTranslation();
  const { username, isAuthenticated } = useAuth();
  const [runs, setRuns] = useState<AdminCursorAgentRunRow[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [scanIncomplete, setScanIncomplete] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newPrompt, setNewPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const selectedRun = runs.find((r) => r.runId === selectedRunId) ?? null;
  const selectedHeaderTitle =
    selectedRun?.agentTitle?.trim() ||
    t("apps.chats.toolCalls.cursorCloudAgent.panelTitle");

  const fetchRuns = useCallback(async () => {
    if (!username || !isAuthenticated) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAdminCursorAgentRuns<CursorAgentsResponse>(80);
      setRuns(data.runs ?? []);
      setTruncated(!!data.truncated);
      setScanIncomplete(!!data.scanIncomplete);
      onTotalCountChange?.(data.totalCount ?? data.runs?.length ?? 0);
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
  }, [username, isAuthenticated, t, onTotalCountChange]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns, refreshSignal]);

  const handleRefreshClick = () => {
    void fetchRuns();
  };

  const handleStartAgent = async () => {
    const prompt = newPrompt.trim();
    if (!prompt || isSubmitting) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await postAdminStartCursorAgent<{
        async?: boolean;
        runId?: string;
        agentId?: string;
        agentDashboardUrl?: string;
        success?: boolean;
        error?: string;
        message?: string;
      }>({ prompt });

      if (result.async && result.runId) {
        setNewPrompt("");
        setSelectedRunId(result.runId);
        await fetchRuns();
        return;
      }
      if (result.success) {
        setNewPrompt("");
        await fetchRuns();
        return;
      }
      setSubmitError(
        result.error ??
          t("apps.admin.cursorAgents.startFailed", "Could not start agent")
      );
    } catch (err) {
      const message =
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("apps.admin.cursorAgents.startFailed", "Could not start agent");
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toolbar = (
    <CursorAgentsToolbar
      prompt={newPrompt}
      onPromptChange={setNewPrompt}
      onSubmit={() => void handleStartAgent()}
      isSubmitting={isSubmitting}
      submitError={submitError}
      onRefresh={handleRefreshClick}
      refreshDisabled={isLoading}
    />
  );

  const panelShellClass =
    "font-geneva-12 flex h-full min-h-0 flex-1 flex-col overflow-hidden";

  if (isLoading) {
    return (
      <div className={panelShellClass}>
        {toolbar}
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <ActivityIndicator size={24} />
          <span className="text-[11px] text-neutral-500">
            {t("apps.admin.cursorAgents.loading", "Loading Cursor agent runs…")}
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={panelShellClass}>
        {toolbar}
        <div className="flex flex-col items-center justify-center py-12 gap-3 px-4 text-center">
          <p className="text-[12px] text-red-600">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshClick}
            className="h-8 text-[11px]"
          >
            <ArrowsClockwise className="size-3.5 mr-1" weight="bold" />
            {t("apps.admin.cursorAgents.retry", "Retry")}
          </Button>
        </div>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className={panelShellClass}>
        {toolbar}
        <div className="flex flex-col items-center justify-center py-16 text-neutral-400 px-6 text-center gap-2">
          <Robot className="size-9 opacity-50" weight="bold" />
          <p className="text-[12px] font-medium text-neutral-500">
            {t("apps.admin.cursorAgents.emptyTitle", "No Cursor agent runs in Redis")}
          </p>
          <p className="text-[11px] max-w-sm text-neutral-400">
            {t(
              "apps.admin.cursorAgents.emptyHint",
              "Runs appear here when the repo agent tool starts a Cursor Cloud job (async mode with Redis). Data expires after about 24 hours."
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={panelShellClass}>
      {toolbar}
      {(truncated || scanIncomplete) && (
        <p className="text-[10px] text-amber-700 bg-amber-50 px-3 py-1 border-b border-amber-100 shrink-0">
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
      <div
        className={cn(
          "flex-1 min-h-0 grid gap-0",
          selectedRunId
            ? "grid-cols-[minmax(0,1fr)_minmax(280px,42%)]"
            : "grid-cols-1"
        )}
      >
        <div className="min-h-0 min-w-0 overflow-auto">
      <Table>
        <TableBody className="text-[11px]">
          {runs.map((run) => {
            const summaryLine =
              run.summaryPreview ||
              run.errorPreview ||
              run.promptPreview ||
              "—";
            const taskTitle = run.agentTitle?.trim();
            const taskPrimary = taskTitle || summaryLine;
            const taskSecondary =
              taskTitle &&
              summaryLine !== "—" &&
              summaryLine !== taskTitle
                ? summaryLine
                : null;

            return (
              <TableRow
                key={run.runId}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedRunId(run.runId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedRunId(run.runId);
                  }
                }}
                className={cn(
                  "border-none odd:bg-gray-200/50 cursor-pointer",
                  run.status === "running" && "bg-amber-50/60 odd:bg-amber-50/70",
                  selectedRunId === run.runId &&
                    "bg-blue-100/80 odd:bg-blue-100/80"
                )}
              >
                <TableCell className="w-0 align-top py-2 pl-2 pr-1">
                  <span
                    className={cn(
                      "mt-[5px] inline-block size-2 shrink-0 rounded-full",
                      statusDotClass(run.status)
                    )}
                    title={run.status}
                    aria-label={run.status}
                  />
                </TableCell>
                <TableCell
                  className="align-top py-2 pl-2 pr-2 min-w-0"
                  title={[run.runId, run.agentId, summaryLine]
                    .filter(Boolean)
                    .join("\n")}
                >
                  <div className="text-[11px] font-medium truncate">{taskPrimary}</div>
                  {taskSecondary ? (
                    <div className="text-[10px] text-neutral-600 line-clamp-2 mt-0.5">
                      {taskSecondary}
                    </div>
                  ) : null}
                  {run.modelId || run.agentId || run.prUrl ? (
                    <div
                      className="text-[10px] text-neutral-500 mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0.5 min-w-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {run.modelId ? (
                        <span className="truncate">{run.modelId}</span>
                      ) : null}
                      {run.modelId && (run.agentId || run.prUrl) ? (
                        <span className="text-neutral-400" aria-hidden>
                          ·
                        </span>
                      ) : null}
                      {run.agentId ? (
                        <a
                          href={cursorAgentPageUrl(run.agentId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline shrink-0"
                        >
                          {t("apps.admin.cursorAgents.openAgent", "Agent")}
                        </a>
                      ) : null}
                      {run.agentId && run.prUrl ? (
                        <span className="text-neutral-400" aria-hidden>
                          ·
                        </span>
                      ) : null}
                      {run.prUrl ? (
                        <a
                          href={run.prUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline shrink-0"
                        >
                          {t("apps.admin.cursorAgents.openPr", "PR")}
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                  {run.isFollowup && run.previousRunId ? (
                    <div className="text-[9px] text-neutral-400 mt-0.5 truncate">
                      {t("apps.admin.cursorAgents.followupFrom", {
                        id: `${run.previousRunId.slice(0, 12)}…`,
                      })}
                    </div>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
        </div>
        {selectedRunId ? (
          <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-l border-black/10 bg-white">
            <CursorRepoAgentChatCard
              key={selectedRunId}
              runId={selectedRunId}
              headerTitle={selectedHeaderTitle}
              variant="panel"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
