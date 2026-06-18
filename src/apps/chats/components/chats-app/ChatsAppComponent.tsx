import "../../chats-streamdown.css";
import { AppProps } from "../../../base/types";
import { AppWindowShell } from "@/components/shared/AppWindowShell";
import { appMetadata } from "../..";
import { ChatsDialogs } from "../ChatsDialogs";
import { ChatsWindowContent } from "./ChatsWindowContent";
import { useChatsAppController } from "./useChatsAppController";

export function ChatsAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  initialData,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps) {
  const c = useChatsAppController({
    isWindowOpen,
    onClose,
    isForeground,
    skipInitialSound,
    initialData,
    instanceId,
    onNavigateNext,
    onNavigatePrevious,
  });

  const {
    isWindowsTheme,
    menuBar,
    windowTitle,
    isShaking,
    translatedHelpItems,
  } = c;

  return (
    <AppWindowShell
      isWindowOpen={isWindowOpen}
      isWindowsTheme={isWindowsTheme}
      isForeground={isForeground}
      menuBar={menuBar}
      windowFrameProps={{
        title: windowTitle,
        onClose,
        isForeground,
        appId: "chats",
        skipInitialSound,
        instanceId,
        onNavigateNext,
        onNavigatePrevious,
        isShaking,
      }}
    >
      <ChatsWindowContent c={c} isForeground={isForeground ?? false} />
      <ChatsDialogs
          translatedHelpItems={translatedHelpItems}
          appMetadata={appMetadata}
          isHelpDialogOpen={c.isHelpDialogOpen}
          setIsHelpDialogOpen={c.setIsHelpDialogOpen}
          isAboutDialogOpen={c.isAboutDialogOpen}
          setIsAboutDialogOpen={c.setIsAboutDialogOpen}
          isClearDialogOpen={c.isClearDialogOpen}
          setIsClearDialogOpen={c.setIsClearDialogOpen}
          confirmClearChats={c.handleConfirmClearChats}
          isSaveDialogOpen={c.isSaveDialogOpen}
          setIsSaveDialogOpen={c.setIsSaveDialogOpen}
          handleSaveSubmit={c.handleSaveSubmit}
          saveFileName={c.saveFileName}
          setSaveFileName={c.setSaveFileName}
          isUsernameDialogOpen={c.isUsernameDialogOpen}
          setIsUsernameDialogOpen={c.setIsUsernameDialogOpen}
          verifyUsernameInput={c.verifyUsernameInput}
          setVerifyUsernameInput={c.setVerifyUsernameInput}
          verifyPasswordInput={c.verifyPasswordInput}
          setVerifyPasswordInput={c.setVerifyPasswordInput}
          handleVerifyTokenSubmit={c.handleVerifyTokenSubmit}
          isVerifyingToken={c.isVerifyingToken}
          verifyError={c.verifyError}
          newUsername={c.newUsername}
          setNewUsername={c.setNewUsername}
          newPassword={c.newPassword}
          setNewPassword={c.setNewPassword}
          submitUsernameDialog={c.submitUsernameDialog}
          isSettingUsername={c.isSettingUsername}
          usernameError={c.usernameError}
          isNewRoomDialogOpen={c.isNewRoomDialogOpen}
          setIsNewRoomDialogOpen={c.setIsNewRoomDialogOpen}
          setPrefilledUser={c.setPrefilledUser}
          prefilledUser={c.prefilledUser}
          handleAddRoom={c.handleAddRoom}
          isAdmin={c.isAdmin}
          username={c.username}
          isDeleteRoomDialogOpen={c.isDeleteRoomDialogOpen}
          setIsDeleteRoomDialogOpen={c.setIsDeleteRoomDialogOpen}
          confirmDeleteRoom={c.confirmDeleteRoom}
          roomToDelete={c.roomToDelete}
          isLogoutConfirmDialogOpen={c.isLogoutConfirmDialogOpen}
          setIsLogoutConfirmDialogOpen={c.setIsLogoutConfirmDialogOpen}
          confirmLogout={c.confirmLogout}
          hasPassword={c.hasPassword}
          promptSetPassword={c.promptSetPassword}
          isPasswordDialogOpen={c.isPasswordDialogOpen}
          setIsPasswordDialogOpen={c.setIsPasswordDialogOpen}
          handleSetPassword={c.handleSetPassword}
          passwordInput={c.passwordInput}
          setPasswordInput={c.setPasswordInput}
          isSettingPassword={c.isSettingPassword}
          passwordError={c.passwordError}
          setPasswordError={c.setPasswordError}
        />
    </AppWindowShell>
  );
}
