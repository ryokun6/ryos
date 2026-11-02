import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { sampleStreak } from "../logic";
import { formatJournalDay, journalText, JOURNAL_FRAGMENTS } from "../sampleContent";
import type { PlanPicture } from "../types";

const sampleNote = JOURNAL_FRAGMENTS.find((fragment) => fragment.id === "oct30-note");

export function PictureCard({
  title,
  picture,
  reminderTime,
}: {
  title: string;
  picture: PlanPicture;
  reminderTime: string;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage || i18n.language;
  const note = sampleNote?.text ? journalText(sampleNote.text, language) : "";

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="text-xs font-medium text-os-text-secondary">{title}</div>
      {picture.structure === "freeform" ? (
        <div
          className={cn(
            "relative h-36 overflow-hidden rounded-os border border-black/10",
            "bg-[#f4efe4] os-dark:bg-[#2a261f] os-theme-win98:rounded-none"
          )}
        >
          <MiniScrap className="left-[8%] top-[12%] w-[42%] -rotate-2" text={note} />
          <MiniScrap className="left-[48%] top-[28%] w-[40%] rotate-2" photo="/journal/tea.jpg" />
          {picture.trialPhoto ? (
            <MiniScrap className="left-[30%] top-[58%] w-[28%] rotate-3" photo="/journal/trial.jpg" />
          ) : null}
        </div>
      ) : (
        <div className="flex h-36 flex-col gap-1 overflow-hidden rounded-os border border-os-window bg-os-panel-bg p-2 os-theme-win98:rounded-none">
          <div className="flex flex-wrap gap-1">
            {picture.streak ? (
              <span className="rounded-os bg-os-selection-bg px-1.5 py-0.5 text-[11px] text-os-selection-text">
                {t("apps.journal.streak.value", { count: sampleStreak() })}
              </span>
            ) : null}
            {picture.reminder ? (
              <span className="rounded-os border border-os-window px-1.5 py-0.5 text-[11px]">
                {reminderTime}
              </span>
            ) : null}
          </div>
          {picture.date ? (
            <div className="text-xs text-os-text-secondary">
              {formatJournalDay("2026-10-30", language)}
            </div>
          ) : null}
          {picture.mood ? (
            <div className="text-xs">{t("apps.journal.mood.outOf", { score: 5 })}</div>
          ) : null}
          <p className="line-clamp-3 text-xs leading-snug">{note}</p>
          {picture.trialPhoto ? (
            <img
              src="/journal/trial.jpg"
              alt={t("apps.journal.photo.trialAlt")}
              className="mt-auto h-8 w-12 rounded-sm object-cover"
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function MiniScrap({
  className,
  text,
  photo,
}: {
  className: string;
  text?: string;
  photo?: string;
}) {
  return (
    <div
      className={cn(
        "absolute rounded-sm border border-black/10 bg-[#fffdf8] p-1 shadow-sm",
        "os-dark:border-white/10 os-dark:bg-[#3a342c]",
        className
      )}
    >
      {photo ? (
        <img src={photo} alt="" className="aspect-[4/3] w-full rounded-sm object-cover" />
      ) : (
        <p className="line-clamp-3 text-[10px] leading-tight text-[#2c2416] os-dark:text-[#f3ead7]">
          {text}
        </p>
      )}
    </div>
  );
}
