import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStickToBottom } from "use-stick-to-bottom";
import {
  ArrowsClockwise,
  ArrowsLeftRight,
  CaretRight,
  Database,
  DownloadSimple,
  Eye,
  FolderSimple,
  House,
  MagnifyingGlass,
  Stop,
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
  backfillAdminRedisKeyScheme,
  deleteAdminRedisKey,
  deleteAdminLegacyRedisKeys,
  getAdminRedisBackup,
  getAdminRedisKey,
  getAdminRedisKeyMigrationStatus,
  getAdminRedisKeys,
} from "@/api/admin";
import { cn } from "@/lib/utils";
import {
  adminAquaIconButtonClass,
  AQUA_ICON_BUTTON_ICON_CLASS,
} from "@/lib/aquaIconButton";
import { useAdminDashboardStore } from "@/stores/useAdminDashboardStore";
import { LEGACY_REDIS_SCAN_PATTERNS } from "@/shared/redisKeys";
import {
  adminGhostIconBtnClass,
  adminLoadMoreBtnClass,
  adminDetailHeaderClass,
  adminSectionHeaderClass,
  adminSectionLabelClass,
  adminSurfaceClass,
  adminTableHeadClass,
  adminTableRowClass,
  adminToolbarClass,
} from "../../utils/adminStyles";
import {
  buildRedisBreadcrumbs,
  buildRedisKeyTree,
  deriveRedisPrefix,
  mergeFoldersWithKnownPrefixes,
} from "../../utils/redisKeyTree";

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

interface RedisMigrationPatternStatus {
  pattern: string;
  count: number;
  sampleKeys: string[];
  truncated: boolean;
}

interface RedisMigrationStatusResponse {
  totalLegacyKeys: number;
  truncated: boolean;
  patterns: RedisMigrationPatternStatus[];
}

interface RedisBackfillResponse {
  pattern: string;
  cursor: string;
  dryRun: boolean;
  scanned: number;
  planned: number;
  copied: number;
  skipped: number;
  truncated: boolean;
  warnings: string[];
}

interface DeleteLegacyRedisKeysResponse {
  pattern: string;
  cursor: string;
  dryRun: boolean;
  scanned: number;
  deleted: number;
  truncated: boolean;
  keys: string[];
}

type RedisMigrationRunKind = "dry-run" | "backfill" | "delete";

interface RedisMigrationLogEntry {
  id: number;
  message: string;
  tone: "info" | "success" | "warning" | "error";
}

export interface AdminRedisBrowserViewProps {
  t: TFunction;
}

const MIGRATION_BATCH_LIMIT = 100;
const DELETE_LEGACY_BATCH_LIMIT = 1000;
// Analytics hash metrics fan out into many hincrby ops per key, so even with
// server-side pipelining a large page is the heaviest backfill work. Use a
// smaller page for these patterns so each batch comfortably fits the server's
// maxDuration; the cursor-resumable loop still walks the whole keyspace.
const ANALYTICS_HASH_BATCH_LIMIT = 25;
const ANALYTICS_HASH_PATTERNS = new Set<string>([
  "analytics:aiu:*",
  "analytics:daily:*",
  "analytics:ep:*",
  "analytics:st:*",
]);

function migrationBatchLimitFor(pattern: string): number {
  return ANALYTICS_HASH_PATTERNS.has(pattern)
    ? ANALYTICS_HASH_BATCH_LIMIT
    : MIGRATION_BATCH_LIMIT;
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

function formatDeletedKeySample(keys: string[]): string {
  if (keys.length === 0) return "no keys";
  if (keys.length === 1) return `key ${keys[0]}`;
  return `keys ${keys[0]} ... ${keys[keys.length - 1]}`;
}

// How many keys each SCAN page requests. SCAN COUNT is a hint, so the actual
// returned batch varies, but a larger value pulls noticeably more per request.
const REDIS_BROWSER_PAGE_COUNT = 500;

const DELETE_LEGACY_BUTTON_STYLE = { color: "#000", textShadow: "none" } as const;

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
  const [migrationStatus, setMigrationStatus] = useState<RedisMigrationStatusResponse | null>(null);
  const [isLoadingMigrationStatus, setIsLoadingMigrationStatus] = useState(false);
  const [activeMigrationRun, setActiveMigrationRun] = useState<RedisMigrationRunKind | null>(null);
  const [deleteLegacyCandidate, setDeleteLegacyCandidate] = useState(false);
  const [migrationLog, setMigrationLog] = useState<RedisMigrationLogEntry[]>([]);
  const [isMigrationExpanded, setIsMigrationExpanded] = useState(false);
  // Drive the migration-log auto-scroll via the hook so the cap (max-h-28) and
  // overflow live directly on the scroll element. The <StickToBottom> component
  // scrolls an inner height:100% div, which can't resolve against a parent that
  // only has a max-height, so it never pinned to the bottom in this layout.
  const {
    scrollRef: migrationLogScrollRef,
    contentRef: migrationLogContentRef,
  } = useStickToBottom({ resize: "smooth", initial: "instant" });
  const migrationStopRequestedRef = useRef(false);
  const migrationLogIdRef = useRef(0);
  // Cache fetched key documents so reopening a key (or returning to it after
  // navigating) does not re-hit Redis. Cleared on fresh scans / refresh.
  const documentCacheRef = useRef<Map<string, RedisKeyDocument>>(new Map());
  // Cache the loaded key summaries (+ continuation cursor) per scan scope so
  // re-entering a prefix you've already browsed is instant and never re-scans
  // the keyspace. Cleared on Refresh and after a delete.
  const keysCacheRef = useRef<Map<string, { keys: RedisKeySummary[]; cursor: string }>>(
    new Map()
  );

  // The applied glob is the single source of truth for the server SCAN. The
  // drill-down prefix (tree position + breadcrumbs) is derived from it so that
  // applying e.g. `chat:users:*` lands inside the `chat:users:` folder.
  const scanPattern = appliedPattern;
  const prefix = useMemo(() => deriveRedisPrefix(appliedPattern), [appliedPattern]);

  const loadKeys = useCallback(
    async (targetPattern: string, nextCursor: string = "0") => {
      setIsLoadingKeys(true);
      try {
        const data = await getAdminRedisKeys<RedisKeysResponse>({
          pattern: targetPattern,
          cursor: nextCursor,
          count: REDIS_BROWSER_PAGE_COUNT,
        });
        setCursor(data.cursor);
        setKeys((prev) => {
          const next = nextCursor === "0" ? data.keys : [...prev, ...data.keys];
          keysCacheRef.current.set(targetPattern, { keys: next, cursor: data.cursor });
          return next;
        });
      } catch (error) {
        console.error("Failed to load Redis keys:", error);
        toast.error(t("apps.admin.redis.errors.loadKeys", "Failed to load Redis keys"));
      } finally {
        setIsLoadingKeys(false);
      }
    },
    [t]
  );

  // Run a fresh scoped scan whenever the effective pattern changes (root
  // pattern submit or drilling in/out of a prefix). The document cache is
  // intentionally preserved across navigation (keyed by full key name). We also
  // mirror the effective pattern back into the input so it tracks drill-down.
  useEffect(() => {
    setPattern(scanPattern);
    setSelectedKey(null);
    setSelectedDocument(null);
    const cached = keysCacheRef.current.get(scanPattern);
    if (cached) {
      setKeys(cached.keys);
      setCursor(cached.cursor);
      return;
    }
    setKeys([]);
    setCursor("0");
    void loadKeys(scanPattern, "0");
  }, [scanPattern, loadKeys]);

  const refreshScope = useCallback(() => {
    documentCacheRef.current.clear();
    keysCacheRef.current.clear();
    setKeys([]);
    setCursor("0");
    setSelectedKey(null);
    setSelectedDocument(null);
    void loadKeys(scanPattern, "0");
  }, [scanPattern, loadKeys]);

  const goToPrefix = useCallback((nextPrefix: string) => {
    setAppliedPattern(nextPrefix ? `${nextPrefix}*` : "*");
  }, []);

  const loadKeyDocument = useCallback(
    async (key: string) => {
      setSelectedKey(key);
      const cached = documentCacheRef.current.get(key);
      if (cached) {
        setSelectedDocument(cached);
        setIsLoadingDocument(false);
        return;
      }
      setIsLoadingDocument(true);
      try {
        const data = await getAdminRedisKey<RedisKeyDocument>(key);
        documentCacheRef.current.set(key, data);
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

  const isRoot = prefix === "";
  const treeLevel = useMemo(() => buildRedisKeyTree(keys, prefix), [keys, prefix]);
  // At root, surface the curated known namespaces even before their keys load.
  const rootFolders = useMemo(
    () => mergeFoldersWithKnownPrefixes(treeLevel.folders),
    [treeLevel.folders]
  );
  const breadcrumbs = useMemo(() => buildRedisBreadcrumbs(prefix), [prefix]);
  const visibleLeaves = treeLevel.leaves;
  const visibleFolders = isRoot ? rootFolders : treeLevel.folders;
  const hasVisibleRows = visibleFolders.length > 0 || visibleLeaves.length > 0;
  const isMigrationRunning = activeMigrationRun !== null;

  // Surface the number of loaded keys to the shared admin store so the status
  // bar can show "Redis Browser — N keys" without prop-drilling. Reset on
  // unmount so the count doesn't linger after leaving the Redis section.
  const setRedisKeyCount = useAdminDashboardStore((s) => s.setRedisKeyCount);
  useEffect(() => {
    setRedisKeyCount(keys.length);
  }, [keys.length, setRedisKeyCount]);
  useEffect(() => {
    return () => setRedisKeyCount(null);
  }, [setRedisKeyCount]);

  useEffect(() => {
    if (isMigrationRunning) {
      setIsMigrationExpanded(true);
    }
  }, [isMigrationRunning]);

  const appendMigrationLog = useCallback(
    (message: string, tone: RedisMigrationLogEntry["tone"] = "info") => {
      migrationLogIdRef.current += 1;
      const timestamp = new Date().toLocaleTimeString();
      setMigrationLog((entries) => [
        ...entries.slice(-199),
        {
          id: migrationLogIdRef.current,
          message: `[${timestamp}] ${message}`,
          tone,
        },
      ]);
    },
    []
  );

  const handlePatternSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAppliedPattern(pattern.trim() || "*");
  };

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      const backup = await getAdminRedisBackup<RedisBackupDocument>({
        pattern: scanPattern,
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

  const handleLoadMigrationStatus = async (showToast: boolean = true) => {
    setIsLoadingMigrationStatus(true);
    try {
      const status =
        await getAdminRedisKeyMigrationStatus<RedisMigrationStatusResponse>({ limit: 100 });
      setMigrationStatus(status);
      appendMigrationLog(
        `Status scan found ${status.totalLegacyKeys}${status.truncated ? "+" : ""} sampled legacy keys across ${status.patterns.length} patterns`,
        status.totalLegacyKeys > 0 ? "info" : "success"
      );
      if (showToast) {
        toast.success(
          t("apps.admin.redis.migration.statusReady", {
            count: status.totalLegacyKeys,
            defaultValue: `Found ${status.totalLegacyKeys} sampled legacy Redis keys`,
          })
        );
      }
      if (status.truncated) {
        toast.info(
          t(
            "apps.admin.redis.migration.statusTruncated",
            "Some legacy patterns hit the preview limit; run batches until clear.",
          )
        );
      }
    } catch (error) {
      console.error("Failed to load Redis migration status:", error);
      toast.error(
        t("apps.admin.redis.migration.errors.status", "Failed to load migration status")
      );
    } finally {
      setIsLoadingMigrationStatus(false);
    }
  };

  const runContinuousMigration = async (kind: RedisMigrationRunKind) => {
    if (activeMigrationRun) return;
    migrationStopRequestedRef.current = false;
    setActiveMigrationRun(kind);
    const totals = {
      batches: 0,
      copied: 0,
      deleted: 0,
      planned: 0,
      scanned: 0,
      skipped: 0,
      warnings: 0,
    };
    const runLabel =
      kind === "delete" ? "Delete" : kind === "backfill" ? "Backfill" : "Dry run";
    appendMigrationLog(
      `${runLabel} started for all legacy patterns`,
      "info"
    );
    try {
      for (const legacyPattern of LEGACY_REDIS_SCAN_PATTERNS) {
        if (migrationStopRequestedRef.current) break;
        let cursor = "0";
        let batchNumber = 0;
        let continuePattern = true;
        let lastDeleteSignature: string | null = null;
        let repeatedDeleteSignatureCount = 0;
        while (continuePattern && !migrationStopRequestedRef.current) {
          batchNumber += 1;
          if (kind === "delete") {
            const result = await deleteAdminLegacyRedisKeys<DeleteLegacyRedisKeysResponse>({
              pattern: legacyPattern,
              limit: DELETE_LEGACY_BATCH_LIMIT,
              dryRun: false,
              cursor: "0",
            });
            totals.batches += 1;
            totals.scanned += result.scanned;
            totals.deleted += result.deleted;
            appendMigrationLog(
              `pattern ${legacyPattern} delete batch ${batchNumber}: scanned ${result.scanned}, deleted ${result.deleted} (${formatDeletedKeySample(result.keys)})${result.truncated ? ", more pending" : ""}`,
              result.deleted > 0 ? "success" : "info"
            );
            const deleteSignature = result.keys.join("\u001f");
            if (result.deleted > 0 && deleteSignature) {
              if (deleteSignature === lastDeleteSignature) {
                repeatedDeleteSignatureCount += 1;
              } else {
                lastDeleteSignature = deleteSignature;
                repeatedDeleteSignatureCount = 1;
              }
              if (repeatedDeleteSignatureCount >= 2) {
                appendMigrationLog(
                  `pattern ${legacyPattern} stopped after the same deleted batch reappeared (${formatDeletedKeySample(result.keys)}); a running service may be recreating it`,
                  "warning"
                );
                continuePattern = false;
              }
            }
            if (result.scanned === 0 || result.deleted === 0) {
              continuePattern = false;
            }
            continue;
          }

          const result = await backfillAdminRedisKeyScheme<RedisBackfillResponse>({
            pattern: legacyPattern,
            limit: migrationBatchLimitFor(legacyPattern),
            dryRun: kind === "dry-run",
            cursor,
          });
          totals.batches += 1;
          totals.scanned += result.scanned;
          totals.planned += result.planned;
          totals.copied += result.copied;
          totals.skipped += result.skipped;
          totals.warnings += result.warnings.length;
          appendMigrationLog(
            `${legacyPattern} ${kind === "dry-run" ? "dry-run" : "backfill"} batch ${batchNumber}: scanned ${result.scanned}, planned ${result.planned}, copied ${result.copied}, skipped ${result.skipped}, cursor ${result.cursor}`,
            result.warnings.length > 0 ? "warning" : result.copied > 0 ? "success" : "info"
          );
          for (const warning of result.warnings.slice(0, 3)) {
            appendMigrationLog(`${legacyPattern}: ${warning}`, "warning");
          }
          cursor = result.cursor;
          continuePattern = cursor !== "0";
        }
      }
      if (migrationStopRequestedRef.current) {
        appendMigrationLog("Stopped by user request", "warning");
      } else {
        appendMigrationLog(`${runLabel} completed for all legacy patterns`, "success");
      }
      appendMigrationLog(
        kind === "delete"
          ? `${runLabel} totals: ${totals.batches} batches, ${totals.scanned} scanned, ${totals.deleted} deleted`
          : `${runLabel} totals: ${totals.batches} batches, ${totals.scanned} scanned, ${totals.planned} planned, ${totals.copied} copied, ${totals.skipped} skipped, ${totals.warnings} warnings`,
        migrationStopRequestedRef.current ? "warning" : "success"
      );
      await handleLoadMigrationStatus(false);
      refreshScope();
    } catch (error) {
      console.error("Redis migration run failed:", error);
      appendMigrationLog(
        error instanceof Error ? error.message : "Redis migration run failed",
        "error"
      );
      toast.error(
        t("apps.admin.redis.migration.errors.run", "Redis migration run failed")
      );
    } finally {
      setActiveMigrationRun(null);
      migrationStopRequestedRef.current = false;
    }
  };

  const handleStopMigration = () => {
    migrationStopRequestedRef.current = true;
    appendMigrationLog("Stop requested; waiting for current batch to finish", "warning");
  };

  const handleDeleteConfirm = async () => {
    if (!deleteCandidate) return;
    setIsDeleting(true);
    try {
      const result = await deleteAdminRedisKey<DeleteRedisKeyResponse>(deleteCandidate);
      documentCacheRef.current.delete(deleteCandidate);
      // A deleted key may live in other cached scopes; drop the list cache so
      // navigation reflects the removal everywhere (scope reloads below).
      keysCacheRef.current.clear();
      if (result.deletedCount > 0) {
        toast.success(t("apps.admin.redis.messages.deleted", "Redis key deleted"));
      } else {
        toast.info(t("apps.admin.redis.messages.alreadyDeleted", "Redis key was already gone"));
      }
      setDeleteCandidate(null);
      setSelectedKey(null);
      setSelectedDocument(null);
      await loadKeys(scanPattern, "0");
    } catch (error) {
      console.error("Failed to delete Redis key:", error);
      toast.error(t("apps.admin.redis.errors.delete", "Failed to delete Redis key"));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteLegacyConfirm = async () => {
    if (!deleteLegacyCandidate) return;
    setDeleteLegacyCandidate(false);
    await runContinuousMigration("delete");
  };

  return (
    <div className="flex h-full min-h-0 flex-col font-geneva-12">
      <form
        onSubmit={handlePatternSubmit}
        className={cn(
          adminToolbarClass,
          "flex shrink-0 flex-wrap items-center gap-2 border-b border-os-separator px-2 py-1.5",
        )}
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
          onClick={refreshScope}
          disabled={isLoadingKeys}
          className="size-7 p-0"
          title={t("apps.admin.redis.refresh", "Refresh Redis keys")}
          aria-label={t("apps.admin.redis.refresh", "Refresh Redis keys")}
        >
          {isLoadingKeys ? <ActivityIndicator size={14} /> : <ArrowsClockwise size={14} weight="bold" />}
        </Button>
      </form>

      <div
        className={cn(
          adminToolbarClass,
          "flex h-8 shrink-0 items-center gap-2 border-b border-os-separator px-2",
        )}
      >
        <nav
          aria-label={t("apps.admin.redis.breadcrumbs", "Key path")}
          className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto text-[11px]"
        >
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <span key={crumb.prefix} className="flex shrink-0 items-center gap-0.5">
                  {index > 0 && (
                    <CaretRight size={10} weight="bold" className="opacity-40" />
                  )}
                  <button
                    type="button"
                    onClick={() => goToPrefix(crumb.prefix)}
                    className={cn(
                      "flex items-center gap-1 rounded px-1 py-0.5 font-os-mono",
                      isLast
                        ? "text-os-text-primary"
                        : "text-os-text-secondary hover:text-os-text-primary hover:underline",
                    )}
                    title={crumb.prefix || t("apps.admin.redis.root", "root")}
                  >
                    {index === 0 ? (
                      <House size={11} weight="bold" />
                    ) : (
                      crumb.label
                    )}
                  </button>
                </span>
              );
            })}
        </nav>
      </div>

      <div
        className={cn(
          "grid min-h-0 flex-1 gap-0",
          selectedKey
            ? "md:grid-cols-[minmax(0,1fr)_minmax(280px,42%)]"
            : "grid-cols-1",
        )}
      >
        <div className="min-h-0 min-w-0 overflow-auto">
          {!hasVisibleRows && !isLoadingKeys ? (
            <div className="flex flex-col items-center justify-center px-3 py-12 text-os-text-disabled">
              <Database className="mb-2 size-8 opacity-50" weight="bold" />
              <span className="text-[11px]">
                {t("apps.admin.redis.noKeys", "No Redis keys match this pattern")}
              </span>
            </div>
          ) : (
            <>
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
                  {visibleFolders.map((folder) => (
                    <TableRow
                      key={`dir:${folder.prefix}`}
                      className={cn(adminTableRowClass, "cursor-pointer")}
                      onClick={() => goToPrefix(folder.prefix)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          goToPrefix(folder.prefix);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <TableCell colSpan={3} className="py-2">
                        <div className="flex items-center gap-2">
                          <FolderSimple size={14} weight="regular" className="shrink-0 opacity-70" />
                          <span className="min-w-0 flex-1 truncate font-os-mono" title={folder.prefix}>
                            {folder.segment}
                          </span>
                          {/* Always reserve the badge box so the row height
                              stays constant once counts load in. */}
                          <span
                            className={cn(
                              "shrink-0 rounded bg-black/10 px-1.5 py-0.5 font-os-mono text-[9px] os-mac-aqua-dark:bg-white/10",
                              typeof folder.count !== "number" && "invisible",
                            )}
                          >
                            {typeof folder.count === "number" ? folder.count : "0"}
                          </span>
                          <CaretRight size={11} weight="bold" className="shrink-0 opacity-40" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {visibleLeaves.map((item) => (
                    <TableRow
                      key={item.key}
                      data-state={selectedKey === item.key ? "selected" : undefined}
                      className={cn(
                        adminTableRowClass,
                        "cursor-pointer",
                        // Selected row uses the solid accent swatch
                        // (`--os-accent-color`), falling back to the theme's
                        // selection color when no accent is set ("System").
                        selectedKey === item.key &&
                          "bg-[var(--os-accent-color,var(--os-color-selection-bg))] text-os-selection-text hover:bg-[var(--os-accent-color,var(--os-color-selection-bg))]",
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
                          {item.label}
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
                    onClick={() => void loadKeys(scanPattern, cursor)}
                    disabled={isLoadingKeys}
                    className={adminLoadMoreBtnClass}
                  >
                    {isLoadingKeys
                      ? t("apps.admin.redis.loading", "Loading...")
                      : t("apps.admin.redis.loadMore", "Load more")}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {selectedKey ? (
          <aside className={cn("flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-l border-os-separator", adminSurfaceClass)}>
            <div className={cn(adminDetailHeaderClass, "justify-between gap-2")}>
              <span>{t("apps.admin.redis.detail", "Key Detail")}</span>
              {selectedDocument && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteCandidate(selectedDocument.key)}
                  disabled={isDeleting}
                  className={cn("size-6 p-0", adminGhostIconBtnClass)}
                  title={t("apps.admin.redis.delete", "Delete Redis key")}
                  aria-label={t("apps.admin.redis.delete", "Delete Redis key")}
                >
                  {isDeleting ? <ActivityIndicator size={13} /> : <Trash size={13} weight="bold" />}
                </Button>
              )}
            </div>
            {isLoadingDocument ? (
              <div className="flex h-full min-h-[220px] items-center justify-center">
                <ActivityIndicator size={18} />
              </div>
            ) : selectedDocument ? (
              <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
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
          </aside>
        ) : null}
      </div>

      <div
        className={cn(
          adminToolbarClass,
          "shrink-0 border-t border-os-separator text-[11px]",
        )}
      >
        <button
          type="button"
          onClick={() => setIsMigrationExpanded((expanded) => !expanded)}
          aria-expanded={isMigrationExpanded}
          className={cn(
            "flex w-full items-center gap-2 px-2 py-1.5 text-left transition-colors",
            "hover:bg-black/5 os-mac-aqua-dark:hover:bg-white/8",
          )}
        >
          <CaretRight
            size={12}
            weight="bold"
            className={cn(
              "shrink-0 opacity-60 transition-transform",
              isMigrationExpanded && "rotate-90",
            )}
          />
          <span className={cn(adminSectionHeaderClass, "shrink-0")}>
            {t("apps.admin.redis.migration.label", "Migration")}
          </span>
          {migrationStatus ? (
            <span className="font-os-mono text-[10px] text-os-text-secondary">
              · {migrationStatus.totalLegacyKeys}
              {migrationStatus.truncated ? "+" : ""}{" "}
              {t("apps.admin.redis.migration.keysSampled", "legacy sampled")}
            </span>
          ) : null}
          {isMigrationRunning ? (
            <span className="ml-auto flex items-center gap-1.5 text-[10px] text-os-text-secondary">
              <ActivityIndicator size={12} />
              {activeMigrationRun === "delete"
                ? t("apps.admin.redis.migration.runningDelete", "Deleting…")
                : activeMigrationRun === "backfill"
                  ? t("apps.admin.redis.migration.runningBackfill", "Backfilling…")
                  : t("apps.admin.redis.migration.runningDryRun", "Dry run…")}
            </span>
          ) : null}
        </button>

        {isMigrationExpanded ? (
          <div className="space-y-2 border-t border-os-separator/60 px-2 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void handleLoadMigrationStatus()}
                disabled={isLoadingMigrationStatus || isMigrationRunning}
                className={adminAquaIconButtonClass("secondary")}
              >
                {isLoadingMigrationStatus ? (
                  <ActivityIndicator size={12} />
                ) : (
                  <MagnifyingGlass className={AQUA_ICON_BUTTON_ICON_CLASS} weight="bold" />
                )}
                <span>
                  {isLoadingMigrationStatus
                    ? t("apps.admin.redis.loading", "Loading...")
                    : t("apps.admin.redis.migration.scan", "Scan legacy")}
                </span>
              </button>
              <span
                className="hidden h-5 w-px shrink-0 bg-os-separator sm:block"
                aria-hidden
              />
              <button
                type="button"
                onClick={() => void runContinuousMigration("dry-run")}
                disabled={isMigrationRunning}
                className={adminAquaIconButtonClass("secondary")}
              >
                {activeMigrationRun === "dry-run" ? (
                  <ActivityIndicator size={12} />
                ) : (
                  <Eye className={AQUA_ICON_BUTTON_ICON_CLASS} weight="bold" />
                )}
                <span>{t("apps.admin.redis.migration.dryRun", "Dry run")}</span>
              </button>
              <button
                type="button"
                onClick={() => void runContinuousMigration("backfill")}
                disabled={isMigrationRunning}
                className={adminAquaIconButtonClass("secondary")}
              >
                {activeMigrationRun === "backfill" ? (
                  <ActivityIndicator size={12} />
                ) : (
                  <ArrowsLeftRight className={AQUA_ICON_BUTTON_ICON_CLASS} weight="bold" />
                )}
                <span>
                  {activeMigrationRun === "backfill"
                    ? t("apps.admin.redis.loading", "Loading...")
                    : t("apps.admin.redis.migration.backfill", "Backfill all")}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setDeleteLegacyCandidate(true)}
                disabled={isMigrationRunning}
                className={adminAquaIconButtonClass("orange")}
                style={DELETE_LEGACY_BUTTON_STYLE}
              >
                {activeMigrationRun === "delete" ? (
                  <ActivityIndicator size={12} />
                ) : (
                  <Trash
                    className={AQUA_ICON_BUTTON_ICON_CLASS}
                    style={DELETE_LEGACY_BUTTON_STYLE}
                    weight="bold"
                  />
                )}
                <span style={DELETE_LEGACY_BUTTON_STYLE}>
                  {activeMigrationRun === "delete"
                    ? t("apps.admin.redis.loading", "Loading...")
                    : t("apps.admin.redis.migration.deleteLegacy", "Delete all legacy")}
                </span>
              </button>
              <button
                type="button"
                onClick={handleStopMigration}
                disabled={!isMigrationRunning}
                className={adminAquaIconButtonClass("secondary")}
              >
                <Stop className={AQUA_ICON_BUTTON_ICON_CLASS} weight="bold" />
                <span>{t("apps.admin.redis.migration.stop", "Stop")}</span>
              </button>
            </div>

            {migrationLog.length > 0 ? (
              <div
                ref={migrationLogScrollRef}
                className="max-h-28 overflow-y-auto rounded border border-os-separator bg-black/5 font-os-mono text-[10px] leading-relaxed os-mac-aqua-dark:bg-white/10"
              >
                <div ref={migrationLogContentRef} className="px-2 py-1.5">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className={adminSectionLabelClass}>
                      {t("apps.admin.redis.migration.log", "Migration log")}
                    </span>
                    {!isMigrationRunning ? (
                      <button
                        type="button"
                        onClick={() => setMigrationLog([])}
                        className={adminAquaIconButtonClass("secondary", "sm")}
                      >
                        <span>{t("apps.admin.redis.migration.clearLog", "Clear")}</span>
                      </button>
                    ) : null}
                  </div>
                  {migrationLog.map((entry) => (
                    <div
                      key={entry.id}
                      className={cn(
                        entry.tone === "success" &&
                          "text-green-700 os-mac-aqua-dark:text-green-300",
                        entry.tone === "warning" &&
                          "text-yellow-700 os-mac-aqua-dark:text-yellow-300",
                        entry.tone === "error" &&
                          "text-red-700 os-mac-aqua-dark:text-red-300",
                      )}
                    >
                      {entry.message}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
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
      <ConfirmDialog
        isOpen={deleteLegacyCandidate}
        onOpenChange={(open) => {
          if (!open) setDeleteLegacyCandidate(false);
        }}
        onConfirm={handleDeleteLegacyConfirm}
        title={t("apps.admin.redis.migration.deleteTitle", "Delete legacy Redis keys?")}
        description={t("apps.admin.redis.migration.deleteDescription", {
          defaultValue:
            "Delete all registered legacy Redis keys in continuous batches? Backfill first; this keeps going until every legacy pattern is clear or Stop is clicked.",
        })}
      />
    </div>
  );
}
