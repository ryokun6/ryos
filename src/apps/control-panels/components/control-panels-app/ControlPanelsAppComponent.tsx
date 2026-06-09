import React from "react";
import { AppWindowShell } from "@/components/shared/AppWindowShell";
import { ControlPanelsMenuBar } from "../ControlPanelsMenuBar";
import { Tabs } from "@/components/ui/tabs";
import {
  ThemedTabsList,
  ThemedTabsTrigger,
  ThemedTabsContent,
} from "@/components/shared/ThemedTabs";
import { AppProps, ControlPanelsInitialData } from "@/apps/base/types";
import { useControlPanelsLogic } from "../../hooks/useControlPanelsLogic";
import { useContactsStore } from "@/stores/useContactsStore";
import { getContactInitials } from "@/utils/contacts";
import { useRealtimeConnectionStatus } from "@/hooks/useRealtimeConnectionStatus";
import { AppearanceTabContent } from "./AppearanceTabContent";
import { SoundTabContent } from "./SoundTabContent";
import { SyncTabContent } from "./SyncTabContent";
import { SystemTabContent } from "./SystemTabContent";
import { ControlPanelsDialogs } from "./ControlPanelsDialogs";
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
    defaultTab,
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
    tabStyles,
    isXpTheme,
    isMacOSXTheme,
    isClassicMacTheme,
    isWindowsLegacyTheme,
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
    hasPassword,
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
    refreshTelegramLinkStatus,
    handleCreateTelegramLink,
    handleOpenTelegramLink,
    handleCopyTelegramCode,
    handleDisconnectTelegramLink,
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
    setSyncFiles,
    setSyncSettings,
    setSyncSongs,
    setSyncVideos,
    setSyncTv,
    setSyncStickies,
    setSyncCalendar,
    setSyncContacts,
    setSyncMaps,
    isAutoSyncChecking,
    autoSyncLastCheckedAt,
    autoSyncLastError,
    autoSyncDomainStatus,
    cloudSyncStatus,
    isCloudBackingUp,
    isCloudRestoring,
    isCloudForceSyncing,
    isCloudForceUploading,
    isCloudForceDownloading,
    isCloudStatusLoading,
    isConfirmCloudRestoreOpen,
    setIsConfirmCloudRestoreOpen,
    isConfirmForceUploadOpen,
    setIsConfirmForceUploadOpen,
    isConfirmForceDownloadOpen,
    setIsConfirmForceDownloadOpen,
    handleCloudForceUpload,
    handleCloudForceDownload,
    handleCloudBackup,
    handleCloudRestore,
    cloudProgress,
    CLOUD_BACKUP_MAX_SIZE,
  } = logic;

  const isAdmin = useIsRyoAdmin();
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
      isXpTheme={isXpTheme}
      isForeground={isForeground}
      menuBar={menuBar}
      windowFrameProps={{
        title: windowTitle,
        onClose,
        isForeground,
        appId: "control-panels",
        skipInitialSound,
        instanceId,
        onNavigateNext,
        onNavigatePrevious,
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
          isPasswordDialogOpen={isPasswordDialogOpen}
          setIsPasswordDialogOpen={setIsPasswordDialogOpen}
          setPasswordInput={setPasswordInput}
          setPasswordError={setPasswordError}
          hasPassword={hasPassword}
          isSettingPassword={isSettingPassword}
          passwordError={passwordError}
          handleSetPassword={handleSetPassword}
          isLogoutConfirmDialogOpen={isLogoutConfirmDialogOpen}
          setIsLogoutConfirmDialogOpen={setIsLogoutConfirmDialogOpen}
          confirmLogout={confirmLogout}
          isConfirmCloudRestoreOpen={isConfirmCloudRestoreOpen}
          setIsConfirmCloudRestoreOpen={setIsConfirmCloudRestoreOpen}
          handleCloudRestore={handleCloudRestore}
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
          handleCreateTelegramLink={handleCreateTelegramLink}
          handleOpenTelegramLink={handleOpenTelegramLink}
          handleCopyTelegramCode={handleCopyTelegramCode}
          handleDisconnectTelegramLink={handleDisconnectTelegramLink}
        />
      }
    >
        <div
          className={`flex flex-col size-full ${
            isWindowsLegacyTheme ? "pt-0 pb-2 px-2" : ""
          } ${
            isClassicMacTheme
              ? isMacOSXTheme
                ? "p-4 pt-2"
                : "p-4 bg-[#E3E3E3]"
              : ""
          }`}
        >
          <Tabs defaultValue={defaultTab} className="size-full">
            <ThemedTabsList>
              <ThemedTabsTrigger value="appearance">
                {t("apps.control-panels.appearance")}
              </ThemedTabsTrigger>
              <ThemedTabsTrigger value="sound">
                {t("apps.control-panels.sound")}
              </ThemedTabsTrigger>
              <ThemedTabsTrigger value="sync">
                {t("apps.control-panels.sync")}
              </ThemedTabsTrigger>
              <ThemedTabsTrigger value="system">
                {t("apps.control-panels.system")}
              </ThemedTabsTrigger>
            </ThemedTabsList>

            <ThemedTabsContent value="appearance">
              <AppearanceTabContent
                t={t}
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
                tabStyles={tabStyles}
              />
            </ThemedTabsContent>

            <ThemedTabsContent value="sound">
              <SoundTabContent
                t={t}
                uiSoundsEnabled={uiSoundsEnabled}
                handleUISoundsChange={handleUISoundsChange}
                speechEnabled={speechEnabled}
                handleSpeechChange={handleSpeechChange}
                terminalSoundsEnabled={terminalSoundsEnabled}
                setTerminalSoundsEnabled={setTerminalSoundsEnabled}
                synthPreset={synthPreset}
                handleSynthPresetChange={handleSynthPresetChange}
                tabStyles={tabStyles}
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
              />
            </ThemedTabsContent>

            <ThemedTabsContent value="sync">
              <SyncTabContent
                t={t}
                tabStyles={tabStyles}
                isMacOSXTheme={isMacOSXTheme}
                username={username}
                promptSetUsername={promptSetUsername}
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
                setSyncFiles={setSyncFiles}
                setSyncSettings={setSyncSettings}
                setSyncCalendar={setSyncCalendar}
                setSyncContacts={setSyncContacts}
                setSyncMaps={setSyncMaps}
                setSyncSongs={setSyncSongs}
                setSyncVideos={setSyncVideos}
                setSyncTv={setSyncTv}
                setSyncStickies={setSyncStickies}
                isCloudForceSyncing={isCloudForceSyncing}
                isCloudBackingUp={isCloudBackingUp}
                isCloudRestoring={isCloudRestoring}
                isCloudForceUploading={isCloudForceUploading}
                isCloudForceDownloading={isCloudForceDownloading}
                setIsConfirmForceUploadOpen={setIsConfirmForceUploadOpen}
                setIsConfirmForceDownloadOpen={setIsConfirmForceDownloadOpen}
                handleCloudBackup={handleCloudBackup}
                setIsConfirmCloudRestoreOpen={setIsConfirmCloudRestoreOpen}
                cloudSyncStatus={cloudSyncStatus}
                cloudProgress={cloudProgress}
                isCloudStatusLoading={isCloudStatusLoading}
                CLOUD_BACKUP_MAX_SIZE={CLOUD_BACKUP_MAX_SIZE}
              />
            </ThemedTabsContent>

            <ThemedTabsContent value="system">
              <SystemTabContent
                t={t}
                tabStyles={tabStyles}
                username={username}
                myContact={myContact}
                accountAvatarLabel={accountAvatarLabel}
                accountAvatarInitials={accountAvatarInitials}
                realtimeStatus={realtimeStatus}
                debugMode={debugMode}
                isAdmin={isAdmin}
                promptSetUsername={promptSetUsername}
                promptVerifyToken={promptVerifyToken}
                hasPassword={hasPassword}
                setPasswordInput={setPasswordInput}
                setPasswordError={setPasswordError}
                setIsPasswordDialogOpen={setIsPasswordDialogOpen}
                logout={logout}
                handleLogoutAllDevices={handleLogoutAllDevices}
                isLoggingOutAllDevices={isLoggingOutAllDevices}
                telegramLinkedAccount={telegramLinkedAccount}
                openTelegramDialog={openTelegramDialog}
                isTelegramStatusLoading={isTelegramStatusLoading}
                handleCheckForUpdates={handleCheckForUpdates}
                handleBackup={handleBackup}
                fileInputRef={fileInputRef}
                handleRestore={handleRestore}
                handleResetAll={handleResetAll}
                setIsConfirmFormatOpen={setIsConfirmFormatOpen}
                setDebugMode={setDebugMode}
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
            </ThemedTabsContent>
          </Tabs>
        </div>
    </AppWindowShell>
  );
}
