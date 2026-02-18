import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { LoginDialog } from "@/components/dialogs/LoginDialog";
import { CreateRoomDialog } from "./CreateRoomDialog";
import { LogoutDialog } from "@/components/dialogs/LogoutDialog";
import type { ChatRoom } from "@/types/chat";
import { useTranslation } from "react-i18next";

interface ChatsDialogsProps {
  translatedHelpItems: Array<{
    icon: string;
    title: string;
    description: string;
  }>;
  appMetadata: {
    name: string;
    version: string;
    creator: { name: string; url: string };
    github: string;
    icon: string;
  };
  isHelpDialogOpen: boolean;
  setIsHelpDialogOpen: (open: boolean) => void;
  isAboutDialogOpen: boolean;
  setIsAboutDialogOpen: (open: boolean) => void;
  isClearDialogOpen: boolean;
  setIsClearDialogOpen: (open: boolean) => void;
  confirmClearChats: () => void;
  isSaveDialogOpen: boolean;
  setIsSaveDialogOpen: (open: boolean) => void;
  handleSaveSubmit: (value: string) => void;
  saveFileName: string;
  setSaveFileName: (value: string) => void;
  isUsernameDialogOpen: boolean;
  setIsUsernameDialogOpen: (open: boolean) => void;
  verifyUsernameInput: string;
  setVerifyUsernameInput: (value: string) => void;
  verifyPasswordInput: string;
  setVerifyPasswordInput: (value: string) => void;
  handleVerifyTokenSubmit: (input: string, isPassword: boolean) => Promise<void>;
  isVerifyingToken: boolean;
  verifyError: string | null;
  newUsername: string;
  setNewUsername: (value: string) => void;
  newPassword: string;
  setNewPassword: (value: string) => void;
  submitUsernameDialog: () => Promise<void>;
  isSettingUsername: boolean;
  usernameError: string | null;
  isNewRoomDialogOpen: boolean;
  setIsNewRoomDialogOpen: (open: boolean) => void;
  setPrefilledUser: (value: string) => void;
  prefilledUser: string;
  handleAddRoom: (
    roomName: string,
    type: "public" | "private",
    members: string[]
  ) => Promise<{ ok: boolean; error?: string }>;
  isAdmin: boolean;
  username: string | null;
  isDeleteRoomDialogOpen: boolean;
  setIsDeleteRoomDialogOpen: (open: boolean) => void;
  confirmDeleteRoom: () => Promise<void>;
  roomToDelete: ChatRoom | null;
  isLogoutConfirmDialogOpen: boolean;
  setIsLogoutConfirmDialogOpen: (open: boolean) => void;
  confirmLogout: () => void | Promise<void>;
  hasPassword: boolean | null;
  promptSetPassword: () => void;
  isPasswordDialogOpen: boolean;
  setIsPasswordDialogOpen: (open: boolean) => void;
  handleSetPassword: (value: string) => Promise<void>;
  passwordInput: string;
  setPasswordInput: (value: string) => void;
  isSettingPassword: boolean;
  passwordError: string | null;
  setPasswordError: (value: string | null) => void;
}

export const ChatsDialogs = ({
  translatedHelpItems,
  appMetadata,
  isHelpDialogOpen,
  setIsHelpDialogOpen,
  isAboutDialogOpen,
  setIsAboutDialogOpen,
  isClearDialogOpen,
  setIsClearDialogOpen,
  confirmClearChats,
  isSaveDialogOpen,
  setIsSaveDialogOpen,
  handleSaveSubmit,
  saveFileName,
  setSaveFileName,
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
  isNewRoomDialogOpen,
  setIsNewRoomDialogOpen,
  setPrefilledUser,
  prefilledUser,
  handleAddRoom,
  isAdmin,
  username,
  isDeleteRoomDialogOpen,
  setIsDeleteRoomDialogOpen,
  confirmDeleteRoom,
  roomToDelete,
  isLogoutConfirmDialogOpen,
  setIsLogoutConfirmDialogOpen,
  confirmLogout,
  hasPassword,
  promptSetPassword,
  isPasswordDialogOpen,
  setIsPasswordDialogOpen,
  handleSetPassword,
  passwordInput,
  setPasswordInput,
  isSettingPassword,
  passwordError,
  setPasswordError,
}: ChatsDialogsProps) => {
  const { t } = useTranslation();

  return (
    <>
      <HelpDialog
        isOpen={isHelpDialogOpen}
        onOpenChange={setIsHelpDialogOpen}
        helpItems={translatedHelpItems}
        appId="chats"
      />
      <AboutDialog
        isOpen={isAboutDialogOpen}
        onOpenChange={setIsAboutDialogOpen}
        metadata={appMetadata}
        appId="chats"
      />
      <ConfirmDialog
        isOpen={isClearDialogOpen}
        onOpenChange={setIsClearDialogOpen}
        onConfirm={confirmClearChats}
        title={t("apps.chats.dialogs.clearChatsTitle")}
        description={t("apps.chats.dialogs.clearChatsDescription")}
      />
      <InputDialog
        isOpen={isSaveDialogOpen}
        onOpenChange={setIsSaveDialogOpen}
        onSubmit={handleSaveSubmit}
        title={t("apps.chats.dialogs.saveTranscriptTitle")}
        description={t("apps.chats.dialogs.saveTranscriptDescription")}
        value={saveFileName}
        onChange={setSaveFileName}
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
        onSignUpSubmit={submitUsernameDialog}
        isSignUpLoading={isSettingUsername}
        signUpError={usernameError}
      />
      <CreateRoomDialog
        isOpen={isNewRoomDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setPrefilledUser("");
          }
          setIsNewRoomDialogOpen(open);
        }}
        onSubmit={handleAddRoom}
        isAdmin={isAdmin}
        currentUsername={username}
        initialUsers={prefilledUser ? [prefilledUser] : []}
      />
      <ConfirmDialog
        isOpen={isDeleteRoomDialogOpen}
        onOpenChange={setIsDeleteRoomDialogOpen}
        onConfirm={confirmDeleteRoom}
        title={
          roomToDelete?.type === "private"
            ? t("apps.chats.dialogs.leaveConversationTitle")
            : t("apps.chats.dialogs.deleteChatRoomTitle")
        }
        description={
          roomToDelete?.type === "private"
            ? t("apps.chats.dialogs.leaveConversationDescription", {
                name: roomToDelete.name,
              })
            : t("apps.chats.dialogs.deleteChatRoomDescription", {
                name: roomToDelete?.name,
              })
        }
      />
      <LogoutDialog
        isOpen={isLogoutConfirmDialogOpen}
        onOpenChange={setIsLogoutConfirmDialogOpen}
        onConfirm={confirmLogout}
        hasPassword={!!hasPassword}
        onSetPassword={promptSetPassword}
      />
      <InputDialog
        isOpen={isPasswordDialogOpen}
        onOpenChange={setIsPasswordDialogOpen}
        onSubmit={handleSetPassword}
        title={t("apps.chats.dialogs.setPasswordTitle")}
        description={t("apps.chats.dialogs.setPasswordDescription")}
        value={passwordInput}
        onChange={(value) => {
          setPasswordInput(value);
          setPasswordError(null);
        }}
        isLoading={isSettingPassword}
        errorMessage={passwordError}
        submitLabel={t("apps.chats.dialogs.setPasswordButton")}
      />
    </>
  );
};
