import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowsClockwise,
  CaretRight,
  Database,
  DownloadSimple,
  FolderSimple,
  House,
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
import { LEGACY_REDIS_SCAN_PATTERNS } from "@/shared/redisKeys";
import {
  adminGhostIconBtnClass,
  adminLoadMoreBtnClass,
  adminDetailHeaderClass,
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
  dryRun: boolean;
  scanned: number;
  deleted: number;
  truncated: boolean;
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

// How many keys each SCAN page requests. SCAN COUNT is a hint, so the actual
// returned batch varies, but a larger value pulls noticeably more per request.
const REDIS_BROWSER_PAGE_COUNT = 500;

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
  const [migrationPattern, setMigrationPattern] = useState<string>(
    LEGACY_REDIS_SCAN_PATTERNS[0]
  );
  const [migrationStatus, setMigrationStatus] = useState<RedisMigrationStatusResponse | null>(null);
  const [isLoadingMigrationStatus, setIsLoadingMigrationStatus] = useState(false);
  const [isBackfillingMigration, setIsBackfillingMigration] = useState(false);
  const [deleteLegacyCandidate, setDeleteLegacyCandidate] = useState<string | null>(null);
  const [isDeletingLegacy, setIsDeletingLegacy] = useState(false);
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
  const selectedMigrationStatus = migrationStatus?.patterns.find(
    (item) => item.pattern === migrationPattern
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

  const handleLoadMigrationStatus = async () => {
    setIsLoadingMigrationStatus(true);
    try {
      const status =
        await getAdminRedisKeyMigrationStatus<RedisMigrationStatusResponse>({ limit: 100 });
      setMigrationStatus(status);
      toast.success(
        t("apps.admin.redis.migration.statusReady", {
          count: status.totalLegacyKeys,
          defaultValue: `Found ${status.totalLegacyKeys} sampled legacy Redis keys`,
        })
      );
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

  const handleBackfillMigration = async (dryRun: boolean) => {
    setIsBackfillingMigration(true);
    try {
      const result = await backfillAdminRedisKeyScheme<RedisBackfillResponse>({
        pattern: migrationPattern,
        limit: 100,
        dryRun,
      });
      toast.success(
        dryRun
          ? t("apps.admin.redis.migration.dryRunComplete", {
              scanned: result.scanned,
              planned: result.planned,
              defaultValue: `Dry run scanned ${result.scanned}; ${result.planned} keys can be copied`,
            })
          : t("apps.admin.redis.migration.backfillComplete", {
              copied: result.copied,
              skipped: result.skipped,
              defaultValue: `Backfilled ${result.copied}; skipped ${result.skipped}`,
            })
      );
      if (result.warnings.length > 0) {
        toast.info(result.warnings.slice(0, 2).join("\n"));
      }
      if (result.truncated) {
        toast.info(
          t(
            "apps.admin.redis.migration.batchTruncated",
            "Batch limit reached; run the action again for the next batch.",
          )
        );
      }
      await handleLoadMigrationStatus();
      refreshScope();
    } catch (error) {
      console.error("Failed to backfill Redis key scheme:", error);
      toast.error(
        t("apps.admin.redis.migration.errors.backfill", "Failed to backfill Redis keys")
      );
    } finally {
      setIsBackfillingMigration(false);
    }
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
    setIsDeletingLegacy(true);
    try {
      const result = await deleteAdminLegacyRedisKeys<DeleteLegacyRedisKeysResponse>({
        pattern: deleteLegacyCandidate,
        limit: 100,
        dryRun: false,
      });
      toast.success(
        t("apps.admin.redis.migration.deleteComplete", {
          deleted: result.deleted,
          defaultValue: `Deleted ${result.deleted} legacy Redis keys`,
        })
      );
      if (result.truncated) {
        toast.info(
          t(
            "apps.admin.redis.migration.deleteTruncated",
            "Batch limit reached; run delete again after reviewing the next batch.",
          )
        );
      }
      setDeleteLegacyCandidate(null);
      await handleLoadMigrationStatus();
      refreshScope();
    } catch (error) {
      console.error("Failed to delete legacy Redis keys:", error);
      toast.error(
        t("apps.admin.redis.migration.errors.delete", "Failed to delete legacy Redis keys")
      );
    } finally {
      setIsDeletingLegacy(false);
    }
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
          "flex shrink-0 flex-wrap items-center gap-2 border-b border-os-separator px-2 py-1.5 text-[11px]",
        )}
      >
        <span className={cn(adminSectionLabelClass, "mr-1")}>
          {t("apps.admin.redis.migration.label", "Migration")}
        </span>
        <select
          value={migrationPattern}
          onChange={(event) => setMigrationPattern(event.target.value)}
          className="h-7 min-w-[190px] rounded border border-os-separator bg-os-window px-2 font-os-mono text-[11px] text-os-text-primary"
          aria-label={t("apps.admin.redis.migration.pattern", "Legacy Redis pattern")}
        >
          {LEGACY_REDIS_SCAN_PATTERNS.map((legacyPattern) => (
            <option key={legacyPattern} value={legacyPattern}>
              {legacyPattern}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void handleLoadMigrationStatus()}
          disabled={isLoadingMigrationStatus}
          className="h-7 px-2 text-[11px]"
        >
          {isLoadingMigrationStatus
            ? t("apps.admin.redis.loading", "Loading...")
            : t("apps.admin.redis.migration.scan", "Scan legacy")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void handleBackfillMigration(true)}
          disabled={isBackfillingMigration}
          className="h-7 px-2 text-[11px]"
        >
          {t("apps.admin.redis.migration.dryRun", "Dry run")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void handleBackfillMigration(false)}
          disabled={isBackfillingMigration}
          className="h-7 px-2 text-[11px]"
        >
          {isBackfillingMigration
            ? t("apps.admin.redis.loading", "Loading...")
            : t("apps.admin.redis.migration.backfill", "Backfill batch")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setDeleteLegacyCandidate(migrationPattern)}
          disabled={isDeletingLegacy}
          className="h-7 px-2 text-[11px] text-red-600 hover:text-red-700 os-mac-aqua-dark:text-red-300"
        >
          {isDeletingLegacy
            ? t("apps.admin.redis.loading", "Loading...")
            : t("apps.admin.redis.migration.deleteLegacy", "Delete legacy batch")}
        </Button>
        {selectedMigrationStatus ? (
          <span className="font-os-mono text-[10px] text-os-text-secondary">
            {selectedMigrationStatus.count}
            {selectedMigrationStatus.truncated ? "+" : ""}{" "}
            {t("apps.admin.redis.migration.keysSampled", "sampled")}
          </span>
        ) : null}
      </div>

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
        isOpen={deleteLegacyCandidate !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteLegacyCandidate(null);
        }}
        onConfirm={handleDeleteLegacyConfirm}
        title={t("apps.admin.redis.migration.deleteTitle", "Delete legacy Redis keys?")}
        description={t("apps.admin.redis.migration.deleteDescription", {
          pattern: deleteLegacyCandidate,
          defaultValue: `Delete up to 100 Redis keys matching "${deleteLegacyCandidate}"? Backfill first and repeat until the scan is clear.`,
        })}
      />
    </div>
  );
}
