import { cn } from "@/lib/utils";
import type { JournalLogic } from "../hooks/useJournalLogic";
import { DailyJournal } from "./GeneratedView";
import { FreeformCanvas } from "./FreeformCanvas";

export function CompareView({
  l,
  isMobileLayout,
}: {
  l: JournalLogic;
  isMobileLayout: boolean;
}) {
  const { t } = l;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="shrink-0 border-b border-os-window px-3 py-2 text-xs leading-snug text-os-text-secondary">
        {t("apps.journal.compare.caption")}
      </p>
      <div className={cn("grid min-h-0 flex-1", isMobileLayout ? "grid-cols-1 overflow-y-auto" : "grid-cols-2")}>
        <section className={cn("flex min-h-[24rem] flex-col", !isMobileLayout && "min-h-0 border-r border-os-window")}>
          <header className="shrink-0 border-b border-os-window px-3 py-2">
            <h2 className="text-base font-medium">{t("apps.journal.compare.dailyTitle")}</h2>
            <p className="text-xs text-os-text-secondary">{t("apps.journal.compare.dailyHint")}</p>
          </header>
          <DailyJournal l={l} isMobileLayout={isMobileLayout} />
        </section>
        <section className={cn("flex min-h-[24rem] flex-col", !isMobileLayout && "min-h-0")}>
          <header className="shrink-0 border-b border-os-window px-3 py-2">
            <h2 className="text-base font-medium">
              {t("apps.journal.compare.freeformTitle")}
              <span className="ml-2 text-xs font-normal text-os-text-secondary">
                {t("apps.journal.compare.notebook")}
              </span>
            </h2>
            <p className="text-xs text-os-text-secondary">{t("apps.journal.compare.freeformHint")}</p>
          </header>
          <FreeformCanvas
            positions={l.journal.positions}
            texts={l.journal.texts}
            interactive
            onMove={l.api.moveFragment}
          />
        </section>
      </div>
    </div>
  );
}
