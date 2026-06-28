import { AppHelpAboutDialogs } from "@/components/shared/AppHelpAboutDialogs";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { LoginDialog } from "@/components/dialogs/LoginDialog";
import { ChangePasswordDialog } from "@/components/dialogs/ChangePasswordDialog";
import { LogoutDialog } from "@/components/dialogs/LogoutDialog";
import { TelegramLinkDialog } from "@/components/dialogs/TelegramLinkDialog";
import { appMetadata } from "../..";
import type {
  TelegramHeartbeatSettings,
  TelegramLinkCreateResponse,
  TelegramLinkSession,
  TelegramLinkedAccount,
} from "@/api/telegram";

export type ControlPanelsDialogsProps = {
  t: (key: string, opts?: Record<string, unknown>) => string;
  translatedHelpItems: { icon: string; title: string; description: string }[];
  isHelpDialogOpen: boolean;
  setIsHelpDialogOpen: (open: boolean) => void;
  isAboutDialogOpen: boolean;
  setIsAboutDialogOpen: (open: boolean) => void;
  isConfirmResetOpen: boolean;
  setIsConfirmResetOpen: (open: boolean) => void;
  handleConfirmReset: () => void;
  isConfirmFormatOpen: boolean;
  setIsConfirmFormatOpen: (open: boolean) => void;
  handleConfirmFormat: () => void;
  isUsernameDialogOpen: boolean;
  setIsUsernameDialogOpen: (open: boolean) => void;
  verifyUsernameInput: string;
  setVerifyUsernameInput: (value: string) => void;
  verifyPasswordInput: string;
  setVerifyPasswordInput: (value: string) => void;
  handleVerifyTokenSubmit: (
    password: string,
    closeOnSuccess?: boolean
  ) => Promise<void>;
  isVerifyingToken: boolean;
  verifyError: string | null;
  newUsername: string;
  setNewUsername: (value: string) => void;
  newPassword: string;
  setNewPassword: (value: string) => void;
  submitUsernameDialog: () => Promise<void>;
  isSettingUsername: boolean;
  usernameError: string | null;
  isVerifyDialogOpen: boolean;
  setVerifyDialogOpen: (open: boolean) => void;
  promptSetUsername: () => void;
  usernameDialogInitialTab: "login" | "signup";
  isPasswordDialogOpen: boolean;
  setIsPasswordDialogOpen: (open: boolean) => void;
  setPasswordInput: (value: string) => void;
  setPasswordError: (error: string | null) => void;
  hasPassword: boolean | null;
  isSettingPassword: boolean;
  passwordError: string | null;
  handleSetPassword: (
    newPassword: string,
    currentPassword?: string
  ) => Promise<void>;
  isLogoutConfirmDialogOpen: boolean;
  setIsLogoutConfirmDialogOpen: (open: boolean) => void;
  confirmLogout: () => void;
  isConfirmCloudRestoreOpen: boolean;
  setIsConfirmCloudRestoreOpen: (open: boolean) => void;
  handleCloudRestore: () => void;
  isConfirmForceUploadOpen: boolean;
  setIsConfirmForceUploadOpen: (open: boolean) => void;
  handleCloudForceUpload: () => void;
  isConfirmForceDownloadOpen: boolean;
  setIsConfirmForceDownloadOpen: (open: boolean) => void;
  handleCloudForceDownload: () => void;
  isTelegramDialogOpen: boolean;
  setIsTelegramDialogOpen: (open: boolean) => void;
  telegramLinkedAccount: TelegramLinkedAccount | null;
  telegramLinkSession: TelegramLinkSession | null;
  isTelegramStatusLoading: boolean;
  isCreatingTelegramLink: boolean;
  isDisconnectingTelegramLink: boolean;
  telegramHeartbeatSettings: TelegramHeartbeatSettings;
  isSavingTelegramHeartbeatSettings: boolean;
  handleCreateTelegramLink: () => Promise<TelegramLinkCreateResponse | null>;
  handleOpenTelegramLink: () => void;
  handleCopyTelegramCode: () => Promise<void>;
  handleDisconnectTelegramLink: () => Promise<void>;
  handleSaveTelegramHeartbeatInstructions: (instructions: string) => Promise<boolean>;
};

export function ControlPanelsDialogs(props: ControlPanelsDialogsProps) {
  const {
    t,
    translatedHelpItems,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isConfirmResetOpen,
    setIsConfirmResetOpen,
    handleConfirmReset,
    isConfirmFormatOpen,
    setIsConfirmFormatOpen,
    handleConfirmFormat,
    isUsernameDialogOpen,
    setIsUsernameDialogOpen,
    verifyUsernameInput,
    setVerifyUsernameInput,
    verifyPasswordInput,
    setVerifyPasswordInput,
    handleVerifyTokenSubmit,
    isVerifyingToken,
    verifyError,
    newUsername,
    setNewUsername,
    newPassword,
    setNewPassword,
    submitUsernameDialog,
    isSettingUsername,
    usernameError,
    isVerifyDialogOpen,
    setVerifyDialogOpen,
    promptSetUsername,
    usernameDialogInitialTab,
    isPasswordDialogOpen,
    setIsPasswordDialogOpen,
    setPasswordInput,
    setPasswordError,
    hasPassword,
    isSettingPassword,
    passwordError,
    handleSetPassword,
    isLogoutConfirmDialogOpen,
    setIsLogoutConfirmDialogOpen,
    confirmLogout,
    isConfirmCloudRestoreOpen,
    setIsConfirmCloudRestoreOpen,
    handleCloudRestore,
    isConfirmForceUploadOpen,
    setIsConfirmForceUploadOpen,
    handleCloudForceUpload,
    isConfirmForceDownloadOpen,
    setIsConfirmForceDownloadOpen,
    handleCloudForceDownload,
    isTelegramDialogOpen,
    setIsTelegramDialogOpen,
    telegramLinkedAccount,
    telegramLinkSession,
    isTelegramStatusLoading,
    isCreatingTelegramLink,
    isDisconnectingTelegramLink,
    telegramHeartbeatSettings,
    isSavingTelegramHeartbeatSettings,
    handleCreateTelegramLink,
    handleOpenTelegramLink,
    handleCopyTelegramCode,
    handleDisconnectTelegramLink,
    handleSaveTelegramHeartbeatInstructions,
  } = props;

  return (
    <>
      <AppHelpAboutDialogs
        appId="control-panels"
        helpItems={translatedHelpItems}
        metadata={appMetadata}
        isHelpOpen={isHelpDialogOpen}
        onHelpOpenChange={setIsHelpDialogOpen}
        isAboutOpen={isAboutDialogOpen}
        onAboutOpenChange={setIsAboutDialogOpen}
      />
      <ConfirmDialog
        isOpen={isConfirmResetOpen}
        onOpenChange={setIsConfirmResetOpen}
        onConfirm={handleConfirmReset}
        title={t("common.system.resetAllSettings")}
        description={t("common.system.resetAllSettingsDesc")}
      />
      <ConfirmDialog
        isOpen={isConfirmFormatOpen}
        onOpenChange={setIsConfirmFormatOpen}
        onConfirm={handleConfirmFormat}
        title={t("common.system.formatFileSystem")}
        description={t("common.system.formatFileSystemDesc")}
      />
      <LoginDialog
        initialTab={usernameDialogInitialTab}
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
        onSignUpSubmit={submitUsernameDialog}
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
        newUsername={verifyUsernameInput}
        onNewUsernameChange={setVerifyUsernameInput}
        newPassword={verifyPasswordInput}
        onNewPasswordChange={setVerifyPasswordInput}
        onSignUpSubmit={async () => {
          setVerifyDialogOpen(false);
          promptSetUsername();
        }}
        isSignUpLoading={false}
        signUpError={null}
      />
      <ChangePasswordDialog
        isOpen={isPasswordDialogOpen}
        onOpenChange={(open) => {
          setIsPasswordDialogOpen(open);
          if (!open) {
            setPasswordInput("");
            setPasswordError(null);
          }
        }}
        hasPassword={hasPassword === true}
        isLoading={isSettingPassword}
        errorMessage={passwordError}
        onAnyInputChange={() => setPasswordError(null)}
        onSubmit={async ({ currentPassword, newPassword }) => {
          setPasswordInput(newPassword);
          await handleSetPassword(newPassword, currentPassword || undefined);
        }}
      />
      <LogoutDialog
        isOpen={isLogoutConfirmDialogOpen}
        onOpenChange={setIsLogoutConfirmDialogOpen}
        onConfirm={confirmLogout}
        hasPassword={hasPassword}
        onSetPassword={() => {
          setPasswordInput("");
          setPasswordError(null);
          setIsPasswordDialogOpen(true);
        }}
      />
      <ConfirmDialog
        isOpen={isConfirmCloudRestoreOpen}
        onOpenChange={setIsConfirmCloudRestoreOpen}
        onConfirm={() => {
          setIsConfirmCloudRestoreOpen(false);
          handleCloudRestore();
        }}
        title={t("apps.control-panels.cloudSync.confirmRestore")}
        description={t("apps.control-panels.cloudSync.confirmRestoreDesc")}
      />
      <ConfirmDialog
        isOpen={isConfirmForceUploadOpen}
        onOpenChange={setIsConfirmForceUploadOpen}
        onConfirm={() => {
          setIsConfirmForceUploadOpen(false);
          handleCloudForceUpload();
        }}
        title={t("apps.control-panels.cloudSync.confirmForceUpload")}
        description={t("apps.control-panels.cloudSync.confirmForceUploadDesc")}
      />
      <ConfirmDialog
        isOpen={isConfirmForceDownloadOpen}
        onOpenChange={setIsConfirmForceDownloadOpen}
        onConfirm={() => {
          setIsConfirmForceDownloadOpen(false);
          handleCloudForceDownload();
        }}
        title={t("apps.control-panels.cloudSync.confirmForceDownload")}
        description={t("apps.control-panels.cloudSync.confirmForceDownloadDesc")}
      />
      <TelegramLinkDialog
        isOpen={isTelegramDialogOpen}
        onClose={() => setIsTelegramDialogOpen(false)}
        linkedAccount={telegramLinkedAccount}
        linkSession={telegramLinkSession}
        isStatusLoading={isTelegramStatusLoading}
        isCreatingLink={isCreatingTelegramLink}
        isDisconnectingLink={isDisconnectingTelegramLink}
        heartbeatSettings={telegramHeartbeatSettings}
        isSavingHeartbeatSettings={isSavingTelegramHeartbeatSettings}
        onCreateLink={handleCreateTelegramLink}
        onOpenTelegramLink={handleOpenTelegramLink}
        onCopyTelegramCode={handleCopyTelegramCode}
        onDisconnectTelegramLink={handleDisconnectTelegramLink}
        onSaveHeartbeatInstructions={handleSaveTelegramHeartbeatInstructions}
      />
    </>
  );
}
