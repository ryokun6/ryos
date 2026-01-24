import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useThemeStore } from "@/stores/useThemeStore";
import { useStickiesStore, StickyColor } from "@/stores/useStickiesStore";
import { helpItems } from "..";

interface UseStickiesLogicProps {
  isWindowOpen: boolean;
  isForeground?: boolean;
  instanceId: string;
}

export function useStickiesLogic({
  isWindowOpen,
  isForeground,
  instanceId,
}: UseStickiesLogicProps) {
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("stickies", helpItems);

  // Theme state
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  // Dialog state
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isAboutDialogOpen, setIsAboutDialogOpen] = useState(false);

  // Notes state from store
  const {
    notes,
    addNote,
    updateNote,
    deleteNote,
    bringToFront,
    clearAllNotes,
  } = useStickiesStore();

  // Selected note for color changes etc
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  const handleCreateNote = useCallback((color?: StickyColor) => {
    const newId = addNote(color);
    setSelectedNoteId(newId);
  }, [addNote]);

  const handleDeleteNote = useCallback((id: string) => {
    deleteNote(id);
    if (selectedNoteId === id) {
      setSelectedNoteId(null);
    }
  }, [deleteNote, selectedNoteId]);

  const handleChangeColor = useCallback((id: string, color: StickyColor) => {
    updateNote(id, { color });
  }, [updateNote]);

  const handleNoteClick = useCallback((id: string) => {
    setSelectedNoteId(id);
    bringToFront(id);
  }, [bringToFront]);

  return {
    // Translations
    t,
    translatedHelpItems,

    // Theme
    currentTheme,
    isXpTheme,

    // Dialogs
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,

    // Notes
    notes,
    selectedNoteId,
    setSelectedNoteId,
    handleCreateNote,
    handleDeleteNote,
    handleChangeColor,
    handleNoteClick,
    updateNote,
    clearAllNotes,
    bringToFront,
  };
}
