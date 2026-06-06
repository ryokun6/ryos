import type { SongDetailPanelViewModel } from "./useSongDetailPanel";

type Props = Pick<
  SongDetailPanelViewModel,
  "t" | "song" | "isLoading" | "formatRelativeTime"
>;

export function SongDetailPanelInfoSection({
  t,
  song,
  isLoading,
  formatRelativeTime,
}: Props) {
  if (isLoading || !song) return null;

  return (
    <div className="space-y-2">
      <div className="!text-[11px] uppercase tracking-wide text-os-text-secondary">
        {t("apps.admin.song.info", "Info")}
      </div>
      <div className="text-[11px] text-neutral-500 space-y-1">
        {song.createdBy && (
          <div>
            {t("apps.admin.tableHeaders.addedBy", "Added By")}:{" "}
            <span className="text-neutral-700">{song.createdBy}</span>
          </div>
        )}
        <div>
          {t("apps.admin.song.createdAt", "Created")}:{" "}
          <span className="text-neutral-700">
            {formatRelativeTime(song.createdAt)}
          </span>
        </div>
        <div>
          {t("apps.admin.song.updatedAt", "Updated")}:{" "}
          <span className="text-neutral-700">
            {formatRelativeTime(song.updatedAt)}
          </span>
        </div>
      </div>
    </div>
  );
}
