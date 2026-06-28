import type { AdminSection } from "../../utils/navigationState";
import type { TFunction } from "i18next";

export type AdminImportStatusPhase =
  | "idle"
  | "reading-file"
  | "parsing-file"
  | "validating-data"
  | "preparing-songs"
  | "uploading-batches"
  | "waiting-rate-limit"
  | "refreshing-library"
  | "completed"
  | "failed";

/** Subset of hook import status used by import UI helpers */
export interface AdminImportStatus {
  phase: AdminImportStatusPhase;
  fileName: string | null;
  totalSongs: number;
  processedSongs: number;
  imported: number;
  updated: number;
  message: string | null;
  error: string | null;
}

export function getShouldShowAdminImportStatus(
  activeSection: AdminSection,
  selectedRoomId: string | null,
  selectedUserProfile: string | null,
  selectedSongId: string | null,
  importStatus: AdminImportStatus,
): boolean {
  return (
    activeSection === "songs" &&
    !selectedRoomId &&
    !selectedUserProfile &&
    !selectedSongId &&
    importStatus.phase !== "idle"
  );
}

export function getAdminImportProgressPercent(
  importStatus: AdminImportStatus,
): number {
  switch (importStatus.phase) {
    case "completed":
    case "failed":
      return 100;
    case "refreshing-library":
      return 95;
    case "preparing-songs":
    case "uploading-batches":
    case "waiting-rate-limit":
      return importStatus.totalSongs > 0
        ? Math.min(
            94,
            Math.round(
              (importStatus.processedSongs / importStatus.totalSongs) * 100,
            ),
          )
        : importStatus.phase === "preparing-songs"
          ? 20
          : 30;
    case "reading-file":
      return 5;
    case "parsing-file":
      return 10;
    case "validating-data":
      return 15;
    case "idle":
      return 0;
    default: {
      const _exhaustive: never = importStatus.phase;
      return _exhaustive;
    }
  }
}

export function getAdminImportStatusText(
  importStatus: AdminImportStatus,
  t: TFunction,
): string {
  switch (importStatus.phase) {
    case "reading-file": {
      const fileName =
        importStatus.fileName ||
        t("apps.admin.songs.importStatus.fileFallback", "file");
      return t("apps.admin.songs.importStatus.reading", {
        fileName,
        defaultValue: `Reading ${fileName}...`,
      });
    }
    case "parsing-file":
      return t("apps.admin.songs.importStatus.parsing", "Parsing import file...");
    case "validating-data":
      return t(
        "apps.admin.songs.importStatus.validating",
        "Validating import data...",
      );
    case "preparing-songs":
      return t("apps.admin.songs.importStatus.preparing", {
        processed: importStatus.processedSongs,
        total: importStatus.totalSongs,
        defaultValue: `Preparing songs ${importStatus.processedSongs}/${importStatus.totalSongs}`,
      });
    case "uploading-batches":
      return t("apps.admin.songs.importStatus.uploading", {
        processed: importStatus.processedSongs,
        total: importStatus.totalSongs,
        defaultValue: `Uploading songs ${importStatus.processedSongs}/${importStatus.totalSongs}`,
      });
    case "waiting-rate-limit": {
      const message =
        importStatus.message ||
        t(
          "apps.admin.songs.importStatus.rateLimitedFallback",
          "Waiting briefly before retrying...",
        );
      return t("apps.admin.songs.importStatus.rateLimited", {
        message,
        defaultValue: `Rate limited. ${message}`,
      });
    }
    case "refreshing-library":
      return t(
        "apps.admin.songs.importStatus.refreshing",
        "Import uploaded. Refreshing library...",
      );
    case "completed":
      return t("apps.admin.songs.importStatus.completed", {
        imported: importStatus.imported,
        updated: importStatus.updated,
        defaultValue: `Import complete: ${importStatus.imported} new, ${importStatus.updated} updated`,
      });
    case "failed": {
      const error =
        importStatus.error || t("apps.admin.errors.importFailed", "Import failed");
      return t("apps.admin.songs.importStatus.failed", {
        error,
        defaultValue: `Import failed: ${error}`,
      });
    }
    case "idle":
      return "";
    default: {
      const _exhaustive: never = importStatus.phase;
      return _exhaustive;
    }
  }
}
