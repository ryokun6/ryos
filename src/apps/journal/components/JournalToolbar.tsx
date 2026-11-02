import { cn } from "@/lib/utils";
import { JOURNAL_VIEWS } from "../types";
import type { JournalLogic } from "../hooks/useJournalLogic";
import { JournalButton, keptChangeLabels } from "./journalUi";

const NOTICE_KEYS = {
  restored: "apps.journal.notice.restored",
  reverted: "apps.journal.notice.reverted",
  undone: "apps.journal.notice.undone",
  nothing: "apps.journal.notice.nothing",
  photo: "apps.journal.notice.photo",
} as const;

export function JournalToolbar({
  l,
  isMobileLayout,
}: {
  l: JournalLogic;
  isMobileLayout: boolean;
}) {
  const { t, journal, notice } = l;
  const changes = keptChangeLabels(l);
  const joiner = l.language.startsWith("zh") ? "、" : ", ";

  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-os-window px-2 py-2">
      <div className={cn("flex gap-1", isMobileLayout && "flex-col")}>
        <div className={cn("grid flex-1 gap-1", isMobileLayout ? "grid-cols-1" : "grid-cols-3")}>
          {JOURNAL_VIEWS.map((view) => (
            <JournalButton
              key={view}
              active={journal.view === view}
              onClick={() => l.api.setView(view)}
              className="w-full"
            >
              {t(`apps.journal.views.${view}`)}
            </JournalButton>
          ))}
        </div>
        <JournalButton onClick={() => l.api.resetDemo()}>{t("apps.journal.toolbar.reset")}</JournalButton>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs">
        <span>
          {changes.length === 0
            ? t("apps.journal.status.complete")
            : `${t("apps.journal.status.kept")} ${changes.join(joiner)}`}
        </span>
        {notice ? (
          <span role="status" className="text-os-link">
            {t(NOTICE_KEYS[notice])}
          </span>
        ) : null}
      </div>
    </div>
  );
}
