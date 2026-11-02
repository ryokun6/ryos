import { useRef } from "react";
import { Star } from "@phosphor-icons/react";
import { AppSidebarPanel } from "@/components/layout/AppSidebarPanel";
import { PanelHeader } from "@/apps/contacts/components/contacts-app/PanelHeader";
import { cn } from "@/lib/utils";
import {
  averageMood,
  clamp,
  dayHasEntry,
  entryDocId,
  JOURNAL_SIDEBAR_MAX_WIDTH,
  JOURNAL_SIDEBAR_MIN_WIDTH,
  moodForDay,
  sampleStreak,
  sidebarDates,
  todayDayId,
  undatedDocId,
} from "../logic";
import {
  formatJournalDay,
  fragmentsForDay,
  JOURNAL_DAYS,
  type JournalFragment,
} from "../sampleContent";
import type { JournalLogic } from "../hooks/useJournalLogic";
import { JournalEntryEditor } from "./JournalEntryEditor";

export function GeneratedView({
  l,
  isMobileLayout,
}: {
  l: JournalLogic;
  isMobileLayout: boolean;
}) {
  return <DailyJournal l={l} isMobileLayout={isMobileLayout} />;
}

export function DailyJournal({
  l,
  isMobileLayout,
}: {
  l: JournalLogic;
  isMobileLayout: boolean;
}) {
  const { t, language, journal, isMacOSTheme, isSystem7Theme, sidebarWidth } = l;
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;
  const features = journal.toggles;
  const showingUndated =
    !features.date &&
    journal.selectedUndatedId !== null &&
    journal.undatedPages.includes(journal.selectedUndatedId);
  const pageItems = [
    ...JOURNAL_DAYS.map((day) => ({ kind: "day" as const, id: day.id })),
    ...journal.undatedPages.map((id) => ({ kind: "page" as const, id })),
  ];
  const selectedDayId = journal.selectedDayId;
  const selectedPageIndex = showingUndated
    ? JOURNAL_DAYS.length + journal.undatedPages.indexOf(journal.selectedUndatedId!)
    : Math.max(0, pageItems.findIndex((item) => item.kind === "day" && item.id === selectedDayId));
  const activeDayId = showingUndated ? null : selectedDayId;
  const fragments = activeDayId ? fragmentsForDay(activeDayId) : [];
  const textFragments = fragments.filter((fragment) => fragment.kind === "text");
  const blankFragment: JournalFragment | null = showingUndated
    ? {
        id: undatedDocId(journal.selectedUndatedId!),
        dayId: "",
        kind: "text",
        text: null,
        photo: null,
        x: 0,
        y: 0,
        w: 40,
        rotate: 0,
      }
    : textFragments.length === 0 && activeDayId
      ? {
          id: entryDocId(activeDayId),
          dayId: activeDayId,
          kind: "text",
          text: null,
          photo: null,
          x: 0,
          y: 0,
          w: 40,
          rotate: 0,
        }
      : null;
  const useGeneva = isMacOSTheme || isSystem7Theme;
  const moodKey = showingUndated ? journal.selectedUndatedId! : selectedDayId;
  const mood = moodForDay(journal, moodKey);
  const moodAverage = averageMood(JOURNAL_DAYS.map((day) => moodForDay(journal, day.id)));
  const statCard =
    "flex min-h-[4.75rem] flex-col items-start justify-center gap-1 rounded-os border border-os-window bg-os-panel-bg px-3 py-2.5 os-theme-win98:rounded-none";
  const statLabel = "whitespace-nowrap text-[11px] leading-none text-os-text-secondary";
  const statValue = "w-full bg-transparent p-0 text-2xl font-medium leading-none text-os-text-primary";

  return (
    <div className={cn("flex min-h-0 flex-1", isMobileLayout ? "flex-col" : "flex-row")}>
      <div
        className={cn("relative flex min-h-0 shrink-0", isMobileLayout && "max-h-[150px] w-full")}
        style={isMobileLayout ? undefined : { width: sidebarWidth }}
      >
      <AppSidebarPanel
        bordered={isMacOSTheme}
        className="flex min-h-0 w-full flex-col"
        style={!isMacOSTheme ? { borderRight: "1px solid rgba(0,0,0,0.08)" } : undefined}
      >
        <PanelHeader
          title={features.date ? t("apps.journal.sidebar.days") : t("apps.journal.views.daily")}
          useGeneva={useGeneva}
          bordered={isMacOSTheme}
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {features.date
            ? sidebarDates(todayDayId()).map((dayId) => {
                const active = dayId === selectedDayId;
                const hasEntry = dayHasEntry(journal, dayId);
                return (
                  <button
                    key={dayId}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    onClick={() => l.api.selectDay(dayId)}
                    data-selected={active ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center px-2.5 py-1 text-left text-[13px] leading-tight",
                      !active && "transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                    )}
                  >
                    <span className={cn("truncate", !hasEntry && "opacity-40")}>
                      {formatJournalDay(dayId, language)}
                    </span>
                  </button>
                );
              })
            : pageItems.map((item, index) => {
                const active =
                  item.kind === "page"
                    ? item.id === journal.selectedUndatedId
                    : !showingUndated && item.id === selectedDayId;
                return (
                  <button
                    key={`${item.kind}:${item.id}`}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    onClick={() =>
                      item.kind === "page" ? l.api.selectUndated(item.id) : l.api.selectDay(item.id)
                    }
                    data-selected={active ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center px-2.5 py-1 text-left text-[13px] leading-tight",
                      !active && "transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                    )}
                  >
                    <span className="truncate">
                      {t("apps.journal.pageNumber", { count: index + 1 })}
                    </span>
                  </button>
                );
              })}
          {features.date ? null : (
            <button
              type="button"
              onClick={() => l.api.addUndatedPage()}
              className="flex w-full items-center px-2.5 py-1 text-left text-[13px] leading-tight text-os-link transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            >
              {t("apps.journal.sidebar.newPage")}
            </button>
          )}
        </div>
      </AppSidebarPanel>
      {isMobileLayout ? null : (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label={t("apps.journal.sidebar.days")}
          className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize touch-none"
          onPointerDown={(event) => {
            event.preventDefault();
            const startX = event.clientX;
            const startWidth = sidebarWidthRef.current;
            const move = (pointerEvent: PointerEvent) => {
              l.api.setSidebarWidth(
                clamp(
                  startWidth + pointerEvent.clientX - startX,
                  JOURNAL_SIDEBAR_MIN_WIDTH,
                  JOURNAL_SIDEBAR_MAX_WIDTH
                )
              );
            };
            const stop = () => {
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", stop);
              window.removeEventListener("pointercancel", stop);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", stop);
            window.addEventListener("pointercancel", stop);
          }}
        />
      )}
      </div>
      <article className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-medium leading-tight">
              {features.date && activeDayId
                ? formatJournalDay(activeDayId, language)
                : t("apps.journal.pageNumber", { count: selectedPageIndex + 1 })}
            </h2>
            {features.mood ? (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-sm text-os-text-secondary">{t("apps.journal.mood.label")}</span>
                <div className="flex" role="group" aria-label={t("apps.journal.mood.label")}>
                  {[1, 2, 3, 4, 5].map((score) => (
                    <button
                      key={score}
                      type="button"
                      aria-label={t("apps.journal.mood.set", { score })}
                      aria-pressed={mood === score}
                      onClick={() => l.api.setMood(moodKey, score)}
                      className={cn(
                        "p-0.5",
                        score <= mood ? "text-os-link" : "text-os-text-secondary"
                      )}
                    >
                      <Star size={18} weight={score <= mood ? "fill" : "regular"} />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </header>
        {features.streak || features.reminder ? (
          <div className={cn("mt-4 grid gap-2", isMobileLayout ? "grid-cols-1" : "grid-cols-2")}>
            {features.streak ? (
              <div className={statCard}>
                <span className={statLabel}>{t("apps.journal.streak.label")}</span>
                <span className={statValue}>
                  {t("apps.journal.streak.value", { count: sampleStreak() })}
                </span>
              </div>
            ) : null}
            {features.reminder ? (
              <label className={statCard}>
                <span className={statLabel}>{t("apps.journal.reminder.label")}</span>
                <input
                  type="time"
                  value={journal.reminderTime}
                  aria-label={t("apps.journal.reminder.timeLabel")}
                  onChange={(event) => l.api.setReminderTime(event.target.value)}
                  className={statValue}
                />
              </label>
            ) : null}
          </div>
        ) : null}
        <div className="mt-4 flex max-w-xl flex-col gap-3">
          {fragments.map((fragment) =>
            fragment.kind === "photo" && fragment.photo ? (
              <img
                key={fragment.id}
                src={fragment.photo}
                alt={t("apps.journal.photo.alt")}
                className="max-h-56 w-full rounded-os object-cover os-theme-win98:rounded-none"
              />
            ) : (
              <JournalEntryEditor
                key={fragment.id}
                fragment={fragment}
                saved={journal.texts[fragment.id]}
                language={language}
                onChange={l.api.setEntryText}
              />
            )
          )}
          {blankFragment ? (
            <JournalEntryEditor
              key={blankFragment.id}
              fragment={blankFragment}
              saved={journal.texts[blankFragment.id]}
              language={language}
              onChange={l.api.setEntryText}
            />
          ) : null}
        </div>
        {features.weeklyReport ? (
          <section className="mt-5 max-w-xl rounded-os border border-os-window bg-os-panel-bg p-3 os-theme-win98:rounded-none">
            <h3 className="text-sm font-medium">{t("apps.journal.report.title")}</h3>
            <p className="mt-1 text-sm">
              {t("apps.journal.report.days", { count: JOURNAL_DAYS.length })}
              {features.mood
                ? ` · ${t("apps.journal.report.average", { score: moodAverage })}`
                : ""}
              {features.streak
                ? ` · ${t("apps.journal.streak.value", { count: sampleStreak() })}`
                : ""}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-os-text-secondary">
              {t("apps.journal.report.blurb")}
            </p>
          </section>
        ) : null}
      </article>
    </div>
  );
}
