import {
  formatRelativeTime as formatRelativeTimeShared,
  type RelativeTimeKeys,
} from "@/utils/formatRelativeTime";

export type SyncAuditStatus = {
  lastUploadedAt: string | null;
  lastFetchedAt?: string | null;
  lastAppliedRemoteAt: string | null;
  isUploading?: boolean;
  isDownloading?: boolean;
};

const AUTO_SYNC_TIME_KEYS: RelativeTimeKeys = {
  justNow: "apps.control-panels.autoSync.justNow",
  minutesAgo: "apps.control-panels.autoSync.minutesAgo",
  hoursAgo: "apps.control-panels.autoSync.hoursAgo",
  daysAgo: "apps.control-panels.autoSync.daysAgo",
};

export function formatRelativeTime(
  timestamp: string | null,
  t: (key: string, opts?: Record<string, unknown>) => string
): string | null {
  return formatRelativeTimeShared(timestamp, t, AUTO_SYNC_TIME_KEYS);
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
