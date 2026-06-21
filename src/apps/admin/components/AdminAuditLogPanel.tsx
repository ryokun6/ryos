import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { getAdminAuditLog } from "@/api/admin";
import { ApiRequestError } from "@/api/core";
import { ArrowsClockwise } from "@phosphor-icons/react";
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
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useAdminDashboardStore } from "@/stores/useAdminDashboardStore";
import { formatAdminRelativeTime } from "../utils/adminTime";
import {
  adminTableHeadClass,
  adminTableRowClass,
  adminToolbarClass,
} from "../utils/adminStyles";

interface AdminAuditEntry {
  id: string;
  ts: number;
  actor: string;
  action: string;
  target?: string;
  details?: Record<string, unknown>;
  ip?: string;
}

interface AuditLogResponse {
  entries: AdminAuditEntry[];
}

function summarizeDetails(details?: Record<string, unknown>): string {
  if (!details) return "";
  try {
    return Object.entries(details)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join(", ");
  } catch {
    return "";
  }
}

export function AdminAuditLogPanel() {
  const { t } = useTranslation();
  const { username, isAuthenticated } = useAuth();
  const { isMacOSTheme, isWindowsTheme } = useThemeFlags();
  const setAuditLogCount = useAdminDashboardStore((s) => s.setAuditLogCount);

  const [entries, setEntries] = useState<AdminAuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    if (!username || !isAuthenticated) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAdminAuditLog<AuditLogResponse>(200);
      const list = data.entries ?? [];
      setEntries(list);
      setAuditLogCount(list.length);
    } catch (err) {
      const message =
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("apps.admin.auditLog.loadFailed", "Could not load audit log");
      setError(message);
      setEntries([]);
      setAuditLogCount(null);
    } finally {
      setIsLoading(false);
    }
  }, [username, isAuthenticated, t, setAuditLogCount]);

  useEffect(() => {
    void fetchEntries();
  }, [fetchEntries]);

  useEffect(() => {
    return () => setAuditLogCount(null);
  }, [setAuditLogCount]);

  const toolbar = (
    <div className="shrink-0">
      <div
        className={cn(
          adminToolbarClass,
          "flex items-center justify-between gap-2 border-b px-2 py-1.5",
          isWindowsTheme
            ? "border-[#919b9c]"
            : isMacOSTheme
              ? "border-black/10"
              : "border-black/20"
        )}
      >
        <span className="text-[11px] text-os-text-secondary">
          {t("apps.admin.auditLog.title", "Audit Log")}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void fetchEntries()}
          disabled={isLoading}
          className="size-7 shrink-0 p-0"
          aria-label={t("apps.admin.auditLog.refresh", "Refresh")}
          title={t("apps.admin.auditLog.refresh", "Refresh")}
        >
          {isLoading ? (
            <ActivityIndicator size={14} />
          ) : (
            <ArrowsClockwise size={14} weight="bold" />
          )}
        </Button>
      </div>
    </div>
  );

  const panelShellClass =
    "font-geneva-12 flex h-full min-h-0 flex-1 flex-col overflow-hidden";

  if (isLoading && entries.length === 0) {
    return (
      <div className={panelShellClass}>
        {toolbar}
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <ActivityIndicator size={24} />
          <span className="text-[11px] text-neutral-500">
            {t("apps.admin.auditLog.loading", "Loading audit log…")}
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
            onClick={() => void fetchEntries()}
            className="h-8 text-[11px]"
          >
            <ArrowsClockwise className="size-3.5 mr-1" weight="bold" />
            {t("apps.admin.auditLog.retry", "Retry")}
          </Button>
        </div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className={panelShellClass}>
        {toolbar}
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <span className="text-[11px] text-neutral-500">
            {t("apps.admin.auditLog.empty", "No admin actions recorded yet")}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={panelShellClass}>
      {toolbar}
      <div className="min-h-0 flex-1 overflow-auto">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="text-[10px] border-none font-normal">
              <TableHead className={cn(adminTableHeadClass, "h-[28px] w-[22%]")}>
                {t("apps.admin.auditLog.action", "Action")}
              </TableHead>
              <TableHead className={cn(adminTableHeadClass, "h-[28px] w-[28%]")}>
                {t("apps.admin.auditLog.target", "Target")}
              </TableHead>
              <TableHead className={cn(adminTableHeadClass, "h-[28px]")}>
                {t("apps.admin.auditLog.details", "Details")}
              </TableHead>
              <TableHead
                className={cn(
                  adminTableHeadClass,
                  "h-[28px] w-[16%] whitespace-nowrap"
                )}
              >
                {t("apps.admin.auditLog.time", "Time")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="text-[11px]">
            {entries.map((entry) => {
              const detailText = summarizeDetails(entry.details);
              return (
                <TableRow
                  key={entry.id}
                  className={cn(adminTableRowClass, "cursor-default align-top")}
                >
                  <TableCell className="py-1.5 font-medium truncate" title={entry.action}>
                    {entry.action}
                  </TableCell>
                  <TableCell
                    className="py-1.5 truncate text-neutral-700 os-mac-aqua-dark:text-neutral-300"
                    title={entry.target || ""}
                  >
                    {entry.target || "—"}
                  </TableCell>
                  <TableCell
                    className="py-1.5 text-neutral-600 os-mac-aqua-dark:text-neutral-400"
                    title={detailText}
                  >
                    <span className="line-clamp-2">{detailText || "—"}</span>
                  </TableCell>
                  <TableCell
                    className="py-1.5 whitespace-nowrap text-neutral-600 os-mac-aqua-dark:text-neutral-400"
                    title={new Date(entry.ts).toLocaleString()}
                  >
                    {formatAdminRelativeTime(entry.ts, t)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
