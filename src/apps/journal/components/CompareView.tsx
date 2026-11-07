import { cn } from "@/lib/utils";
import type { JournalLogic } from "../hooks/useJournalLogic";
import { currentJournalPage, isJournalDayId } from "../logic";
import { DailyJournal } from "./GeneratedView";
import { FreeformCanvas } from "./FreeformCanvas";

export function CompareView({
  l,
  isMobileLayout,
}: {
  l: JournalLogic;
  isMobileLayout: boolean;
}) {
  return (
    <div className={cn("grid h-full min-h-0", isMobileLayout ? "grid-cols-1 overflow-y-auto" : "grid-cols-2")}>
      <section className={cn("flex min-h-[24rem] flex-col", !isMobileLayout && "min-h-0 border-r border-os-window")}>
        <DailyJournal l={l} isMobileLayout={isMobileLayout} />
      </section>
      <section className={cn("flex min-h-[24rem] flex-col", !isMobileLayout && "min-h-0")}>
        <FreeformCanvas
          l={l}
          positions={l.journal.positions}
          texts={l.journal.texts}
          scraps={l.journal.scraps}
          showDates={l.journal.toggles.date}
          activePageId={currentJournalPage(l.journal).id}
          interactive
          onMove={l.api.moveFragment}
          onOpenDay={(pageId) => {
            if (isJournalDayId(pageId)) l.api.selectDay(pageId);
            else l.api.selectUndated(pageId);
          }}
        />
      </section>
    </div>
  );
}
