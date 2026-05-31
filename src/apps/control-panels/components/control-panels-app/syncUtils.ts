export type SyncAuditStatus = {
  lastUploadedAt: string | null;
  lastFetchedAt?: string | null;
  lastAppliedRemoteAt: string | null;
  isUploading?: boolean;
  isDownloading?: boolean;
};

export function formatRelativeTime(
  timestamp: string | null,
  t: (key: string, opts?: Record<string, unknown>) => string
): string | null {
  if (!timestamp) return null;
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return t("apps.control-panels.autoSync.justNow");
  if (minutes < 60)
    return t("apps.control-panels.autoSync.minutesAgo", { count: minutes });
  if (hours < 24)
    return t("apps.control-panels.autoSync.hoursAgo", { count: hours });
  return t("apps.control-panels.autoSync.daysAgo", { count: days });
}

function getFetchedSyncTime(status: SyncAuditStatus): string | null {
  return status.lastFetchedAt || status.lastAppliedRemoteAt;
}

export function formatSyncStatus(
  status: SyncAuditStatus,
  t: (key: string, opts?: Record<string, unknown>) => string
): string {
  const uploadedRelative = formatRelativeTime(status.lastUploadedAt, t);
  const fetchedRelative = formatRelativeTime(getFetchedSyncTime(status), t);
  const parts: string[] = [];

  if (status.isUploading) {
    parts.push(t("apps.control-panels.autoSync.uploading"));
  } else {
    parts.push(
      uploadedRelative
        ? t("apps.control-panels.autoSync.lastUploaded", {
            date: uploadedRelative,
          })
        : t("apps.control-panels.autoSync.neverUploaded")
    );
  }

  if (status.isDownloading) {
    parts.push(t("apps.control-panels.autoSync.fetching"));
  } else {
    parts.push(
      fetchedRelative
        ? t("apps.control-panels.autoSync.lastFetched", {
            date: fetchedRelative,
          })
        : t("apps.control-panels.autoSync.neverFetched")
    );
  }

  return parts.join(" · ");
}

export function getUsernameInitials(username: string): string {
  const base = username.replace(/^@+/, "").trim();
  if (!base) return "?";
  return base.slice(0, 2).toUpperCase();
}
