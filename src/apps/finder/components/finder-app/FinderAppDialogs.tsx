import type { ComponentProps } from "react";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AppHelpAboutDialogs } from "@/components/shared/AppHelpAboutDialogs";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { LoginDialog } from "@/components/dialogs/LoginDialog";
import { RightClickMenu } from "@/components/ui/right-click-menu";
import { appMetadata } from "../../index";
import type { FileItem } from "../FileList";
import type { MenuItem } from "@/components/ui/right-click-menu";
import type { TFunction } from "i18next";

type TranslatedHelpItems = ComponentProps<typeof HelpDialog>["helpItems"];

export interface FinderAppDialogsProps {
  t: TFunction;
  translatedHelpItems: TranslatedHelpItems;
  isHelpDialogOpen: boolean;
  setIsHelpDialogOpen: (open: boolean) => void;
  isAboutDialogOpen: boolean;
  setIsAboutDialogOpen: (open: boolean) => void;
  isEmptyTrashDialogOpen: boolean;
  setIsEmptyTrashDialogOpen: (open: boolean) => void;
  confirmEmptyTrash: () => void;
  isRenameDialogOpen: boolean;
  setIsRenameDialogOpen: (open: boolean) => void;
  renameValue: string;
  setRenameValue: (value: string) => void;
  handleRenameSubmit: (newName: string) => void | Promise<void>;
  selectedFile: FileItem | undefined;
  isNewFolderDialogOpen: boolean;
  setIsNewFolderDialogOpen: (open: boolean) => void;
  newFolderName: string;
  setNewFolderName: (name: string) => void;
  handleNewFolderSubmit: (name: string) => void;
  isUsernameDialogOpen: boolean;
  setIsUsernameDialogOpen: (open: boolean) => void;
  newUsername: string;
  setNewUsername: (name: string) => void;
  newPassword: string;
  setNewPassword: (password: string) => void;
  submitUsernameDialog: () => void | Promise<void>;
  isSettingUsername: boolean;
  usernameError: string | null;
  isVerifyDialogOpen: boolean;
  setVerifyDialogOpen: (open: boolean) => void;
  verifyPasswordInput: string;
  setVerifyPasswordInput: (password: string) => void;
  verifyUsernameInput: string;
  setVerifyUsernameInput: (username: string) => void;
  isVerifyingToken: boolean;
  verifyError: string | null;
  handleVerifyTokenSubmit: (password: string, remember?: boolean) => Promise<void>;
  promptSetUsername: () => void;
  contextMenuPos: { x: number; y: number } | null;
  setContextMenuPos: (pos: { x: number; y: number } | null) => void;
  contextMenuFile: FileItem | null;
  fileMenuItems: (file: FileItem) => MenuItem[];
  blankMenuItems: MenuItem[];
}

export function FinderAppDialogs({
  t,
  translatedHelpItems,
  isHelpDialogOpen,
  setIsHelpDialogOpen,
  isAboutDialogOpen,
  setIsAboutDialogOpen,
  isEmptyTrashDialogOpen,
  setIsEmptyTrashDialogOpen,
  confirmEmptyTrash,
  isRenameDialogOpen,
  setIsRenameDialogOpen,
  renameValue,
  setRenameValue,
  handleRenameSubmit,
  selectedFile,
  isNewFolderDialogOpen,
  setIsNewFolderDialogOpen,
  newFolderName,
  setNewFolderName,
  handleNewFolderSubmit,
  isUsernameDialogOpen,
  setIsUsernameDialogOpen,
  newUsername,
  setNewUsername,
  newPassword,
  setNewPassword,
  submitUsernameDialog,
  isSettingUsername,
  usernameError,
  isVerifyDialogOpen,
  setVerifyDialogOpen,
  verifyPasswordInput,
  setVerifyPasswordInput,
  verifyUsernameInput,
  setVerifyUsernameInput,
  isVerifyingToken,
  verifyError,
  handleVerifyTokenSubmit,
  promptSetUsername,
  contextMenuPos,
  setContextMenuPos,
  contextMenuFile,
  fileMenuItems,
  blankMenuItems,
}: FinderAppDialogsProps) {
  return (
    <>
      <AppHelpAboutDialogs
        appId="finder"
        helpItems={translatedHelpItems}
        metadata={appMetadata}
        isHelpOpen={isHelpDialogOpen}
        onHelpOpenChange={setIsHelpDialogOpen}
        isAboutOpen={isAboutDialogOpen}
        onAboutOpenChange={setIsAboutDialogOpen}
      />
      <ConfirmDialog
        isOpen={isEmptyTrashDialogOpen}
        onOpenChange={setIsEmptyTrashDialogOpen}
        onConfirm={confirmEmptyTrash}
        title={t("apps.finder.dialogs.emptyTrash.title")}
        description={t("apps.finder.dialogs.emptyTrash.description")}
      />
      <InputDialog
        isOpen={isRenameDialogOpen}
        onOpenChange={setIsRenameDialogOpen}
        onSubmit={handleRenameSubmit}
        title={t("apps.finder.dialogs.renameItem.title")}
        description={t("apps.finder.dialogs.renameItem.description", {
          name: selectedFile?.name || "item",
        })}
        value={renameValue}
        onChange={setRenameValue}
      />
      <InputDialog
        isOpen={isNewFolderDialogOpen}
        onOpenChange={setIsNewFolderDialogOpen}
        onSubmit={handleNewFolderSubmit}
        title={t("apps.finder.dialogs.newFolder.title")}
        description={t("apps.finder.dialogs.newFolder.description")}
        value={newFolderName}
        onChange={setNewFolderName}
      />
      <LoginDialog
        initialTab="signup"
        isOpen={isUsernameDialogOpen}
        onOpenChange={setIsUsernameDialogOpen}
        usernameInput={verifyUsernameInput}
        onUsernameInputChange={setVerifyUsernameInput}
        passwordInput={verifyPasswordInput}
        onPasswordInputChange={setVerifyPasswordInput}
        onLoginSubmit={async () => {
          await handleVerifyTokenSubmit(verifyPasswordInput, true);
        }}
        isLoginLoading={isVerifyingToken}
        loginError={verifyError}
        newUsername={newUsername}
        onNewUsernameChange={setNewUsername}
        newPassword={newPassword}
        onNewPasswordChange={setNewPassword}
        onSignUpSubmit={async () => {
          await submitUsernameDialog();
        }}
        isSignUpLoading={isSettingUsername}
        signUpError={usernameError}
      />
      <LoginDialog
        isOpen={isVerifyDialogOpen}
        onOpenChange={setVerifyDialogOpen}
        usernameInput={verifyUsernameInput}
        onUsernameInputChange={setVerifyUsernameInput}
        passwordInput={verifyPasswordInput}
        onPasswordInputChange={setVerifyPasswordInput}
        onLoginSubmit={async () => {
          await handleVerifyTokenSubmit(verifyPasswordInput, true);
        }}
        isLoginLoading={isVerifyingToken}
        loginError={verifyError}
        newUsername={newUsername}
        onNewUsernameChange={setNewUsername}
        newPassword={newPassword}
        onNewPasswordChange={setNewPassword}
        onSignUpSubmit={async () => {
          setVerifyDialogOpen(false);
          promptSetUsername();
        }}
        isSignUpLoading={false}
        signUpError={null}
      />
      <RightClickMenu
        position={contextMenuPos}
        onClose={() => setContextMenuPos(null)}
        items={contextMenuFile ? fileMenuItems(contextMenuFile) : blankMenuItems}
      />
    </>
  );
}
