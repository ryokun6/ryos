import { cn } from "@/lib/utils";
import { JOURNAL_FEATURES } from "../types";
import { sampleAverageMood, sampleStreak } from "../logic";
import {
  formatJournalDay,
  fragmentsForDay,
  journalText,
  JOURNAL_DAYS,
} from "../sampleContent";
import type { JournalLogic } from "../hooks/useJournalLogic";
import { JournalButton } from "./journalUi";

export function GeneratedView({
  l,
  isMobileLayout,
}: {
  l: JournalLogic;
  isMobileLayout: boolean;
}) {
  const { t } = l;
  return (
    <div className={cn("flex h-full min-h-0", isMobileLayout ? "flex-col" : "flex-row")}>
      <section
        className={cn(
          "shrink-0 overflow-y-auto border-os-window p-3",
          isMobileLayout ? "border-b" : "w-[17.5rem] border-r"
        )}
      >
        <h2 className="text-base font-medium leading-snug">{t("apps.journal.generated.question")}</h2>
        <p className="mt-1 text-xs leading-snug text-os-text-secondary">
          {t("apps.journal.generated.kicker")}
        </p>
        <div className={cn("mt-3 grid gap-2", isMobileLayout ? "grid-cols-2" : "grid-cols-1")}>
          {JOURNAL_FEATURES.map((feature) => {
            const on = l.visible.features[feature];
            return (
              <button
                key={feature}
                type="button"
                aria-pressed={on}
                onClick={() => l.api.toggleFeature(feature)}
                className={cn(
                  "rounded-os border px-2.5 py-2 text-left os-theme-win98:rounded-none",
                  on
                    ? "border-os-window bg-os-panel-bg"
                    : "border-dashed border-os-window bg-transparent opacity-80",
                  feature === "streak" && "ring-2 ring-os-selection-bg"
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{t(`apps.journal.features.${feature}`)}</span>
                  <span
                    className={cn(
                      "rounded-os px-1.5 py-0.5 text-[11px]",
                      on
                        ? "bg-os-selection-bg text-os-selection-text"
                        : "bg-os-panel-bg text-os-text-secondary"
                    )}
                  >
                    {on ? t("apps.journal.features.on") : t("apps.journal.features.off")}
                  </span>
                </span>
                <span className="mt-1 block text-xs leading-snug text-os-text-secondary">
                  {t(`apps.journal.features.${feature}Hint`)}
                </span>
                {feature === "streak" ? (
                  <span className="mt-1 block text-xs font-medium text-os-link">
                    {t("apps.journal.generated.ryoPick")}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {l.visible.structure === "freeform" ? (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-os-window px-3 py-2">
            <p className="text-sm leading-snug">{t("apps.journal.generated.freeformBanner")}</p>
            <JournalButton onClick={() => l.api.setView("compare")}>
              {t("apps.journal.generated.openCompare")}
            </JournalButton>
          </div>
        ) : null}
        <DailyJournal l={l} isMobileLayout={isMobileLayout} />
      </div>
    </div>
  );
}

export function DailyJournal({
  l,
  isMobileLayout,
}: {
  l: JournalLogic;
  isMobileLayout: boolean;
}) {
  const { t, language, journal, visible } = l;
  const selected = JOURNAL_DAYS.find((day) => day.id === journal.selectedDayId) ?? JOURNAL_DAYS[0];
  const selectedIndex = JOURNAL_DAYS.findIndex((day) => day.id === selected.id);
  const fragments = fragmentsForDay(selected.id, journal.trialPhoto);
  const features = visible.features;

  return (
    <div className={cn("flex min-h-0 flex-1", isMobileLayout ? "flex-col" : "flex-row")}>
      <div
        className={cn(
          "shrink-0 overflow-auto border-os-window",
          isMobileLayout ? "flex gap-1 overflow-x-auto border-b p-2" : "w-36 border-r p-2"
        )}
      >
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
              className={cn(
                "rounded-os px-2 py-1.5 text-left text-sm os-theme-win98:rounded-none",
                isMobileLayout && "shrink-0",
                active
                  ? "bg-os-selection-bg text-os-selection-text"
                  : "hover:bg-os-selection-bg/10"
              )}
            >
              {label}
            </button>
          );
        })}
      </div>
      <article className="min-h-0 flex-1 overflow-y-auto p-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-medium leading-tight">
              {features.date
                ? formatJournalDay(selected.id, language)
                : t("apps.journal.pageNumber", { count: selectedIndex + 1 })}
            </h2>
            {features.mood ? (
              <p className="mt-1 text-sm">
                <span className="text-os-text-secondary">{t("apps.journal.mood.label")} </span>
                <span className="font-medium">
                  {t("apps.journal.mood.outOf", { score: selected.mood })}
                </span>
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {features.streak ? (
              <div className="rounded-os bg-os-selection-bg px-3 py-1.5 text-os-selection-text">
                <div className="text-[11px] leading-none">{t("apps.journal.streak.label")}</div>
                <div className="text-2xl font-medium leading-tight">
                  {t("apps.journal.streak.value", { count: sampleStreak() })}
                </div>
              </div>
            ) : null}
            {features.reminder ? (
              <label className="flex items-center gap-2 rounded-os border border-os-window bg-os-panel-bg px-2 py-1.5 text-sm">
                <span>{t("apps.journal.reminder.label")}</span>
                <input
                  type="time"
                  value={journal.reminderTime}
                  aria-label={t("apps.journal.reminder.timeLabel")}
                  onChange={(event) => l.api.setReminderTime(event.target.value)}
                  className="bg-os-input-bg text-os-text-primary"
                />
              </label>
            ) : null}
          </div>
        </header>
        <div className="mt-4 flex flex-col gap-3">
          {fragments.map((fragment) =>
            fragment.kind === "photo" && fragment.photo ? (
              <img
                key={fragment.id}
                src={fragment.photo}
                alt={
                  fragment.id === "trial-photo"
                    ? t("apps.journal.photo.trialAlt")
                    : t("apps.journal.photo.alt")
                }
                className="max-h-56 w-full max-w-md rounded-os object-cover os-theme-win98:rounded-none"
              />
            ) : fragment.text ? (
              <p key={fragment.id} className="max-w-xl text-base leading-relaxed">
                {journalText(fragment.text, language)}
              </p>
            ) : null
          )}
        </div>
        {features.weeklyReport ? (
          <section className="mt-5 max-w-xl rounded-os border border-os-window bg-os-panel-bg p-3 os-theme-win98:rounded-none">
            <h3 className="text-sm font-medium">{t("apps.journal.report.title")}</h3>
            <p className="mt-1 text-sm">
              {t("apps.journal.report.days", { count: JOURNAL_DAYS.length })}
              {features.mood
                ? ` · ${t("apps.journal.report.average", { score: sampleAverageMood() })}`
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
