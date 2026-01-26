import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "framer-motion";
import { StickyNote } from "./StickyNote";
import { StickiesMenuBar } from "./StickiesMenuBar";
import { AppProps } from "@/apps/base/types";
import { useStickiesLogic } from "../hooks/useStickiesLogic";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { appMetadata } from "..";
import { useAppStore } from "@/stores/useAppStore";

export function StickiesAppComponent({
  isWindowOpen,
  onClose: _onClose, // Unused - Stickies uses closeAppInstance directly since it doesn't have a WindowFrame
  isForeground,
  instanceId,
}: AppProps) {
  const closeAppInstance = useAppStore((state) => state.closeAppInstance);
  
  const {
    translatedHelpItems,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isXpTheme,
    notes,
    selectedNoteId,
    handleCreateNote,
    handleDeleteNote,
    handleChangeColor,
    handleNoteClick,
    updateNote,
    clearAllNotes,
    bringToFront,
  } = useStickiesLogic();

  // Handle close - directly close the app instance
  // Stickies doesn't use WindowFrame, so we call closeAppInstance directly
  const handleClose = useCallback(() => {
    if (instanceId) {
      closeAppInstance(instanceId);
    }
  }, [instanceId, closeAppInstance]);

  // Listen for close requests from external sources (dock, menu bar, etc.)
  // Stickies doesn't use WindowFrame, so we need to handle this event ourselves
  useEffect(() => {
    if (!instanceId) return;

    const handleRequestClose = () => {
      handleClose();
    };

    window.addEventListener(
      `requestCloseWindow-${instanceId}`,
      handleRequestClose
    );

    return () => {
      window.removeEventListener(
        `requestCloseWindow-${instanceId}`,
        handleRequestClose
      );
    };
  }, [instanceId, handleClose]);

  // Create a new note when app is opened and no notes exist
  useEffect(() => {
    if (isWindowOpen && notes.length === 0) {
      handleCreateNote();
    }
  }, [isWindowOpen]);

  const menuBar = (
    <StickiesMenuBar
      onClose={handleClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
      onNewNote={handleCreateNote}
      onClearAll={clearAllNotes}
      selectedNoteId={selectedNoteId}
      onChangeColor={handleChangeColor}
      onDeleteNote={handleDeleteNote}
    />
  );

  if (!isWindowOpen) return null;

  // Calculate z-indices for notes based on foreground state
  // Windows use z-index starting at 2 (BASE_Z_INDEX + index + 1)
  // When NOT foreground: z-index 1 (above desktop at 0, below windows at 2+)
  // When foreground: z-index below dialogs (z-50) so Help/About appear on top
  const getZIndexForNote = (noteId: string) => {
    if (!isForeground) {
      // All stickies at z-index 1 when not foreground (below all windows)
      return 1;
    }
    // When foreground, stack notes with selected on top; stay below dialogs (z-50)
    const baseZ = 40;
    const index = notes.findIndex(n => n.id === noteId);
    if (noteId === selectedNoteId) {
      return baseZ + notes.length + 1;
    }
    return baseZ + index;
  };

  return (
    <>
      {/* Menu bar for macOS/System7 themes */}
      {!isXpTheme && isForeground && menuBar}

      {/* Render sticky notes in a portal with AnimatePresence for in/out animations (like window frames) */}
      {createPortal(
        <AnimatePresence>
          {notes.map((note) => (
            <StickyNote
              key={note.id}
              note={note}
              onSelect={() => {
                handleNoteClick(note.id);
                bringToFront(note.id);
              }}
              onUpdate={(updates) => updateNote(note.id, updates)}
              onDelete={() => handleDeleteNote(note.id)}
              zIndex={getZIndexForNote(note.id)}
              isForeground={!!isForeground && note.id === selectedNoteId}
            />
          ))}
        </AnimatePresence>,
        document.body
      )}

      {/* Dialogs */}
      <HelpDialog
        isOpen={isHelpDialogOpen}
        onOpenChange={setIsHelpDialogOpen}
        appId="stickies"
        helpItems={translatedHelpItems}
      />
      <AboutDialog
        isOpen={isAboutDialogOpen}
        onOpenChange={setIsAboutDialogOpen}
        metadata={appMetadata}
        appId="stickies"
      />
    </>
  );
}
