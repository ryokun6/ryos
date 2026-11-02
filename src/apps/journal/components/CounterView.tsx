import { useState } from "react";
import { cn } from "@/lib/utils";
import { WORKBENCH_EDITS } from "../types";
import type { JournalLogic } from "../hooks/useJournalLogic";
import type { PlanPicture, WorkbenchEditId } from "../types";
import { JournalButton, JournalQuote, pictureFlagLabel, structureLabel } from "./journalUi";
import { PictureCard } from "./PictureCard";

const DIFF_ROWS = [
  "streak",
  "reminder",
  "structure",
  "mood",
  "date",
  "weeklyReport",
  "photo",
] as const;

export function CounterView({
  l,
  isMobileLayout,
}: {
  l: JournalLogic;
  isMobileLayout: boolean;
}) {
  const [mobilePane, setMobilePane] = useState<"service" | "workbench">("service");
  const showService = !isMobileLayout || mobilePane === "service";
  const showWorkbench = !isMobileLayout || mobilePane === "workbench";

  return (
    <div className="flex h-full min-h-0 flex-col">
      {isMobileLayout ? (
        <div className="flex shrink-0 gap-1 border-b border-os-window p-2">
          <JournalButton
            className="flex-1"
            active={mobilePane === "service"}
            onClick={() => setMobilePane("service")}
          >
            {l.t("apps.journal.service.title")}
          </JournalButton>
          <JournalButton
            className="flex-1"
            active={mobilePane === "workbench"}
            onClick={() => setMobilePane("workbench")}
          >
            {l.t("apps.journal.workbench.title")}
          </JournalButton>
        </div>
      ) : null}
      <div className={cn("grid min-h-0 flex-1", isMobileLayout ? "grid-cols-1" : "grid-cols-2")}>
        {showService ? <ServiceColumn l={l} split={!isMobileLayout} /> : null}
        {showWorkbench ? <WorkbenchColumn l={l} split={!isMobileLayout} /> : null}
      </div>
    </div>
  );
}

function ServiceColumn({ l, split }: { l: JournalLogic; split: boolean }) {
  const { t, journal, service } = l;
  const phaseNote =
    journal.servicePhase === "accepted"
      ? t("apps.journal.service.accepted")
      : journal.servicePhase === "rejected"
        ? t("apps.journal.service.rejected")
        : journal.servicePhase === "askedAgain"
          ? t("apps.journal.service.askedAgain")
          : null;

  return (
    <section className={cn("flex min-h-0 flex-col gap-3 overflow-y-auto p-3", split && "border-r border-os-window")}>
      <header>
        <h2 className="text-lg font-medium">{t("apps.journal.service.title")}</h2>
        <p className="text-xs leading-snug text-os-text-secondary">{t("apps.journal.service.kicker")}</p>
      </header>
      <JournalQuote>{t("apps.journal.prompt.removeStreak")}</JournalQuote>
      <div className="rounded-os border border-os-window bg-os-panel-bg p-3 os-theme-win98:rounded-none">
        <h3 className="text-sm font-medium">{t("apps.journal.service.resultTitle")}</h3>
        {journal.servicePhase === "rejected" ? (
          <p className="mt-2 text-sm">{t("apps.journal.service.rejected")}</p>
        ) : (
          <ul className="mt-2 list-disc space-y-1 pl-4 text-sm">
            <li>{t("apps.journal.service.removedStreak")}</li>
            <li>{t("apps.journal.service.removedReminder")}</li>
            <li>{t("apps.journal.service.changedDesign")}</li>
          </ul>
        )}
        <div className="mt-3">
          <PictureCard
            title={t("apps.journal.service.resultTitle")}
            picture={service}
            reminderTime={journal.reminderTime}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <JournalButton
          active={journal.servicePhase === "accepted"}
          onClick={() => l.api.serviceAccept()}
        >
          {t("apps.journal.service.acceptAll")}
        </JournalButton>
        <JournalButton
          active={journal.servicePhase === "rejected"}
          onClick={() => l.api.serviceReject()}
        >
          {t("apps.journal.service.rejectAll")}
        </JournalButton>
        <JournalButton onClick={() => l.api.serviceAskAgain()}>
          {t("apps.journal.service.askAgain")}
        </JournalButton>
      </div>
      {phaseNote && journal.servicePhase !== "rejected" ? (
        <p className="text-sm leading-snug">{phaseNote}</p>
      ) : null}
      <p className="text-xs leading-snug text-os-text-secondary">{t("apps.journal.service.onlyWhole")}</p>
    </section>
  );
}

function WorkbenchColumn({ l, split }: { l: JournalLogic; split: boolean }) {
  const { t, journal, plan } = l;
  return (
    <section className={cn("flex min-h-0 flex-col gap-3 overflow-y-auto p-3", split && "border-l border-os-window")}>
      <header>
        <h2 className="text-lg font-medium">{t("apps.journal.workbench.title")}</h2>
        <p className="text-xs leading-snug text-os-text-secondary">{t("apps.journal.workbench.kicker")}</p>
      </header>
      <JournalQuote>{t("apps.journal.prompt.removeStreak")}</JournalQuote>
      <div>
        <h3 className="text-sm font-medium">{t("apps.journal.workbench.plan")}</h3>
        <ul className="mt-2 flex flex-col gap-2">
          {WORKBENCH_EDITS.map((edit) => (
            <PlanRow key={edit} l={l} edit={edit} />
          ))}
        </ul>
      </div>
      <div>
        <h3 className="text-sm font-medium">{t("apps.journal.diff.title")}</h3>
        <p className="text-xs text-os-text-secondary">{t("apps.journal.diff.note")}</p>
        <div className="mt-2 flex gap-2">
          <PictureCard
            title={t("apps.journal.diff.before")}
            picture={plan.before}
            reminderTime={journal.reminderTime}
          />
          <PictureCard
            title={t("apps.journal.diff.after")}
            picture={plan.after}
            reminderTime={journal.reminderTime}
          />
        </div>
        <DiffTable l={l} />
      </div>
      <div className="flex flex-wrap gap-2">
        <JournalButton onClick={() => l.api.addTrialPhoto()} active={journal.trialPhoto}>
          {t("apps.journal.photo.add")}
        </JournalButton>
        {journal.trialPhoto ? (
          <JournalButton onClick={() => l.api.removeTrialPhoto()}>
            {t("apps.journal.photo.remove")}
          </JournalButton>
        ) : null}
        <JournalButton onClick={() => l.api.undo()}>{t("apps.journal.menu.undo")}</JournalButton>
        <JournalButton onClick={() => l.api.revertPlan()}>
          {t("apps.journal.menu.revert")}
        </JournalButton>
      </div>
    </section>
  );
}

function PlanRow({ l, edit }: { l: JournalLogic; edit: WorkbenchEditId }) {
  const decision = l.journal.decisions[edit];
  const { t } = l;
  const status =
    decision === "accepted"
      ? t("apps.journal.workbench.applied")
      : decision === "rejected"
        ? t("apps.journal.workbench.kept")
        : t("apps.journal.workbench.pending");
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-os border border-os-window bg-os-panel-bg px-2 py-1.5 os-theme-win98:rounded-none">
      <span className="min-w-0 flex-1 text-sm">{t(`apps.journal.edits.${edit}`)}</span>
      <span className="text-xs text-os-text-secondary">{status}</span>
      <JournalButton
        active={decision === "rejected"}
        onClick={() => l.api.setDecision(edit, "rejected")}
      >
        {t("apps.journal.workbench.keep")}
      </JournalButton>
      <JournalButton
        active={decision === "accepted"}
        onClick={() => l.api.setDecision(edit, "accepted")}
      >
        {t("apps.journal.workbench.apply")}
      </JournalButton>
    </li>
  );
}

function diffCell(picture: PlanPicture, row: (typeof DIFF_ROWS)[number], t: JournalLogic["t"]) {
  if (row === "structure") return structureLabel(picture.structure, t);
  if (row === "photo") {
    return picture.trialPhoto ? t("apps.journal.diff.photoYes") : t("apps.journal.diff.photoNo");
  }
  return pictureFlagLabel(picture, row, t);
}

function DiffTable({ l }: { l: JournalLogic }) {
  const { t, plan } = l;
  return (
    <table className="mt-2 w-full border-collapse text-left text-xs">
      <thead>
        <tr className="text-os-text-secondary">
          <th className="py-1 pr-2 font-medium" />
          <th className="py-1 pr-2 font-medium">{t("apps.journal.diff.before")}</th>
          <th className="py-1 font-medium">{t("apps.journal.diff.after")}</th>
        </tr>
      </thead>
      <tbody>
        {DIFF_ROWS.map((row) => {
          const before = diffCell(plan.before, row, t);
          const after = diffCell(plan.after, row, t);
          const changed = before !== after;
          const label =
            row === "structure"
              ? t("apps.journal.diff.structure")
              : row === "photo"
                ? t("apps.journal.diff.photo")
                : t(`apps.journal.features.${row}`);
          return (
            <tr key={row} className={cn(changed && "bg-os-selection-bg/10")}>
              <th className="py-1 pr-2 font-medium">{label}</th>
              <td className="py-1 pr-2">{before}</td>
              <td className="py-1">{after}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
