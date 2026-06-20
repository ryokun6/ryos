import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { requestCloudSyncCheck } from "@/utils/cloudSyncEvents";
import type { TabStyleConfig } from "@/utils/tabStyles";
import { AUTO_SYNC_ITEM_ICONS } from "./constants";
import { SyncDomainRow } from "./SyncDomainRow";
import { SyncSectionTitle } from "./SyncSectionTitle";
import { formatRelativeTime, formatSyncStatus, type SyncAuditStatus } from "./syncUtils";

export type DotMacPaneContentProps = {
  t: (key: string, opts?: Record<string, unknown>) => string;
  tabStyles: TabStyleConfig;
  username: string | null;
  promptSetUsername: () => void;
  autoSyncEnabled: boolean;
  setAutoSyncEnabled: (enabled: boolean) => void;
  isAutoSyncChecking: boolean;
  autoSyncLastCheckedAt: string | null;
  autoSyncLastError: string | null;
  autoSyncDomainStatus: Record<string, SyncAuditStatus>;
  syncFiles: boolean;
  syncSettings: boolean;
  syncCalendar: boolean;
  syncContacts: boolean;
  syncMaps: boolean;
  syncSongs: boolean;
  syncVideos: boolean;
  syncTv: boolean;
  syncStickies: boolean;
  setSyncFiles: (enabled: boolean) => void;
  setSyncSettings: (enabled: boolean) => void;
  setSyncCalendar: (enabled: boolean) => void;
  setSyncContacts: (enabled: boolean) => void;
  setSyncMaps: (enabled: boolean) => void;
  setSyncSongs: (enabled: boolean) => void;
  setSyncVideos: (enabled: boolean) => void;
  setSyncTv: (enabled: boolean) => void;
  setSyncStickies: (enabled: boolean) => void;
  isMacOSTheme: boolean;
  isCloudForceSyncing: boolean;
  isCloudBackingUp: boolean;
  isCloudRestoring: boolean;
  isCloudForceUploading: boolean;
  isCloudForceDownloading: boolean;
  setIsConfirmForceUploadOpen: (open: boolean) => void;
  setIsConfirmForceDownloadOpen: (open: boolean) => void;
  handleCloudBackup: () => void;
  setIsConfirmCloudRestoreOpen: (open: boolean) => void;
  cloudSyncStatus: {
    hasBackup: boolean;
    metadata: {
      timestamp: string;
      totalSize: number;
      version?: number;
      createdAt?: string;
    } | null;
  } | null;
  cloudProgress: { phase: string; percent: number } | null;
  isCloudStatusLoading: boolean;
  CLOUD_BACKUP_MAX_SIZE: number;
};

type DotMacPaneTab = "sync" | "backup";

export function DotMacPaneContent({
  t,
  tabStyles,
  username,
  promptSetUsername,
  autoSyncEnabled,
  setAutoSyncEnabled,
  isAutoSyncChecking,
  autoSyncLastCheckedAt,
  autoSyncLastError,
  autoSyncDomainStatus,
  syncFiles,
  syncSettings,
  syncCalendar,
  syncContacts,
  syncMaps,
  syncSongs,
  syncVideos,
  syncTv,
  syncStickies,
  setSyncFiles,
  setSyncSettings,
  setSyncCalendar,
  setSyncContacts,
  setSyncMaps,
  setSyncSongs,
  setSyncVideos,
  setSyncTv,
  setSyncStickies,
  isMacOSTheme,
  isCloudForceSyncing,
  isCloudBackingUp,
  isCloudRestoring,
  isCloudForceUploading,
  isCloudForceDownloading,
  setIsConfirmForceUploadOpen,
  setIsConfirmForceDownloadOpen,
  handleCloudBackup,
  setIsConfirmCloudRestoreOpen,
  cloudSyncStatus,
  cloudProgress,
  isCloudStatusLoading,
  CLOUD_BACKUP_MAX_SIZE,
}: DotMacPaneContentProps) {
  const [dotMacTab, setDotMacTab] = useState<DotMacPaneTab>("sync");

  return (
    <div className="control-panels-pref-form control-panels-pref-form-tabbed h-full overflow-y-auto">
      <div className="control-panels-pref-tabbed">
        <div
          role="tablist"
          className="aqua-tab-bar control-panels-pref-tab-bar"
          aria-label={t("apps.control-panels.panes.dotMac")}
        >
          <button
            type="button"
            role="tab"
            className="aqua-tab"
            data-state={dotMacTab === "sync" ? "active" : "inactive"}
            aria-selected={dotMacTab === "sync"}
            onClick={() => setDotMacTab("sync")}
          >
            {t("apps.control-panels.cloudSyncTabs.sync")}
          </button>
          <button
            type="button"
            role="tab"
            className="aqua-tab"
            data-state={dotMacTab === "backup" ? "active" : "inactive"}
            aria-selected={dotMacTab === "backup"}
            onClick={() => setDotMacTab("backup")}
          >
            {t("apps.control-panels.cloudSyncTabs.backup")}
          </button>
        </div>
        <div className="control-panels-pref-well">
          <div
            role="tabpanel"
            className="control-panels-pref-tab-panel space-y-3"
            hidden={dotMacTab !== "sync"}
            aria-hidden={dotMacTab !== "sync"}
          >
            {username ? (
              <div className="flex items-center justify-between gap-4">
                <SyncSectionTitle
                  title={t("apps.control-panels.autoSync.title")}
                  subtitle={
                    autoSyncEnabled
                      ? isAutoSyncChecking
                        ? t("apps.control-panels.autoSync.checking")
                        : formatRelativeTime(autoSyncLastCheckedAt, t)
                          ? t("apps.control-panels.autoSync.lastChecked", {
                              date: formatRelativeTime(autoSyncLastCheckedAt, t),
                            })
                          : t("apps.control-panels.autoSync.waiting")
                      : t("apps.control-panels.autoSync.description")
                  }
                />
                <Switch
                  checked={autoSyncEnabled}
                  onCheckedChange={setAutoSyncEnabled}
                  className="data-[state=checked]:bg-[#000000]"
                />
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <SyncSectionTitle
                  title={t("apps.control-panels.autoSync.title")}
                  subtitle={t("apps.control-panels.autoSync.description")}
                />
                <Button variant="default" onClick={promptSetUsername} className="h-7">
                  {t("apps.control-panels.login")}
                </Button>
              </div>
            )}

            {username && autoSyncEnabled && (
              <>
                <hr className="mt-2 mb-4 border-t" style={tabStyles.separatorStyle} />
                <div className="space-y-3">
                  <SyncDomainRow
                    appId={AUTO_SYNC_ITEM_ICONS.files}
                    label={t("apps.control-panels.autoSync.files")}
                    status={formatSyncStatus(autoSyncDomainStatus.files, t)}
                    checked={syncFiles}
                    onCheckedChange={setSyncFiles}
                  />
                  <SyncDomainRow
                    appId={AUTO_SYNC_ITEM_ICONS.settings}
                    label={t("apps.control-panels.autoSync.settings")}
                    status={formatSyncStatus(autoSyncDomainStatus.settings, t)}
                    checked={syncSettings}
                    onCheckedChange={setSyncSettings}
                  />
                  <SyncDomainRow
                    appId={AUTO_SYNC_ITEM_ICONS.calendar}
                    label={t("apps.control-panels.autoSync.calendar")}
                    status={formatSyncStatus(autoSyncDomainStatus.calendar, t)}
                    checked={syncCalendar}
                    onCheckedChange={setSyncCalendar}
                  />
                  <SyncDomainRow
                    appId={AUTO_SYNC_ITEM_ICONS.contacts}
                    label={t("apps.control-panels.autoSync.contacts")}
                    status={formatSyncStatus(autoSyncDomainStatus.contacts, t)}
                    checked={syncContacts}
                    onCheckedChange={setSyncContacts}
                  />
                  <SyncDomainRow
                    appId={AUTO_SYNC_ITEM_ICONS.maps}
                    label={t("apps.control-panels.autoSync.maps")}
                    status={formatSyncStatus(autoSyncDomainStatus.maps, t)}
                    checked={syncMaps}
                    onCheckedChange={setSyncMaps}
                  />
                  <SyncDomainRow
                    appId={AUTO_SYNC_ITEM_ICONS.songs}
                    label={t("apps.control-panels.autoSync.songs")}
                    status={formatSyncStatus(autoSyncDomainStatus.songs, t)}
                    checked={syncSongs}
                    onCheckedChange={setSyncSongs}
                  />
                  <SyncDomainRow
                    appId={AUTO_SYNC_ITEM_ICONS.videos}
                    label={t("apps.control-panels.autoSync.videos")}
                    status={formatSyncStatus(autoSyncDomainStatus.videos, t)}
                    checked={syncVideos}
                    onCheckedChange={setSyncVideos}
                  />
                  <SyncDomainRow
                    appId={AUTO_SYNC_ITEM_ICONS.tv}
                    label={t("apps.control-panels.autoSync.tvChannels")}
                    status={formatSyncStatus(autoSyncDomainStatus.tv, t)}
                    checked={syncTv}
                    onCheckedChange={setSyncTv}
                  />
                  <SyncDomainRow
                    appId={AUTO_SYNC_ITEM_ICONS.stickies}
                    label={t("apps.control-panels.autoSync.stickies")}
                    status={formatSyncStatus(autoSyncDomainStatus.stickies, t)}
                    checked={syncStickies}
                    onCheckedChange={setSyncStickies}
                  />
                </div>

                {autoSyncLastError && (
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 flex-1 text-[11px] text-red-700 font-geneva-12">
                      {t("apps.control-panels.autoSync.error", {
                        error: autoSyncLastError,
                      })}
                    </p>
                    <Button
                      variant="retro"
                      size="sm"
                      onClick={requestCloudSyncCheck}
                      disabled={isAutoSyncChecking}
                      className="h-7 shrink-0"
                    >
                      {isAutoSyncChecking
                        ? t("apps.control-panels.autoSync.checking")
                        : t("common.retry", { defaultValue: "Retry" })}
                    </Button>
                  </div>
                )}
              </>
            )}

            <hr className="mt-2 mb-4 border-t" style={tabStyles.separatorStyle} />
            <div
              className={cn(
                "space-y-2",
                !username && "opacity-50 pointer-events-none select-none"
              )}
            >
              <div className="flex gap-2">
                <Button
                  variant="retro"
                  onClick={() => setIsConfirmForceUploadOpen(true)}
                  disabled={isCloudForceSyncing || isCloudBackingUp || isCloudRestoring}
                  tabIndex={!username ? -1 : undefined}
                  className="flex-1"
                >
                  {isCloudForceUploading
                    ? t("apps.control-panels.cloudSync.forceUploading")
                    : t("apps.control-panels.cloudSync.forceUpload")}
                </Button>
                <Button
                  variant="retro"
                  onClick={() => setIsConfirmForceDownloadOpen(true)}
                  disabled={isCloudForceSyncing || isCloudBackingUp || isCloudRestoring}
                  tabIndex={!username ? -1 : undefined}
                  className="flex-1"
                >
                  {isCloudForceDownloading
                    ? t("apps.control-panels.cloudSync.forceDownloading")
                    : t("apps.control-panels.cloudSync.forceDownload")}
                </Button>
              </div>
              <p className="text-[11px] text-neutral-600 font-geneva-12">
                {t("apps.control-panels.cloudSync.forceSyncDescription")}
              </p>
            </div>
          </div>
          <div
            role="tabpanel"
            className={cn(
              "control-panels-pref-tab-panel space-y-2",
              !username && "opacity-50 pointer-events-none select-none"
            )}
            hidden={dotMacTab !== "backup"}
            aria-hidden={dotMacTab !== "backup"}
          >
            <div className="flex gap-2">
              <Button
                variant="retro"
                onClick={handleCloudBackup}
                disabled={isCloudForceSyncing || isCloudBackingUp || isCloudRestoring}
                tabIndex={!username ? -1 : undefined}
                className="flex-1"
              >
                {isCloudBackingUp
                  ? t("apps.control-panels.cloudSync.backingUp")
                  : t("apps.control-panels.cloudSync.backupToCloud")}
              </Button>
              <Button
                variant="retro"
                onClick={() => setIsConfirmCloudRestoreOpen(true)}
                disabled={
                  isCloudForceSyncing ||
                  isCloudBackingUp ||
                  isCloudRestoring ||
                  !cloudSyncStatus?.hasBackup
                }
                tabIndex={!username ? -1 : undefined}
                className="flex-1"
              >
                {isCloudRestoring
                  ? t("apps.control-panels.cloudSync.restoring")
                  : t("apps.control-panels.cloudSync.restoreFromCloud")}
              </Button>
            </div>
            {cloudProgress && (
              <div className="space-y-1">
                {isMacOSTheme ? (
                  <div className="aqua-progress w-full h-[14px]">
                    <div
                      className="aqua-progress-fill transition-all duration-300 ease-out"
                      style={{ width: `${cloudProgress.percent}%` }}
                    />
                  </div>
                ) : (
                  <div className="w-full h-3 bg-neutral-200 rounded-sm overflow-hidden border border-neutral-300">
                    <div
                      className="h-full bg-neutral-600 transition-all duration-300 ease-out"
                      style={{ width: `${cloudProgress.percent}%` }}
                    />
                  </div>
                )}
                <p className="text-[11px] text-neutral-600 font-geneva-12">
                  {cloudProgress.phase}
                  {cloudProgress.percent > 0 &&
                    cloudProgress.percent < 100 &&
                    ` (${cloudProgress.percent}%)`}
                </p>
              </div>
            )}
            {!cloudProgress && (
              <p className="text-[11px] text-neutral-600 font-geneva-12">
                {!username
                  ? t("apps.control-panels.cloudSync.description", {
                      limit: (CLOUD_BACKUP_MAX_SIZE / (1024 * 1024)).toFixed(0),
                    })
                  : isCloudStatusLoading
                    ? t("apps.control-panels.cloudSync.checking")
                    : cloudSyncStatus?.hasBackup && cloudSyncStatus.metadata
                      ? t("apps.control-panels.cloudSync.lastBackup", {
                          date: new Date(
                            cloudSyncStatus.metadata.timestamp
                          ).toLocaleString(),
                          size: (
                            cloudSyncStatus.metadata.totalSize /
                            (1024 * 1024)
                          ).toFixed(1),
                        })
                      : t("apps.control-panels.cloudSync.description", {
                          limit: (CLOUD_BACKUP_MAX_SIZE / (1024 * 1024)).toFixed(0),
                        })}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
