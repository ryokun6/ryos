import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { JOURNAL_FEATURES } from "../types";
import type { JournalLogic } from "../hooks/useJournalLogic";
import type { PlanPicture } from "../types";

export function journalButtonClass(active = false, className?: string) {
  return cn(
    "inline-flex min-h-8 items-center justify-center rounded-os border px-2.5 py-1 text-sm leading-tight",
    "border-os-window bg-os-panel-bg text-os-text-primary",
    "hover:bg-os-selection-bg/15 disabled:opacity-50",
    "os-theme-win98:rounded-none",
    active && "border-transparent bg-os-selection-bg text-os-selection-text",
    className
  );
}

export function JournalButton({
  active = false,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button type={type} className={journalButtonClass(active, className)} {...props} />
  );
}

export function JournalQuote({ children }: { children: ReactNode }) {
  return (
    <blockquote className="border-l-2 border-os-selection-bg pl-3 text-sm leading-snug text-os-text-primary">
      {children}
    </blockquote>
  );
}

export function keptChangeLabels(l: JournalLogic): string[] {
  const { t, journal, visible } = l;
  const labels: string[] = [];
  for (const feature of JOURNAL_FEATURES) {
    if (!visible.features[feature]) {
      labels.push(t(`apps.journal.features.${feature}`));
    }
  }
  if (visible.structure === "freeform") {
    labels.push(t("apps.journal.diff.freeform"));
  }
  if (journal.trialPhoto) {
    labels.push(t("apps.journal.diff.photoYes"));
  }
  return labels;
}

export function pictureFlagLabel(
  picture: PlanPicture,
  key: "date" | "mood" | "streak" | "reminder" | "weeklyReport",
  t: JournalLogic["t"]
) {
  return picture[key] ? t("apps.journal.diff.on") : t("apps.journal.diff.off");
}

export function structureLabel(structure: PlanPicture["structure"], t: JournalLogic["t"]) {
  return structure === "freeform"
    ? t("apps.journal.diff.freeform")
    : t("apps.journal.diff.dailyPages");
}
