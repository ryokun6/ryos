import React from "react";
import { AppWindowShell } from "@/components/shared/AppWindowShell";
import { ControlPanelsMenuBar } from "../ControlPanelsMenuBar";
import { AppProps, ControlPanelsInitialData } from "@/apps/base/types";
import { useControlPanelsLogic } from "../../hooks/useControlPanelsLogic";
import { useContactsStore } from "@/stores/useContactsStore";
import { getContactInitials } from "@/utils/contacts";
import { useRealtimeConnectionStatus } from "@/hooks/useRealtimeConnectionStatus";
import { ControlPanelsDialogs } from "./ControlPanelsDialogs";
import { ControlPanelsMacLayout } from "./ControlPanelsMacLayout";
import { ControlPanelsMacPaneRenderer } from "./ControlPanelsMacPaneRenderer";
import {
  CONTROL_PANELS_WINDOWS_MENUBAR_HEIGHT,
  getControlPanelsTitlebarHeight,
} from "./controlPanelsMacMotion";
import {
  getControlPanelsMacWindowTitle,
  normalizeControlPanelPaneId,
  type ControlPanelMacNavigationEntry,
  type ControlPanelPaneId,
} from "./controlPanelsCategories";
import { getUsernameInitials } from "./syncUtils";
import { useIsRyoAdmin } from "@/hooks/useIsRyoAdmin";

export function ControlPanelsAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  initialData,
  instanceId,
  onNavigateNext,
  onNavigatePrevious,
}: AppProps<ControlPanelsInitialData>) {
  const logic = useControlPanelsLogic({ initialData });
  const {
    t,
    translatedHelpItems,
    windowTitle,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
    isConfirmResetOpen,
    setIsConfirmResetOpen,
    isConfirmFormatOpen,
    setIsConfirmFormatOpen,
    isPasswordDialogOpen,
    setIsPasswordDialogOpen,
    setPasswordInput,
    passwordError,
    setPasswordError,
    isSettingPassword,
    isLoggingOutAllDevices,
    fileInputRef,
    handleRestore,
    handleBackup,
    handleResetAll,
    handleConfirmReset,
    handleConfirmFormat,
    handleCheckForUpdates,
    handleShowBootScreen,
    handleTriggerAppCrashTest,
    handleTriggerDesktopCrashTest,
    AI_MODELS,
    aiModel,
    setAiModel,
    debugMode,
    setDebugMode,
    showResizers,
    setShowResizers,
    shaderEffectEnabled,
    setShaderEffectEnabled,
    currentTheme,
    setTheme,
    aquaMaterial,
    setAquaMaterial,
    supportsDarkMode,
    darkModePreference,
    setDarkMode,
    supportsAccent,
    accent,
    accentChrome,
    setAccent,
    systemFont,
    setSystemFont,
    wallpaperAccentColor,
    currentLanguage,
    setLanguage,
    timezone,
    setTimezone,
    tabStyles,
    isWindowsTheme,
    isMacOSTheme,
    uiSoundsEnabled,
    handleUISoundsChange,
    speechEnabled,
    handleSpeechChange,
    terminalSoundsEnabled,
    setTerminalSoundsEnabled,
    synthPreset,
    handleSynthPresetChange,
    masterVolume,
    setMasterVolume,
    setPrevMasterVolume,
    handleMasterMuteToggle,
    uiVolume,
    setUiVolume,
    setPrevUiVolume,
    handleUiMuteToggle,
    speechVolume,
    setSpeechVolume,
    setPrevSpeechVolume,
    handleSpeechMuteToggle,
    chatSynthVolume,
    setChatSynthVolume,
    setPrevChatSynthVolume,
    handleChatSynthMuteToggle,
    ipodVolume,
    setIpodVolume,
    setPrevIpodVolume,
    handleIpodMuteToggle,
    isIOS,
    ttsModel,
    setTtsModel,
    ttsVoice,
    setTtsVoice,
    username,
    promptSetUsername,
    promptLogin,
    usernameDialogInitialTab,
    isUsernameDialogOpen,
    setIsUsernameDialogOpen,
    newUsername,
    setNewUsername,
    newPassword,
    setNewPassword,
    isSettingUsername,
    usernameError,
    submitUsernameDialog,
    promptVerifyToken,
    isVerifyDialogOpen,
    setVerifyDialogOpen,
    verifyPasswordInput,
    setVerifyPasswordInput,
    verifyUsernameInput,
    setVerifyUsernameInput,
    logout,
    confirmLogout,
    isLogoutConfirmDialogOpen,
    setIsLogoutConfirmDialogOpen,
    isVerifyingToken,
    verifyError,
    handleVerifyTokenSubmit,
    handleSetPassword,
    handleLogoutAllDevices,
    telegramLinkedAccount,
    telegramLinkSession,
    isTelegramStatusLoading,
    isCreatingTelegramLink,
    isDisconnectingTelegramLink,
    telegramHeartbeatSettings,
    isSavingTelegramHeartbeatSettings,
    refreshTelegramLinkStatus,
    handleCreateTelegramLink,
    handleOpenTelegramLink,
    handleCopyTelegramCode,
    handleDisconnectTelegramLink,
    handleSaveTelegramHeartbeatInstructions,
    recoveryEmailStatus,
    isEmailStatusLoading,
    refreshRecoveryEmailStatus,
    accountJoinedAt,
    autoSyncEnabled,
    setAutoSyncEnabled,
    syncFiles,
    syncSettings,
    syncSongs,
    syncVideos,
    syncTv,
    syncStickies,
    syncCalendar,
    syncContacts,
    syncMaps,
    syncBooks,
    setSyncFiles,
    setSyncSettings,
    setSyncSongs,
    setSyncVideos,
    setSyncTv,
    setSyncStickies,
    setSyncCalendar,
    setSyncContacts,
    setSyncMaps,
    setSyncBooks,
    isAutoSyncChecking,
    autoSyncLastCheckedAt,
    autoSyncLastError,
    autoSyncDomainStatus,
    isCloudForceSyncing,
    isCloudForceUploading,
    isCloudForceDownloading,
    isConfirmForceUploadOpen,
    setIsConfirmForceUploadOpen,
    isConfirmForceDownloadOpen,
    setIsConfirmForceDownloadOpen,
    handleCloudForceUpload,
    handleCloudForceDownload,
  } = logic;

  const isAdmin = useIsRyoAdmin();
  const isSystem7Theme = currentTheme === "system7";
  const isWin98 = currentTheme === "win98";
  const titlebarHeight = getControlPanelsTitlebarHeight(currentTheme);
  const menubarHeight = isWindowsTheme
    ? CONTROL_PANELS_WINDOWS_MENUBAR_HEIGHT
    : 0;
  const [currentEntry, setCurrentEntry] =
    React.useState<ControlPanelMacNavigationEntry>(() =>
      normalizeControlPanelPaneId(initialData?.defaultTab) ?? "home"
    );
  // The unified System Preferences layout reflects the active pane in the
  // window title across every theme (Show All falls back to the default title).
  const effectiveWindowTitle = React.useMemo(
    () => getControlPanelsMacWindowTitle(currentEntry, t, windowTitle),
    [currentEntry, t, windowTitle]
  );
  const myContact = useContactsStore((state) =>
    state.myContactId
      ? state.contacts.find((contact) => contact.id === state.myContactId) ?? null
      : null
  );
  const realtimeStatus = useRealtimeConnectionStatus();
  const [isTelegramDialogOpen, setIsTelegramDialogOpen] = React.useState(false);

  const openTelegramDialog = React.useCallback(async () => {
    const status = await refreshTelegramLinkStatus();

    if (!status?.account && !status?.pendingLink && !telegramLinkSession) {
      const createdLink = await handleCreateTelegramLink();
      if (!createdLink) {
        return;
      }
    }

    setIsTelegramDialogOpen(true);
  }, [
    refreshTelegramLinkStatus,
    telegramLinkSession,
    handleCreateTelegramLink,
  ]);

  const accountAvatarLabel = myContact?.displayName || username || "";
  const accountAvatarInitials = myContact
    ? getContactInitials(myContact)
    : getUsernameInitials(username || "");

  const renderMacPane = (
    paneId: ControlPanelPaneId,
    onNavigateToPane: (paneId: ControlPanelPaneId) => void
  ) => (
    <ControlPanelsMacPaneRenderer
      paneId={paneId}
      onNavigateToPane={onNavigateToPane}
      t={t}
      tabStyles={tabStyles}
      currentTheme={currentTheme}
      setTheme={setTheme}
      aquaMaterial={aquaMaterial}
      setAquaMaterial={setAquaMaterial}
      supportsDarkMode={supportsDarkMode}
      darkModePreference={darkModePreference}
      setDarkMode={setDarkMode}
      supportsAccent={supportsAccent}
      accent={accent}
      accentChrome={accentChrome}
      setAccent={setAccent}
      wallpaperAccentColor={wallpaperAccentColor}
      currentLanguage={currentLanguage}
      setLanguage={setLanguage}
      timezone={timezone}
      setTimezone={setTimezone}
      uiSoundsEnabled={uiSoundsEnabled}
      handleUISoundsChange={handleUISoundsChange}
      speechEnabled={speechEnabled}
      handleSpeechChange={handleSpeechChange}
      terminalSoundsEnabled={terminalSoundsEnabled}
      setTerminalSoundsEnabled={setTerminalSoundsEnabled}
      synthPreset={synthPreset}
      handleSynthPresetChange={handleSynthPresetChange}
      masterVolume={masterVolume}
      setMasterVolume={setMasterVolume}
      setPrevMasterVolume={setPrevMasterVolume}
      handleMasterMuteToggle={handleMasterMuteToggle}
      uiVolume={uiVolume}
      setUiVolume={setUiVolume}
      setPrevUiVolume={setPrevUiVolume}
      handleUiMuteToggle={handleUiMuteToggle}
      speechVolume={speechVolume}
      setSpeechVolume={setSpeechVolume}
      setPrevSpeechVolume={setPrevSpeechVolume}
      handleSpeechMuteToggle={handleSpeechMuteToggle}
      chatSynthVolume={chatSynthVolume}
      setChatSynthVolume={setChatSynthVolume}
      setPrevChatSynthVolume={setPrevChatSynthVolume}
      handleChatSynthMuteToggle={handleChatSynthMuteToggle}
      ipodVolume={ipodVolume}
      setIpodVolume={setIpodVolume}
      setPrevIpodVolume={setPrevIpodVolume}
      handleIpodMuteToggle={handleIpodMuteToggle}
      isIOS={isIOS}
      isMacOSTheme={isMacOSTheme}
      username={username}
      promptSetUsername={promptSetUsername}
      promptLogin={promptLogin}
      autoSyncEnabled={autoSyncEnabled}
      setAutoSyncEnabled={setAutoSyncEnabled}
      isAutoSyncChecking={isAutoSyncChecking}
      autoSyncLastCheckedAt={autoSyncLastCheckedAt}
      autoSyncLastError={autoSyncLastError}
      autoSyncDomainStatus={autoSyncDomainStatus}
      syncFiles={syncFiles}
      syncSettings={syncSettings}
      syncCalendar={syncCalendar}
      syncContacts={syncContacts}
      syncMaps={syncMaps}
      syncSongs={syncSongs}
      syncVideos={syncVideos}
      syncTv={syncTv}
      syncStickies={syncStickies}
      syncBooks={syncBooks}
      setSyncFiles={setSyncFiles}
      setSyncSettings={setSyncSettings}
      setSyncCalendar={setSyncCalendar}
      setSyncContacts={setSyncContacts}
      setSyncMaps={setSyncMaps}
      setSyncSongs={setSyncSongs}
      setSyncVideos={setSyncVideos}
      setSyncTv={setSyncTv}
      setSyncStickies={setSyncStickies}
      setSyncBooks={setSyncBooks}
      isCloudForceSyncing={isCloudForceSyncing}
      isCloudForceUploading={isCloudForceUploading}
      isCloudForceDownloading={isCloudForceDownloading}
      setIsConfirmForceUploadOpen={setIsConfirmForceUploadOpen}
      setIsConfirmForceDownloadOpen={setIsConfirmForceDownloadOpen}
      myContact={myContact}
      accountAvatarLabel={accountAvatarLabel}
      accountAvatarInitials={accountAvatarInitials}
      realtimeStatus={realtimeStatus}
      accountJoinedAt={accountJoinedAt}
      debugMode={debugMode}
      isAdmin={isAdmin}
      promptVerifyToken={promptVerifyToken}
      setPasswordInput={setPasswordInput}
      setPasswordError={setPasswordError}
      setIsPasswordDialogOpen={setIsPasswordDialogOpen}
      logout={logout}
      handleLogoutAllDevices={handleLogoutAllDevices}
      isLoggingOutAllDevices={isLoggingOutAllDevices}
      telegramLinkedAccount={telegramLinkedAccount}
      openTelegramDialog={openTelegramDialog}
      isTelegramStatusLoading={isTelegramStatusLoading}
      recoveryEmailStatus={recoveryEmailStatus}
      isEmailStatusLoading={isEmailStatusLoading}
      refreshRecoveryEmailStatus={refreshRecoveryEmailStatus}
      handleCheckForUpdates={handleCheckForUpdates}
      handleBackup={handleBackup}
      fileInputRef={fileInputRef}
      handleRestore={handleRestore}
      handleResetAll={handleResetAll}
      setIsConfirmFormatOpen={setIsConfirmFormatOpen}
      setDebugMode={setDebugMode}
      showResizers={showResizers}
      setShowResizers={setShowResizers}
      shaderEffectEnabled={shaderEffectEnabled}
      setShaderEffectEnabled={setShaderEffectEnabled}
      systemFont={systemFont}
      setSystemFont={setSystemFont}
      AI_MODELS={AI_MODELS}
      aiModel={aiModel}
      setAiModel={setAiModel}
      ttsModel={ttsModel}
      setTtsModel={setTtsModel}
      ttsVoice={ttsVoice}
      setTtsVoice={setTtsVoice}
      handleShowBootScreen={handleShowBootScreen}
      handleTriggerAppCrashTest={handleTriggerAppCrashTest}
      handleTriggerDesktopCrashTest={handleTriggerDesktopCrashTest}
    />
  );

  const menuBar = (
    <ControlPanelsMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
    />
  );

  return (
    <AppWindowShell
      isWindowOpen={isWindowOpen}
      isWindowsTheme={isWindowsTheme}
      isForeground={isForeground}
      menuBar={menuBar}
      windowFrameProps={{
        title: effectiveWindowTitle,
        onClose,
        isForeground,
        appId: "control-panels",
        skipInitialSound,
        instanceId,
        onNavigateNext,
        onNavigatePrevious,
        windowConstraints: { maxWidth: 440, minHeight: 200, maxHeight: 600 },
      }}
      trailing={
        <ControlPanelsDialogs
          t={t}
          translatedHelpItems={translatedHelpItems}
          isHelpDialogOpen={isHelpDialogOpen}
          setIsHelpDialogOpen={setIsHelpDialogOpen}
          isAboutDialogOpen={isAboutDialogOpen}
          setIsAboutDialogOpen={setIsAboutDialogOpen}
          isConfirmResetOpen={isConfirmResetOpen}
          setIsConfirmResetOpen={setIsConfirmResetOpen}
          handleConfirmReset={handleConfirmReset}
          isConfirmFormatOpen={isConfirmFormatOpen}
          setIsConfirmFormatOpen={setIsConfirmFormatOpen}
          handleConfirmFormat={handleConfirmFormat}
          isUsernameDialogOpen={isUsernameDialogOpen}
          setIsUsernameDialogOpen={setIsUsernameDialogOpen}
          verifyUsernameInput={verifyUsernameInput}
          setVerifyUsernameInput={setVerifyUsernameInput}
          verifyPasswordInput={verifyPasswordInput}
          setVerifyPasswordInput={setVerifyPasswordInput}
          handleVerifyTokenSubmit={handleVerifyTokenSubmit}
          isVerifyingToken={isVerifyingToken}
          verifyError={verifyError}
          newUsername={newUsername}
          setNewUsername={setNewUsername}
          newPassword={newPassword}
          setNewPassword={setNewPassword}
          submitUsernameDialog={submitUsernameDialog}
          isSettingUsername={isSettingUsername}
          usernameError={usernameError}
          isVerifyDialogOpen={isVerifyDialogOpen}
          setVerifyDialogOpen={setVerifyDialogOpen}
          promptSetUsername={promptSetUsername}
          usernameDialogInitialTab={usernameDialogInitialTab}
          isPasswordDialogOpen={isPasswordDialogOpen}
          setIsPasswordDialogOpen={setIsPasswordDialogOpen}
          setPasswordInput={setPasswordInput}
          setPasswordError={setPasswordError}
          isSettingPassword={isSettingPassword}
          passwordError={passwordError}
          handleSetPassword={handleSetPassword}
          isLogoutConfirmDialogOpen={isLogoutConfirmDialogOpen}
          setIsLogoutConfirmDialogOpen={setIsLogoutConfirmDialogOpen}
          confirmLogout={confirmLogout}
          isConfirmForceUploadOpen={isConfirmForceUploadOpen}
          setIsConfirmForceUploadOpen={setIsConfirmForceUploadOpen}
          handleCloudForceUpload={handleCloudForceUpload}
          isConfirmForceDownloadOpen={isConfirmForceDownloadOpen}
          setIsConfirmForceDownloadOpen={setIsConfirmForceDownloadOpen}
          handleCloudForceDownload={handleCloudForceDownload}
          isTelegramDialogOpen={isTelegramDialogOpen}
          setIsTelegramDialogOpen={setIsTelegramDialogOpen}
          telegramLinkedAccount={telegramLinkedAccount}
          telegramLinkSession={telegramLinkSession}
          isTelegramStatusLoading={isTelegramStatusLoading}
          isCreatingTelegramLink={isCreatingTelegramLink}
          isDisconnectingTelegramLink={isDisconnectingTelegramLink}
          telegramHeartbeatSettings={telegramHeartbeatSettings}
          isSavingTelegramHeartbeatSettings={isSavingTelegramHeartbeatSettings}
          handleCreateTelegramLink={handleCreateTelegramLink}
          handleOpenTelegramLink={handleOpenTelegramLink}
          handleCopyTelegramCode={handleCopyTelegramCode}
          handleDisconnectTelegramLink={handleDisconnectTelegramLink}
          handleSaveTelegramHeartbeatInstructions={
            handleSaveTelegramHeartbeatInstructions
          }
        />
      }
    >
        <div className="flex flex-col w-full h-full min-h-0">
          <ControlPanelsMacLayout
            t={t}
            instanceId={instanceId}
            defaultPane={initialData?.defaultTab}
            onCurrentEntryChange={setCurrentEntry}
            isMacOSTheme={isMacOSTheme}
            isSystem7Theme={isSystem7Theme}
            isWindowsTheme={isWindowsTheme}
            isWin98={isWin98}
            titlebarHeight={titlebarHeight}
            menubarHeight={menubarHeight}
            renderPane={renderMacPane}
          />
        </div>
    </AppWindowShell>
  );
}
