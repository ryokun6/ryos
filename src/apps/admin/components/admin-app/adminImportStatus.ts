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
  return importStatus.phase === "completed"
    ? 100
    : importStatus.phase === "refreshing-library"
      ? 95
      : importStatus.totalSongs > 0
        ? Math.min(
            94,
            Math.round(
              (importStatus.processedSongs / importStatus.totalSongs) * 100,
            ),
          )
        : importStatus.phase === "reading-file"
          ? 5
          : importStatus.phase === "parsing-file"
            ? 10
            : importStatus.phase === "validating-data"
              ? 15
              : importStatus.phase === "preparing-songs"
                ? 20
                : importStatus.phase === "uploading-batches" ||
                    importStatus.phase === "waiting-rate-limit"
                  ? 30
                  : importStatus.phase === "failed"
                    ? 100
                    : 0;
}

export function getAdminImportStatusText(
  importStatus: AdminImportStatus,
  t: TFunction,
): string {
  return importStatus.phase === "reading-file"
    ? t("apps.admin.songs.importStatus.reading", {
        fileName: importStatus.fileName || "",
        defaultValue: `Reading ${importStatus.fileName || "file"}...`,
      })
    : importStatus.phase === "parsing-file"
      ? t("apps.admin.songs.importStatus.parsing", "Parsing import file...")
      : importStatus.phase === "validating-data"
        ? t(
            "apps.admin.songs.importStatus.validating",
            "Validating import data...",
          )
        : importStatus.phase === "preparing-songs"
          ? t("apps.admin.songs.importStatus.preparing", {
              processed: importStatus.processedSongs,
              total: importStatus.totalSongs,
              defaultValue: `Preparing songs ${importStatus.processedSongs}/${importStatus.totalSongs}`,
            })
          : importStatus.phase === "uploading-batches"
            ? t("apps.admin.songs.importStatus.uploading", {
                processed: importStatus.processedSongs,
                total: importStatus.totalSongs,
                defaultValue: `Uploading songs ${importStatus.processedSongs}/${importStatus.totalSongs}`,
              })
            : importStatus.phase === "waiting-rate-limit"
              ? t("apps.admin.songs.importStatus.rateLimited", {
                  message:
                    importStatus.message ||
                    "Rate limited. Waiting briefly before retrying...",
                  defaultValue:
                    importStatus.message ||
                    "Rate limited. Waiting briefly before retrying...",
                })
              : importStatus.phase === "refreshing-library"
                ? t(
                    "apps.admin.songs.importStatus.refreshing",
                    "Import uploaded. Refreshing library...",
                  )
                : importStatus.phase === "completed"
                  ? t("apps.admin.songs.importStatus.completed", {
                      imported: importStatus.imported,
                      updated: importStatus.updated,
                      defaultValue: `Import complete: ${importStatus.imported} new, ${importStatus.updated} updated`,
                    })
                  : importStatus.phase === "failed"
                    ? t("apps.admin.songs.importStatus.failed", {
                        error:
                          importStatus.error ||
                          t("apps.admin.errors.importFailed", "Import failed"),
                        defaultValue: `Import failed: ${importStatus.error || t("apps.admin.errors.importFailed", "Import failed")}`,
                      })
                    : "";
}
