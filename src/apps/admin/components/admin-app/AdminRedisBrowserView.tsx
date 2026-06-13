import { FormEvent, useCallback, useEffect, useState } from "react";
import {
  ArrowsClockwise,
  Database,
  DownloadSimple,
  MagnifyingGlass,
  Trash,
} from "@phosphor-icons/react";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  deleteAdminRedisKey,
  getAdminRedisBackup,
  getAdminRedisKey,
  getAdminRedisKeys,
} from "@/api/admin";
import { cn } from "@/lib/utils";
import {
  adminCardClass,
  adminCardHeaderClass,
  adminGhostIconBtnClass,
  adminLoadMoreBtnClass,
  adminSectionLabelClass,
  adminTableHeadClass,
  adminTableRowClass,
} from "../../utils/adminStyles";

interface RedisKeySummary {
  key: string;
  type: string;
  ttl: number | null;
}

interface RedisKeysResponse {
  keys: RedisKeySummary[];
  cursor: string;
  count: number;
}

interface RedisKeyDocument extends RedisKeySummary {
  value: unknown;
  length: number | null;
  truncated: boolean;
}

interface RedisBackupDocument {
  exportedAt: string;
  pattern: string;
  keyCount: number;
  truncated: boolean;
  keys: RedisKeyDocument[];
}

interface DeleteRedisKeyResponse {
  success: boolean;
  deletedCount: number;
}

export interface AdminRedisBrowserViewProps {
  t: TFunction;
}

function formatRedisTtl(ttl: number | null): string {
  if (ttl === null) return "TTL unknown";
  if (ttl === -2) return "missing";
  if (ttl === -1) return "no expiry";
  if (ttl < 60) return `${ttl}s`;
  if (ttl < 3600) return `${Math.round(ttl / 60)}m`;
  if (ttl < 86400) return `${Math.round(ttl / 3600)}h`;
  return `${Math.round(ttl / 86400)}d`;
}

function formatRedisValue(value: unknown): string {
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2);
}

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function AdminRedisBrowserView({ t }: AdminRedisBrowserViewProps) {
  const [pattern, setPattern] = useState("*");
  const [appliedPattern, setAppliedPattern] = useState("*");
  const [keys, setKeys] = useState<RedisKeySummary[]>([]);
  const [cursor, setCursor] = useState("0");
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<RedisKeyDocument | null>(null);
  const [isLoadingDocument, setIsLoadingDocument] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadKeys = useCallback(
    async (nextCursor: string = "0") => {
      setIsLoadingKeys(true);
      try {
        const data = await getAdminRedisKeys<RedisKeysResponse>({
          pattern: appliedPattern,
          cursor: nextCursor,
          count: 100,
        });
        setCursor(data.cursor);
        setKeys((prev) => (nextCursor === "0" ? data.keys : [...prev, ...data.keys]));
        if (nextCursor === "0") {
          setSelectedKey(null);
          setSelectedDocument(null);
        }
      } catch (error) {
        console.error("Failed to load Redis keys:", error);
        toast.error(t("apps.admin.redis.errors.loadKeys", "Failed to load Redis keys"));
      } finally {
        setIsLoadingKeys(false);
      }
    },
    [appliedPattern, t]
  );

  const loadKeyDocument = useCallback(
    async (key: string) => {
      setSelectedKey(key);
      setIsLoadingDocument(true);
      try {
        const data = await getAdminRedisKey<RedisKeyDocument>(key);
        setSelectedDocument(data);
      } catch (error) {
        console.error("Failed to load Redis key:", error);
        setSelectedDocument(null);
        toast.error(t("apps.admin.redis.errors.loadKey", "Failed to load Redis key"));
      } finally {
        setIsLoadingDocument(false);
      }
    },
    [t]
  );

  useEffect(() => {
    void loadKeys("0");
  }, [loadKeys]);

  const handlePatternSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedPattern(pattern.trim() || "*");
  };

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      const backup = await getAdminRedisBackup<RedisBackupDocument>({
        pattern: appliedPattern,
      });
      const date = new Date().toISOString().slice(0, 10);
      downloadJson(`ryos-redis-backup-${date}.json`, backup);
      toast.success(
        t("apps.admin.redis.messages.backupReady", {
          count: backup.keyCount,
          defaultValue: `Backed up ${backup.keyCount} Redis keys`,
        })
      );
      if (backup.truncated) {
        toast.info(
          t(
            "apps.admin.redis.messages.backupTruncated",
            "Backup reached the key limit; narrow the pattern for a full export",
          )
        );
      }
    } catch (error) {
      console.error("Failed to back up Redis keys:", error);
      toast.error(t("apps.admin.redis.errors.backup", "Failed to back up Redis keys"));
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteCandidate) return;
    setIsDeleting(true);
    try {
      const result = await deleteAdminRedisKey<DeleteRedisKeyResponse>(deleteCandidate);
      if (result.deletedCount > 0) {
        toast.success(t("apps.admin.redis.messages.deleted", "Redis key deleted"));
      } else {
        toast.info(t("apps.admin.redis.messages.alreadyDeleted", "Redis key was already gone"));
      }
      setDeleteCandidate(null);
      setSelectedKey(null);
      setSelectedDocument(null);
      await loadKeys("0");
    } catch (error) {
      console.error("Failed to delete Redis key:", error);
      toast.error(t("apps.admin.redis.errors.delete", "Failed to delete Redis key"));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex min-h-[360px] flex-col gap-3 p-3 font-geneva-12">
      <form
        onSubmit={handlePatternSubmit}
        className="flex flex-wrap items-center gap-2"
      >
        <SearchInput
          placeholder={t("apps.admin.redis.patternPlaceholder", "Redis pattern, e.g. chat:*")}
          value={pattern}
          onChange={setPattern}
          className="min-w-[220px] flex-1"
          inputClassName="h-7 text-[12px] font-os-mono"
          clearAriaLabel={t("apps.admin.search.clear", "Clear search")}
        />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className="size-7 p-0"
          title={t("apps.admin.redis.scan", "Scan")}
          aria-label={t("apps.admin.redis.scan", "Scan")}
        >
          <MagnifyingGlass size={14} weight="bold" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleBackup}
          disabled={isBackingUp || isLoadingKeys || keys.length === 0}
          className="size-7 p-0"
          title={t("apps.admin.redis.backup", "Backup")}
          aria-label={t("apps.admin.redis.backup", "Backup")}
        >
          {isBackingUp ? <ActivityIndicator size={13} /> : <DownloadSimple size={13} weight="bold" />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void loadKeys("0")}
          disabled={isLoadingKeys}
          className="size-7 p-0"
          title={t("apps.admin.redis.refresh", "Refresh Redis keys")}
          aria-label={t("apps.admin.redis.refresh", "Refresh Redis keys")}
        >
          {isLoadingKeys ? <ActivityIndicator size={14} /> : <ArrowsClockwise size={14} weight="bold" />}
        </Button>
      </form>

      <div className="grid min-h-[300px] gap-3 md:grid-cols-[minmax(220px,0.42fr)_minmax(0,1fr)]">
        <section className={cn(adminCardClass, "min-w-0")}>
          <div className={cn(adminCardHeaderClass, "flex items-center justify-between")}>
            <span>{t("apps.admin.redis.keys", "Keys")}</span>
            <span className="text-os-text-disabled">{keys.length}</span>
          </div>
          {keys.length === 0 && !isLoadingKeys ? (
            <div className="flex flex-col items-center justify-center px-3 py-12 text-os-text-disabled">
              <Database className="mb-2 size-8 opacity-50" weight="bold" />
              <span className="text-[11px]">
                {t("apps.admin.redis.noKeys", "No Redis keys match this pattern")}
              </span>
            </div>
          ) : (
            <div className="max-h-[520px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-none text-[10px] font-normal">
                    <TableHead className={cn(adminTableHeadClass, "h-[28px]")}>
                      {t("apps.admin.redis.key", "Key")}
                    </TableHead>
                    <TableHead className={cn(adminTableHeadClass, "h-[28px] w-16")}>
                      {t("apps.admin.redis.type", "Type")}
                    </TableHead>
                    <TableHead className={cn(adminTableHeadClass, "h-[28px] w-20")}>
                      {t("apps.admin.redis.ttl", "TTL")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-[11px]">
                  {keys.map((item) => (
                    <TableRow
                      key={item.key}
                      data-state={selectedKey === item.key ? "selected" : undefined}
                      className={cn(
                        adminTableRowClass,
                        "cursor-pointer",
                        selectedKey === item.key &&
                          "bg-os-selection-bg text-os-selection-text hover:bg-os-selection-bg",
                      )}
                      onClick={() => void loadKeyDocument(item.key)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          void loadKeyDocument(item.key);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <TableCell className="max-w-0 py-2">
                        <span className="block truncate font-os-mono" title={item.key}>
                          {item.key}
                        </span>
                      </TableCell>
                      <TableCell className="py-2">
                        <span className="rounded bg-black/10 px-1.5 py-0.5 font-os-mono text-[9px] uppercase os-mac-aqua-dark:bg-white/10">
                          {item.type}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-2 text-[10px] opacity-75">
                        {formatRedisTtl(item.ttl)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {cursor !== "0" && (
                <div className="flex justify-center py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void loadKeys(cursor)}
                    disabled={isLoadingKeys}
                    className={adminLoadMoreBtnClass}
                  >
                    {isLoadingKeys
                      ? t("apps.admin.redis.loading", "Loading...")
                      : t("apps.admin.redis.loadMore", "Load more")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>

        <section className={cn(adminCardClass, "min-w-0")}>
          <div className={cn(adminCardHeaderClass, "flex items-center justify-between gap-2")}>
            <span>{t("apps.admin.redis.detail", "Key Detail")}</span>
            {selectedDocument && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteCandidate(selectedDocument.key)}
                disabled={isDeleting}
                className={cn("size-6 p-0", adminGhostIconBtnClass)}
                title={t("apps.admin.redis.delete", "Delete Redis key")}
              >
                {isDeleting ? <ActivityIndicator size={13} /> : <Trash size={13} weight="bold" />}
              </Button>
            )}
          </div>
          {!selectedKey ? (
            <div className="flex h-full min-h-[220px] items-center justify-center px-3 text-center text-[11px] text-os-text-disabled">
              {t("apps.admin.redis.selectKey", "Select a Redis key to inspect its value")}
            </div>
          ) : isLoadingDocument ? (
            <div className="flex h-full min-h-[220px] items-center justify-center">
              <ActivityIndicator size={18} />
            </div>
          ) : selectedDocument ? (
            <div className="space-y-3 p-3">
              <div className="min-w-0 space-y-1">
                <div className={adminSectionLabelClass}>
                  {t("apps.admin.redis.key", "Key")}
                </div>
                <div className="break-all font-os-mono text-[12px]">{selectedDocument.key}</div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[11px]">
                <div>
                  <div className={adminSectionLabelClass}>{t("apps.admin.redis.type", "Type")}</div>
                  <div className="font-os-mono">{selectedDocument.type}</div>
                </div>
                <div>
                  <div className={adminSectionLabelClass}>{t("apps.admin.redis.ttl", "TTL")}</div>
                  <div>{formatRedisTtl(selectedDocument.ttl)}</div>
                </div>
                <div>
                  <div className={adminSectionLabelClass}>{t("apps.admin.redis.length", "Length")}</div>
                  <div>{selectedDocument.length ?? "-"}</div>
                </div>
              </div>
              {selectedDocument.truncated && (
                <div className="rounded border border-yellow-500/30 bg-yellow-500/10 px-2 py-1 text-[11px] text-yellow-800 os-mac-aqua-dark:text-yellow-200">
                  {t("apps.admin.redis.previewTruncated", "Preview is truncated; use Backup for the full value.")}
                </div>
              )}
              <pre className="max-h-[420px] overflow-auto rounded bg-black/5 p-2 font-os-mono text-[11px] leading-relaxed os-mac-aqua-dark:bg-white/10">
                {formatRedisValue(selectedDocument.value)}
              </pre>
            </div>
          ) : (
            <div className="flex h-full min-h-[220px] items-center justify-center px-3 text-center text-[11px] text-os-text-disabled">
              {t("apps.admin.redis.keyUnavailable", "Redis key is unavailable")}
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        isOpen={deleteCandidate !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteCandidate(null);
        }}
        onConfirm={handleDeleteConfirm}
        title={t("apps.admin.redis.deleteTitle", "Delete Redis key?")}
        description={t("apps.admin.redis.deleteDescription", {
          key: deleteCandidate,
          defaultValue: `Delete Redis key "${deleteCandidate}"? This cannot be undone.`,
        })}
      />
    </div>
  );
}
