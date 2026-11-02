import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { useAppHelpAboutDialogs } from "@/hooks/useAppHelpAboutDialogs";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useJournalStore } from "@/stores/useJournalStore";
import { helpItems } from "../metadata";

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
      applyPreset: state.applyPreset,
      moveFragment: state.moveFragment,
      selectDay: state.selectDay,
      setReminderTime: state.setReminderTime,
      setMood: state.setMood,
      setEntryText: state.setEntryText,
      resetDemo: state.resetDemo,
      dismissNotice: state.dismissNotice,
    }))
  );
  const dialogs = useAppHelpAboutDialogs();

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
    api,
  };
}

export type JournalLogic = ReturnType<typeof useJournalLogic>;
