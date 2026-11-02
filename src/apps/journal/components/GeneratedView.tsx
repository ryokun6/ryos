import { Star } from "@phosphor-icons/react";
import { AppSidebarPanel } from "@/components/layout/AppSidebarPanel";
import { PanelHeader } from "@/apps/contacts/components/contacts-app/PanelHeader";
import { cn } from "@/lib/utils";
import { averageMood, moodForDay, sampleStreak } from "../logic";
import {
  formatJournalDay,
  fragmentsForDay,
  JOURNAL_DAYS,
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
  const { t, language, journal, isMacOSTheme, isSystem7Theme } = l;
  const selected = JOURNAL_DAYS.find((day) => day.id === journal.selectedDayId) ?? JOURNAL_DAYS[0];
  const selectedIndex = JOURNAL_DAYS.findIndex((day) => day.id === selected.id);
  const fragments = fragmentsForDay(selected.id);
  const features = journal.toggles;
  const useGeneva = isMacOSTheme || isSystem7Theme;
  const mood = moodForDay(journal, selected.id);
  const moodAverage = averageMood(JOURNAL_DAYS.map((day) => moodForDay(journal, day.id)));
  const statCard =
    "flex min-h-10 items-center justify-between gap-3 rounded-os border border-os-window bg-os-panel-bg px-3 py-2 text-sm os-theme-win98:rounded-none";

  return (
    <div className={cn("flex min-h-0 flex-1", isMobileLayout ? "flex-col" : "flex-row")}>
      <AppSidebarPanel
        bordered={isMacOSTheme}
        className={cn(
          "flex min-h-0 shrink-0 flex-col",
          isMobileLayout ? "max-h-[150px] w-full" : "w-[210px]"
        )}
        style={!isMacOSTheme ? { borderRight: "1px solid rgba(0,0,0,0.08)" } : undefined}
      >
        <PanelHeader
          title={t("apps.journal.sidebar.days")}
          useGeneva={useGeneva}
          bordered={isMacOSTheme}
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {JOURNAL_DAYS.map((day, index) => {
            const label = features.date
              ? formatJournalDay(day.id, language)
              : t("apps.journal.pageNumber", { count: index + 1 });
            const active = day.id === selected.id;
            return (
              <button
                key={day.id}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => l.api.selectDay(day.id)}
                data-selected={active ? "true" : undefined}
                className={cn(
                  "flex w-full items-center px-2.5 py-1 text-left text-[13px] leading-tight",
                  !active && "transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                )}
              >
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </div>
      </AppSidebarPanel>
      <article className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-medium leading-tight">
              {features.date
                ? formatJournalDay(selected.id, language)
                : t("apps.journal.pageNumber", { count: selectedIndex + 1 })}
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
                      onClick={() => l.api.setMood(selected.id, score)}
                      className="p-0.5 text-os-text-primary"
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
                <span>{t("apps.journal.streak.label")}</span>
                <span className="font-medium">
                  {t("apps.journal.streak.value", { count: sampleStreak() })}
                </span>
              </div>
            ) : null}
            {features.reminder ? (
              <label className={statCard}>
                <span>{t("apps.journal.reminder.label")}</span>
                <input
                  type="time"
                  value={journal.reminderTime}
                  aria-label={t("apps.journal.reminder.timeLabel")}
                  onChange={(event) => l.api.setReminderTime(event.target.value)}
                  className="bg-transparent text-sm text-os-text-primary"
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
