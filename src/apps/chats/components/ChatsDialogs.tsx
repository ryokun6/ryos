import { memo, useCallback, useMemo } from "react";
import { AppHelpAboutDialogs } from "@/components/shared/AppHelpAboutDialogs";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { LoginDialog } from "@/components/dialogs/LoginDialog";
import { CreateRoomDialog } from "./CreateRoomDialog";
import { LogoutDialog } from "@/components/dialogs/LogoutDialog";
import type { ChatRoom } from "@/types/chat";
import type { CreateRoomIrcOptions } from "@/shared/contracts/chat";
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
    type: "public" | "private" | "irc",
    members: string[],
    ircOptions?: CreateRoomIrcOptions
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
}

export const ChatsDialogs = memo(function ChatsDialogs({
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
}: ChatsDialogsProps) {
  const { t } = useTranslation();

  const createRoomInitialUsers = useMemo(
    () => (prefilledUser ? [prefilledUser] : []),
    [prefilledUser]
  );

  const handleLoginSubmit = useCallback(async () => {
    await handleVerifyTokenSubmit(verifyPasswordInput, true);
  }, [handleVerifyTokenSubmit, verifyPasswordInput]);

  const handleCreateRoomOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        setPrefilledUser("");
      }
      setIsNewRoomDialogOpen(open);
    },
    [setIsNewRoomDialogOpen, setPrefilledUser]
  );

  return (
    <>
      <AppHelpAboutDialogs
        appId="chats"
        helpItems={translatedHelpItems}
        metadata={appMetadata}
        isHelpOpen={isHelpDialogOpen}
        onHelpOpenChange={setIsHelpDialogOpen}
        isAboutOpen={isAboutDialogOpen}
        onAboutOpenChange={setIsAboutDialogOpen}
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
        onLoginSubmit={handleLoginSubmit}
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
        onOpenChange={handleCreateRoomOpenChange}
        onSubmit={handleAddRoom}
        isAdmin={isAdmin}
        currentUsername={username}
        initialUsers={createRoomInitialUsers}
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
      />
    </>
  );
});
