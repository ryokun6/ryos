import React, { useMemo, useState } from "react";
import { AppHelpAboutDialogs } from "@/components/shared/AppHelpAboutDialogs";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { appMetadata, helpItems } from "..";
import { useTranslatedHelpItems } from "@/hooks/useTranslatedHelpItems";
import { useAppHelpAboutDialogs } from "@/hooks/useAppHelpAboutDialogs";
import { useTranslation } from "react-i18next";

// Export type for the dialog controls
export type DialogControls = {
  openHelpDialog: () => void;
  closeHelpDialog: () => void;
  openAboutDialog: () => void;
  closeAboutDialog: () => void;
  openSaveDialog: () => void;
  closeSaveDialog: () => void;
  openConfirmNewDialog: () => void;
  closeConfirmNewDialog: () => void;
  openCloseSaveDialog: () => void;
  closeCloseSaveDialog: () => void;
};

interface DialogManagerProps {
  saveFileName: string;
  setSaveFileName: (name: string) => void;
  closeSaveFileName: string;
  setCloseSaveFileName: (name: string) => void;
  onSaveSubmit: (fileName: string) => Promise<void>;
  onCloseSave: (fileName: string) => Promise<void>;
  onCloseDelete: () => void;
  onConfirmNew: () => void;
  onCancelConfirmNew: () => void;
  onControlsReady?: (controls: DialogControls) => void;
  // When closing: is this for an untitled/new document?
  isUntitledForClose?: boolean;
}

export function DialogManager({
  saveFileName,
  setSaveFileName,
  closeSaveFileName,
  setCloseSaveFileName,
  onSaveSubmit,
  onCloseSave,
  onCloseDelete,
  onConfirmNew,
  onCancelConfirmNew,
  onControlsReady,
  isUntitledForClose = false,
}: DialogManagerProps) {
  const { t } = useTranslation();
  const translatedHelpItems = useTranslatedHelpItems("textedit", helpItems);
  const {
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
  } = useAppHelpAboutDialogs();
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [isConfirmNewDialogOpen, setIsConfirmNewDialogOpen] = useState(false);
  const [isCloseSaveDialogOpen, setIsCloseSaveDialogOpen] = useState(false);

  const dialogControls: DialogControls = useMemo(
    () => ({
      // Help dialog
      openHelpDialog: () => setIsHelpDialogOpen(true),
      closeHelpDialog: () => setIsHelpDialogOpen(false),
      // About dialog
      openAboutDialog: () => setIsAboutDialogOpen(true),
      closeAboutDialog: () => setIsAboutDialogOpen(false),
      // Save dialog
      openSaveDialog: () => setIsSaveDialogOpen(true),
      closeSaveDialog: () => setIsSaveDialogOpen(false),
      // Confirm new dialog
      openConfirmNewDialog: () => setIsConfirmNewDialogOpen(true),
      closeConfirmNewDialog: () => setIsConfirmNewDialogOpen(false),
      // Close save dialog
      openCloseSaveDialog: () => setIsCloseSaveDialogOpen(true),
      closeCloseSaveDialog: () => setIsCloseSaveDialogOpen(false),
    }),
    [setIsAboutDialogOpen, setIsHelpDialogOpen]
  );

  // Notify parent component when controls are ready
  React.useEffect(() => {
    onControlsReady?.(dialogControls);
  }, [onControlsReady, dialogControls]);

  return (
    <>
      <InputDialog
        isOpen={isSaveDialogOpen}
        onOpenChange={setIsSaveDialogOpen}
        onSubmit={onSaveSubmit}
        title={t("apps.textedit.dialogs.saveFile")}
        description={t("apps.textedit.dialogs.enterANameForYourFile")}
        value={saveFileName}
        onChange={setSaveFileName}
      />

      <ConfirmDialog
        isOpen={isConfirmNewDialogOpen}
        onOpenChange={(open) => {
          setIsConfirmNewDialogOpen(open);
          if (!open) onCancelConfirmNew();
        }}
        onConfirm={() => {
          onConfirmNew();
          setIsConfirmNewDialogOpen(false);
        }}
        title={t("apps.textedit.dialogs.discardChanges")}
        description={t("apps.textedit.dialogs.doYouWantToDiscardYourChangesAndCreateANewFile")}
      />

      <InputDialog
        isOpen={isCloseSaveDialogOpen}
        onOpenChange={setIsCloseSaveDialogOpen}
        onSubmit={onCloseSave}
        title={isUntitledForClose ? t("apps.textedit.dialogs.keepNewDocument") : t("apps.textedit.dialogs.saveChanges")}
        description={
          isUntitledForClose
            ? t("apps.textedit.dialogs.enterFilenameToSaveOrDeleteItBeforeClosing")
            : t("apps.textedit.dialogs.saveYourChangesBeforeClosing")
        }
        value={closeSaveFileName}
        onChange={setCloseSaveFileName}
        submitLabel={t("common.dialog.save")}
        additionalActions={[
          {
            label: isUntitledForClose ? t("common.dialog.delete") : t("apps.textedit.dialogs.discardChanges"),
            onClick: onCloseDelete,
            variant: "retro" as const,
            position: "left" as const,
          },
        ]}
      />

      <AppHelpAboutDialogs
        appId="textedit"
        helpItems={translatedHelpItems}
        metadata={appMetadata}
        isHelpOpen={isHelpDialogOpen}
        onHelpOpenChange={setIsHelpDialogOpen}
        isAboutOpen={isAboutDialogOpen}
        onAboutOpenChange={setIsAboutDialogOpen}
      />
    </>
  );
}
