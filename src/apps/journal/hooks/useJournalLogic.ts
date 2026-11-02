import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { useAppHelpAboutDialogs } from "@/hooks/useAppHelpAboutDialogs";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useJournalStore } from "@/stores/useJournalStore";
import { helpItems } from "../metadata";
import { buildPlanDiff, servicePicture, visibleJournal } from "../logic";

export function useJournalLogic() {
  const { t, i18n } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("journal", helpItems);
  const { isWindowsTheme, isMacOSTheme, isSystem7Theme } = useThemeFlags();
  const journal = useJournalStore((state) => state.journal);
  const notice = useJournalStore((state) => state.notice);
  const api = useJournalStore(
    useShallow((state) => ({
      setView: state.setView,
      toggleFeature: state.toggleFeature,
      setDecision: state.setDecision,
      addTrialPhoto: state.addTrialPhoto,
      removeTrialPhoto: state.removeTrialPhoto,
      moveFragment: state.moveFragment,
      selectDay: state.selectDay,
      setReminderTime: state.setReminderTime,
      serviceAccept: state.serviceAccept,
      serviceReject: state.serviceReject,
      serviceAskAgain: state.serviceAskAgain,
      undo: state.undo,
      revertPlan: state.revertPlan,
      resetDemo: state.resetDemo,
      dismissNotice: state.dismissNotice,
    }))
  );
  const dialogs = useAppHelpAboutDialogs();

  const visible = useMemo(() => visibleJournal(journal), [journal]);
  const plan = useMemo(
    () => buildPlanDiff(journal.decisions, journal.trialPhoto),
    [journal.decisions, journal.trialPhoto]
  );
  const service = useMemo(
    () => servicePicture(journal.servicePhase),
    [journal.servicePhase]
  );

  return {
    t,
    language: i18n.resolvedLanguage || i18n.language,
    translatedHelpItems,
    isWindowsTheme,
    isMacOSTheme,
    isSystem7Theme,
    ...dialogs,
    journal,
    notice,
    visible,
    plan,
    service,
    api,
  };
}

export type JournalLogic = ReturnType<typeof useJournalLogic>;
