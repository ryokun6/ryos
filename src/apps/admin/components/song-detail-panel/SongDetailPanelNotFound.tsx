import { Button } from "@/components/ui/button";
import { ArrowLeft, Warning } from "@phosphor-icons/react";
import type { SongDetailPanelViewModel } from "./useSongDetailPanel";

type Props = Pick<SongDetailPanelViewModel, "t" | "onBack">;

export function SongDetailPanelNotFound({ t, onBack }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2">
      <Warning className="size-8 text-neutral-400" weight="bold" />
      <span className="text-[11px] text-neutral-500">
        {t("apps.admin.song.notFound", "Song not found")}
      </span>
      <Button variant="ghost" size="sm" onClick={onBack} className="text-[11px]">
        <ArrowLeft className="size-3 mr-1" weight="bold" />
        {t("apps.admin.profile.back", "Back")}
      </Button>
    </div>
  );
}
