import React from "react";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { ControlPanelsMenuBar } from "./ControlPanelsMenuBar";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { ConfirmDialog } from "@/components/dialogs/ConfirmDialog";
import { LoginDialog } from "@/components/dialogs/LoginDialog";
import { InputDialog } from "@/components/dialogs/InputDialog";
import { LogoutDialog } from "@/components/dialogs/LogoutDialog";
import { appMetadata } from "..";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs } from "@/components/ui/tabs";
import {
  ThemedTabsList,
  ThemedTabsTrigger,
  ThemedTabsContent,
} from "@/components/shared/ThemedTabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { WallpaperPicker } from "./WallpaperPicker";
import { ScreenSaverPicker } from "./ScreenSaverPicker";
import { AppProps, ControlPanelsInitialData } from "@/apps/base/types";
import { SYNTH_PRESETS } from "@/hooks/useChatSynth";
import { VolumeMixer } from "./VolumeMixer";
import { themes } from "@/themes";
import { OsThemeId } from "@/themes/types";
import type { LanguageCode } from "@/stores/useLanguageStore";
import { useTranslation } from "react-i18next";
import { useAppStoreShallow } from "@/stores/helpers";
import { AIModel } from "@/types/aiModels";
import { useControlPanelsLogic } from "../hooks/useControlPanelsLogic";
import { abortableFetch } from "@/utils/abortableFetch";
import { TelegramLinkDialog } from "@/components/dialogs/TelegramLinkDialog";
import { getTelegramLinkedAccountLabel } from "@/hooks/useTelegramLink";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { getAppIconPath } from "@/config/appRegistry";
import { useContactsStore } from "@/stores/useContactsStore";
import { getContactInitials } from "@/utils/contacts";
import { PaperPlaneRight } from "@phosphor-icons/react";

// Version display component that reads from app store
function VersionDisplay() {
  const { t } = useTranslation();
  const { ryOSVersion, ryOSBuildNumber } = useAppStoreShallow((state) => ({
    ryOSVersion: state.ryOSVersion,
    ryOSBuildNumber: state.ryOSBuildNumber,
  }));
  const [desktopVersion, setDesktopVersion] = React.useState<string | null>(
    null
  );
  const isMac = React.useMemo(
    () =>
      typeof navigator !== "undefined" &&
      navigator.platform.toLowerCase().includes("mac"),
    []
  );

  // Fetch desktop version for download link
  React.useEffect(() => {
    if (!isMac) return;

    const abortController = new AbortController();
    let isActive = true;

    const loadDesktopVersion = async () => {
      try {
        const response = await abortableFetch("/version.json", {
          cache: "no-store",
          timeout: 15000,
          throwOnHttpError: false,
          retry: { maxAttempts: 1, initialDelayMs: 250 },
          signal: abortController.signal,
        });
        const data = await response.json();

        if (!isActive || abortController.signal.aborted) return;
        setDesktopVersion(
          typeof data?.desktopVersion === "string" ? data.desktopVersion : "1.0.1"
        );
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        if (!isActive || abortController.signal.aborted) return;
        setDesktopVersion("1.0.1"); // fallback
      }
    };

    void loadDesktopVersion();

    return () => {
      isActive = false;
      abortController.abort();
    };
  }, [isMac]);

  const displayVersion = ryOSVersion || "...";
  const displayBuild = ryOSBuildNumber ? ` (Build ${ryOSBuildNumber})` : "";

  return (
    <p className="text-[11px] text-neutral-600 font-geneva-12">
      ryOS {displayVersion}
      {displayBuild}
      {isMac && desktopVersion && (
        <>
          {" · "}
          <a
            href={`https://github.com/ryokun6/ryos/releases/download/v${desktopVersion}/ryOS_${desktopVersion}_aarch64.dmg`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            {t("apps.control-panels.downloadMacApp")}
          </a>
        </>
      )}
    </p>
  );
}

function formatRelativeTime(
  timestamp: string | null,
  t: (key: string, opts?: Record<string, unknown>) => string
): string | null {
  if (!timestamp) return null;
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return t("apps.control-panels.autoSync.justNow");
  if (minutes < 60)
    return t("apps.control-panels.autoSync.minutesAgo", { count: minutes });
  if (hours < 24)
    return t("apps.control-panels.autoSync.hoursAgo", { count: hours });
  return t("apps.control-panels.autoSync.daysAgo", { count: days });
}

function getLatestSyncTime(
  status: { lastUploadedAt: string | null; lastAppliedRemoteAt: string | null }
): string | null {
  const a = status.lastUploadedAt ? new Date(status.lastUploadedAt).getTime() : 0;
  const b = status.lastAppliedRemoteAt ? new Date(status.lastAppliedRemoteAt).getTime() : 0;
  if (a === 0 && b === 0) return null;
  return a >= b ? status.lastUploadedAt : status.lastAppliedRemoteAt;
}

function formatSyncStatus(
  status: { lastUploadedAt: string | null; lastAppliedRemoteAt: string | null },
  t: (key: string, opts?: Record<string, unknown>) => string
): string {
  const latest = getLatestSyncTime(status);
  const relative = formatRelativeTime(latest, t);
  return relative
    ? t("apps.control-panels.autoSync.lastSynced", { date: relative })
    : t("apps.control-panels.autoSync.neverSynced");
}

function getUsernameInitials(username: string): string {
  const base = username.replace(/^@+/, "").trim();
  if (!base) return "?";
  return base.slice(0, 2).toUpperCase();
}

const AUTO_SYNC_ITEM_ICONS = {
  files: "finder",
  settings: "control-panels",
  songs: "ipod",
  videos: "videos",
  stickies: "stickies",
  calendar: "calendar",
  contacts: "contacts",
} as const;

function SyncSectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <ThemedIcon
        name="/icons/default/cloud-sync.png"
        alt=""
        className="h-8 w-8 shrink-0 object-contain"
      />
      <div className="min-w-0 space-y-1">
        <Label className="text-[13px] font-medium font-geneva-12">{title}</Label>
        <p className="text-[11px] text-neutral-600 font-geneva-12">{subtitle}</p>
      </div>
    </div>
  );
}

function SyncDomainRow({
  appId,
  label,
  status,
  checked,
  onCheckedChange,
}: {
  appId: (typeof AUTO_SYNC_ITEM_ICONS)[keyof typeof AUTO_SYNC_ITEM_ICONS];
  label: string;
  status: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <ThemedIcon
          name={getAppIconPath(appId)}
          alt=""
          className="h-8 w-8 shrink-0 object-contain"
        />
        <div className="space-y-0.5 min-w-0">
          <Label className="leading-none">{label}</Label>
          <p className="text-[11px] text-neutral-600 font-geneva-12">{status}</p>
        </div>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="data-[state=checked]:bg-[#000000]"
      />
    </div>
  );
}

const userAvatarInitialsTextShadow =
  "0 2px 3px rgba(0, 0, 0, 0.45), 0 0 3px rgba(0, 0, 0, 0.15)";

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
    passwordInput,
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
    syncStickies,
    syncCalendar,
    syncContacts,
    setSyncFiles,
    setSyncSettings,
    setSyncSongs,
    setSyncVideos,
    setSyncStickies,
    setSyncCalendar,
    setSyncContacts,
    isAutoSyncChecking,
    autoSyncLastCheckedAt,
    autoSyncLastError,
    autoSyncDomainStatus,
    // Cloud Sync
    cloudSyncStatus,
    isCloudBackingUp,
    isCloudRestoring,
    isCloudStatusLoading,
    isConfirmCloudRestoreOpen,
    setIsConfirmCloudRestoreOpen,
    handleCloudBackup,
    handleCloudRestore,
    cloudProgress,
    CLOUD_BACKUP_MAX_SIZE,
  } = useControlPanelsLogic({ initialData });

  const isAdmin = username?.toLowerCase() === "ryo";
  const myContact = useContactsStore((state) =>
    state.myContactId
      ? state.contacts.find((contact) => contact.id === state.myContactId) ?? null
      : null
  );
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

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={windowTitle}
        onClose={onClose}
        isForeground={isForeground}
        appId="control-panels"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        onNavigateNext={onNavigateNext}
        onNavigatePrevious={onNavigatePrevious}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        <div
          className={`flex flex-col h-full w-full ${
            isWindowsLegacyTheme ? "pt-0 pb-2 px-2" : ""
          } ${
            isClassicMacTheme
              ? isMacOSXTheme
                ? "p-4 pt-2"
                : "p-4 bg-[#E3E3E3]"
              : ""
          }`}
        >
          <Tabs defaultValue={defaultTab} className="w-full h-full">
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
              <div className="space-y-4 h-full overflow-y-auto p-4 pt-6">
                {/* Theme Selector */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <Label>{t("apps.control-panels.theme")}</Label>
                    <Label className="text-[11px] text-neutral-600 font-geneva-12">
                      {t("apps.control-panels.themeDescription")}
                    </Label>
                  </div>
                  <Select
                    value={currentTheme}
                    onValueChange={(value) => setTheme(value as OsThemeId)}
                  >
                    <SelectTrigger className="w-[120px] flex-shrink-0">
                      <SelectValue placeholder={t("apps.control-panels.select")}>
                        {themes[currentTheme]?.name ||
                          t("apps.control-panels.select")}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(themes).map(([id, theme]) => (
                        <SelectItem key={id} value={id}>
                          {theme.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Language Selector */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <Label>{t("settings.language.title")}</Label>
                    <Label className="text-[11px] text-neutral-600 font-geneva-12">
                      {t("settings.language.description")}
                    </Label>
                  </div>
                  <Select
                    value={currentLanguage}
                    onValueChange={(value) =>
                      setLanguage(value as LanguageCode)
                    }
                  >
                    <SelectTrigger className="w-[120px] flex-shrink-0">
                      <SelectValue>
                        {t(`settings.language.${
                          currentLanguage === "zh-TW"
                            ? "chineseTraditional"
                            : currentLanguage === "ja"
                            ? "japanese"
                            : currentLanguage === "ko"
                            ? "korean"
                            : currentLanguage === "es"
                            ? "spanish"
                            : currentLanguage === "fr"
                            ? "french"
                            : currentLanguage === "de"
                            ? "german"
                            : currentLanguage === "pt"
                            ? "portuguese"
                            : currentLanguage === "it"
                            ? "italian"
                            : currentLanguage === "ru"
                            ? "russian"
                            : "english"
                        }`)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">
                        {t("settings.language.english")}
                      </SelectItem>
                      <SelectItem value="zh-TW">
                        {t("settings.language.chineseTraditional")}
                      </SelectItem>
                      <SelectItem value="ja">
                        {t("settings.language.japanese")}
                      </SelectItem>
                      <SelectItem value="ko">
                        {t("settings.language.korean")}
                      </SelectItem>
                      <SelectItem value="es">
                        {t("settings.language.spanish")}
                      </SelectItem>
                      <SelectItem value="fr">
                        {t("settings.language.french")}
                      </SelectItem>
                      <SelectItem value="de">
                        {t("settings.language.german")}
                      </SelectItem>
                      <SelectItem value="pt">
                        {t("settings.language.portuguese")}
                      </SelectItem>
                      <SelectItem value="it">
                        {t("settings.language.italian")}
                      </SelectItem>
                      <SelectItem value="ru">
                        {t("settings.language.russian")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <ScreenSaverPicker />

                <div
                  className="border-t my-4"
                  style={tabStyles.separatorStyle}
                />

                <WallpaperPicker />
              </div>
            </ThemedTabsContent>

            <ThemedTabsContent value="sound">
              <div className="space-y-4 h-full overflow-y-auto p-4 pt-6">
                {/* UI Sounds toggle + volume */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <Label>{t("apps.control-panels.uiSounds")}</Label>
                    <Switch
                      checked={uiSoundsEnabled}
                      onCheckedChange={handleUISoundsChange}
                      className="data-[state=checked]:bg-[#000000]"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <Label>{t("apps.control-panels.speech")}</Label>
                    <Switch
                      checked={speechEnabled}
                      onCheckedChange={handleSpeechChange}
                      className="data-[state=checked]:bg-[#000000]"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <Label>{t("apps.control-panels.terminalIeAmbientSynth")}</Label>
                  </div>
                  <Switch
                    checked={terminalSoundsEnabled}
                    onCheckedChange={setTerminalSoundsEnabled}
                    className="data-[state=checked]:bg-[#000000]"
                  />
                </div>

                {/* Chat Synth preset */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <Label>{t("apps.control-panels.chatSynth")}</Label>
                    <Select
                      value={synthPreset}
                      onValueChange={handleSynthPresetChange}
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue
                          placeholder={t("apps.control-panels.selectAPreset")}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(SYNTH_PRESETS).map(([key, preset]) => (
                          <SelectItem key={key} value={key}>
                            {preset.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Volume controls separator */}
                <hr
                  className="my-3 border-t"
                  style={tabStyles.separatorStyle}
                />

                {/* Vertical Volume Sliders - Mixer UI */}
                <VolumeMixer
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
              </div>
            </ThemedTabsContent>

            <ThemedTabsContent value="sync">
              <div className="space-y-4 h-full overflow-y-auto p-4">
                <div className="space-y-3">
                  {username ? (
                    <div className="flex items-center justify-between gap-4">
                      <SyncSectionTitle
                        title={t("apps.control-panels.autoSync.title")}
                        subtitle={
                          autoSyncEnabled
                            ? isAutoSyncChecking
                              ? t("apps.control-panels.autoSync.checking")
                              : formatRelativeTime(autoSyncLastCheckedAt, t)
                                ? t("apps.control-panels.autoSync.lastChecked", {
                                    date: formatRelativeTime(autoSyncLastCheckedAt, t),
                                  })
                                : t("apps.control-panels.autoSync.waiting")
                            : t("apps.control-panels.autoSync.description")
                        }
                      />
                      <Switch
                        checked={autoSyncEnabled}
                        onCheckedChange={setAutoSyncEnabled}
                        className="data-[state=checked]:bg-[#000000]"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <SyncSectionTitle
                        title={t("apps.control-panels.autoSync.title")}
                        subtitle={t("apps.control-panels.cloudSync.loginRequired")}
                      />
                      <Button
                        variant="retro"
                        onClick={promptSetUsername}
                        className="h-7"
                      >
                        {t("apps.control-panels.login")}
                      </Button>
                    </div>
                  )}

                  {username && autoSyncEnabled && (
                    <>
                      <hr
                        className="mt-2 mb-4 border-t"
                        style={tabStyles.separatorStyle}
                      />
                      <div className="space-y-3">
                        <SyncDomainRow
                          appId={AUTO_SYNC_ITEM_ICONS.files}
                          label={t("apps.control-panels.autoSync.files")}
                          status={formatSyncStatus(autoSyncDomainStatus.files, t)}
                          checked={syncFiles}
                          onCheckedChange={setSyncFiles}
                        />

                        <SyncDomainRow
                          appId={AUTO_SYNC_ITEM_ICONS.settings}
                          label={t("apps.control-panels.autoSync.settings")}
                          status={formatSyncStatus(autoSyncDomainStatus.settings, t)}
                          checked={syncSettings}
                          onCheckedChange={setSyncSettings}
                        />

                        <SyncDomainRow
                          appId={AUTO_SYNC_ITEM_ICONS.songs}
                          label={t("apps.control-panels.autoSync.songs")}
                          status={formatSyncStatus(autoSyncDomainStatus.songs, t)}
                          checked={syncSongs}
                          onCheckedChange={setSyncSongs}
                        />

                        <SyncDomainRow
                          appId={AUTO_SYNC_ITEM_ICONS.videos}
                          label={t("apps.control-panels.autoSync.videos")}
                          status={formatSyncStatus(autoSyncDomainStatus.videos, t)}
                          checked={syncVideos}
                          onCheckedChange={setSyncVideos}
                        />

                        <SyncDomainRow
                          appId={AUTO_SYNC_ITEM_ICONS.stickies}
                          label={t("apps.control-panels.autoSync.stickies")}
                          status={formatSyncStatus(autoSyncDomainStatus.stickies, t)}
                          checked={syncStickies}
                          onCheckedChange={setSyncStickies}
                        />

                        <SyncDomainRow
                          appId={AUTO_SYNC_ITEM_ICONS.calendar}
                          label={t("apps.control-panels.autoSync.calendar")}
                          status={formatSyncStatus(autoSyncDomainStatus.calendar, t)}
                          checked={syncCalendar}
                          onCheckedChange={setSyncCalendar}
                        />

                        <SyncDomainRow
                          appId={AUTO_SYNC_ITEM_ICONS.contacts}
                          label={t("apps.control-panels.autoSync.contacts")}
                          status={formatSyncStatus(autoSyncDomainStatus.contacts, t)}
                          checked={syncContacts}
                          onCheckedChange={setSyncContacts}
                        />
                      </div>

                      {autoSyncLastError && (
                        <p className="text-[11px] text-red-700 font-geneva-12">
                          {t("apps.control-panels.autoSync.error", {
                            error: autoSyncLastError,
                          })}
                        </p>
                      )}
                    </>
                  )}
                </div>

                <hr
                  className="my-4 border-t"
                  style={tabStyles.separatorStyle}
                />

                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Button
                      variant="retro"
                      onClick={handleCloudBackup}
                      disabled={isCloudBackingUp || isCloudRestoring || !username}
                      className="flex-1"
                    >
                      {isCloudBackingUp
                        ? t("apps.control-panels.cloudSync.backingUp")
                        : t("apps.control-panels.cloudSync.backupToCloud")}
                    </Button>
                    <Button
                      variant="retro"
                      onClick={() => setIsConfirmCloudRestoreOpen(true)}
                      disabled={
                        isCloudBackingUp ||
                        isCloudRestoring ||
                        !cloudSyncStatus?.hasBackup ||
                        !username
                      }
                      className="flex-1"
                    >
                      {isCloudRestoring
                        ? t("apps.control-panels.cloudSync.restoring")
                        : t("apps.control-panels.cloudSync.restoreFromCloud")}
                    </Button>
                  </div>
                  {cloudProgress && (
                    <div className="space-y-1">
                      {isMacOSXTheme ? (
                        <div className="aqua-progress w-full h-[14px]">
                          <div
                            className="aqua-progress-fill transition-all duration-300 ease-out"
                            style={{ width: `${cloudProgress.percent}%` }}
                          />
                        </div>
                      ) : (
                        <div className="w-full h-3 bg-neutral-200 rounded-sm overflow-hidden border border-neutral-300">
                          <div
                            className="h-full bg-neutral-600 transition-all duration-300 ease-out"
                            style={{ width: `${cloudProgress.percent}%` }}
                          />
                        </div>
                      )}
                      <p className="text-[11px] text-neutral-600 font-geneva-12">
                        {cloudProgress.phase}
                        {cloudProgress.percent > 0 &&
                          cloudProgress.percent < 100 &&
                          ` (${cloudProgress.percent}%)`}
                      </p>
                    </div>
                  )}
                  {!cloudProgress && (
                    <p className="text-[11px] text-neutral-600 font-geneva-12">
                      {!username
                        ? t("apps.control-panels.cloudSync.loginRequired")
                        : isCloudStatusLoading
                          ? t("apps.control-panels.cloudSync.checking")
                          : cloudSyncStatus?.hasBackup &&
                              cloudSyncStatus.metadata
                            ? t("apps.control-panels.cloudSync.lastBackup", {
                                date: new Date(
                                  cloudSyncStatus.metadata.timestamp
                                ).toLocaleString(),
                                size: (
                                  cloudSyncStatus.metadata.totalSize /
                                  (1024 * 1024)
                                ).toFixed(1),
                              })
                            : t("apps.control-panels.cloudSync.description", {
                                limit: (
                                  CLOUD_BACKUP_MAX_SIZE /
                                  (1024 * 1024)
                                ).toFixed(0),
                              })}
                    </p>
                  )}
                </div>
              </div>
            </ThemedTabsContent>

            <ThemedTabsContent value="system">
              <div className="space-y-4 h-full overflow-y-auto p-4">
                {/* User Account Section */}
                <div className="space-y-2">
                  {username ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-8 h-8 shrink-0 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)] flex items-center justify-center text-[11px] font-semibold text-white overflow-hidden"
                            style={
                              myContact?.picture
                                ? { background: "rgba(255, 255, 255, 0.72)" }
                                : {
                                    background:
                                      "linear-gradient(to bottom, #dcdcdc, #b8b8b8)",
                                    textShadow: userAvatarInitialsTextShadow,
                                  }
                            }
                            aria-label={accountAvatarLabel}
                          >
                            {myContact?.picture ? (
                              <img
                                src={myContact.picture}
                                alt={accountAvatarLabel}
                                className="w-full h-full object-contain"
                              />
                            ) : (
                              accountAvatarInitials
                            )}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-[13px] font-geneva-12 font-medium">
                              @{username}
                            </span>
                            <span className="text-[11px] text-neutral-600 font-geneva-12">
                              {t("apps.control-panels.loggedInToRyOS")}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {debugMode && (
                            <Button
                              variant="retro"
                              onClick={promptVerifyToken}
                              className="h-7"
                            >
                              {t("apps.control-panels.logIn")}
                            </Button>
                          )}
                          {hasPassword === false ? (
                            <Button
                              variant="retro"
                              onClick={() => {
                                setPasswordInput("");
                                setPasswordError(null);
                                setIsPasswordDialogOpen(true);
                              }}
                              className="h-7"
                            >
                              {t("apps.control-panels.setPassword")}
                            </Button>
                          ) : (
                            <Button
                              variant="retro"
                              onClick={logout}
                              className="h-7"
                            >
                              {t("apps.control-panels.logOut")}
                            </Button>
                          )}
                        </div>
                      </div>
                      {debugMode && (
                        <div className="flex">
                          <Button
                            variant="retro"
                            onClick={handleLogoutAllDevices}
                            disabled={isLoggingOutAllDevices}
                            className="w-full"
                          >
                            {isLoggingOutAllDevices
                              ? t("apps.control-panels.loggingOut")
                              : t("apps.control-panels.logOutOfAllDevices")}
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-[13px] font-geneva-12 font-medium">
                            {t("apps.control-panels.ryOSAccount")}
                          </span>
                          <span className="text-[11px] text-neutral-600 font-geneva-12">
                            {t("apps.control-panels.loginToSendMessages")}
                          </span>
                        </div>
                        <Button
                          variant="retro"
                          onClick={promptSetUsername}
                          className="h-7"
                        >
                          {t("apps.control-panels.login")}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {username ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 shrink-0 rounded-full bg-[#229ED9] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_1px_2px_rgba(0,0,0,0.18)] flex items-center justify-center">
                          <PaperPlaneRight size={16} weight="fill" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13px] font-geneva-12 font-medium">
                            {t("apps.control-panels.telegram.title")}
                          </span>
                          <span className="text-[11px] text-neutral-600 font-geneva-12">
                            {telegramLinkedAccount
                              ? t("apps.control-panels.telegram.linkedAs", {
                                  account: getTelegramLinkedAccountLabel(
                                    telegramLinkedAccount
                                  ),
                                })
                              : t("apps.control-panels.telegram.description")}
                          </span>
                        </div>
                      </div>

                      <Button
                        variant="retro"
                        onClick={openTelegramDialog}
                        disabled={isTelegramStatusLoading}
                        className="h-7"
                      >
                        {telegramLinkedAccount
                          ? t("apps.control-panels.telegram.manage")
                          : t("apps.control-panels.telegram.link")}
                      </Button>
                    </div>
                  </div>
                ) : null}

                <hr
                  className="my-4 border-t"
                  style={tabStyles.separatorStyle}
                />

                <div className="space-y-2">
                  <Button
                    variant="retro"
                    onClick={handleCheckForUpdates}
                    className="w-full"
                  >
                    {t("apps.control-panels.checkForUpdates")}
                  </Button>
                  <VersionDisplay />
                </div>

                {/* Local Backup */}
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Button
                      variant="retro"
                      onClick={handleBackup}
                      className="flex-1"
                    >
                      {t("apps.control-panels.backup")}
                    </Button>
                    <Button
                      variant="retro"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1"
                    >
                      {t("apps.control-panels.restore")}
                    </Button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleRestore}
                      accept=".json,.gz"
                      className="hidden"
                    />
                  </div>
                  <p className="text-[11px] text-neutral-600 font-geneva-12">
                    {t("apps.control-panels.backupRestoreDescription")}
                  </p>
                </div>

                <div className="space-y-2">
                  <Button
                    variant="retro"
                    onClick={handleResetAll}
                    className="w-full"
                  >
                    {t("apps.control-panels.resetAllSettings")}
                  </Button>
                  <p className="text-[11px] text-neutral-600 font-geneva-12">
                    {t("apps.control-panels.resetAllSettingsDescription")}
                  </p>
                </div>

                <div className="space-y-2">
                  <Button
                    variant="retro"
                    onClick={() => {
                      setIsConfirmFormatOpen(true);
                    }}
                    className="w-full"
                  >
                    {t("apps.control-panels.formatFileSystem")}
                  </Button>
                  <p className="text-[11px] text-neutral-600 font-geneva-12">
                    {t("apps.control-panels.formatFileSystemDescription")}
                  </p>
                </div>

                {isAdmin && (
                  <>
                    <hr
                      className="my-4 border-t"
                      style={tabStyles.separatorStyle}
                    />

                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        <Label>{t("apps.control-panels.debugMode")}</Label>
                        <Label className="text-[11px] text-neutral-600 font-geneva-12">
                          {t("apps.control-panels.debugModeDescription")}
                        </Label>
                      </div>
                      <Switch
                        checked={debugMode}
                        onCheckedChange={setDebugMode}
                        className="data-[state=checked]:bg-[#000000]"
                      />
                    </div>
                  </>
                )}

                {isAdmin && debugMode && (
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <Label>{t("apps.control-panels.shaderEffect")}</Label>
                      <Label className="text-[11px] text-neutral-600 font-geneva-12">
                        {t("apps.control-panels.shaderEffectDescription")}
                      </Label>
                    </div>
                    <Switch
                      checked={shaderEffectEnabled}
                      onCheckedChange={setShaderEffectEnabled}
                      className="data-[state=checked]:bg-[#000000]"
                    />
                  </div>
                )}

                {isAdmin && debugMode && (
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <Label>{t("apps.control-panels.aiModel")}</Label>
                      <Label className="text-[11px] text-neutral-600 font-geneva-12">
                        {t("apps.control-panels.aiModelDescription")}
                      </Label>
                    </div>
                    <Select
                      value={aiModel || "__null__"}
                      onValueChange={(value) =>
                        setAiModel(
                          value === "__null__" ? null : (value as AIModel)
                        )
                      }
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder={t("apps.control-panels.select")}>
                          {aiModel || t("apps.control-panels.select")}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__null__">
                          {t("apps.control-panels.default")}
                        </SelectItem>
                        {AI_MODELS.map((model) => (
                          <SelectItem key={model.id} value={model.id as string}>
                            {model.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {isAdmin && debugMode && (
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <Label>{t("apps.control-panels.ttsModel")}</Label>
                      <Label className="text-[11px] text-neutral-600 font-geneva-12">
                        {t("apps.control-panels.ttsModelDescription")}
                      </Label>
                    </div>
                    <Select
                      value={ttsModel || "__null__"}
                      onValueChange={(value) =>
                        setTtsModel(
                          value === "__null__"
                            ? null
                            : (value as "openai" | "elevenlabs")
                        )
                      }
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder={t("apps.control-panels.select")}>
                          {ttsModel || t("apps.control-panels.select")}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__null__">
                          {t("apps.control-panels.default")}
                        </SelectItem>
                        <SelectItem value="openai">
                          {t("apps.control-panels.openai")}
                        </SelectItem>
                        <SelectItem value="elevenlabs">
                          {t("apps.control-panels.elevenlabs")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {isAdmin && debugMode && ttsModel && (
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <Label>{t("apps.control-panels.ttsVoice")}</Label>
                      <Label className="text-[11px] text-neutral-600 font-geneva-12">
                        {ttsModel === "elevenlabs"
                          ? t("apps.control-panels.elevenlabsVoiceId")
                          : t("apps.control-panels.openaiVoice")}
                      </Label>
                    </div>
                    {ttsModel === "elevenlabs" ? (
                      <Select
                        value={ttsVoice || "__null__"}
                        onValueChange={(value) =>
                          setTtsVoice(value === "__null__" ? null : value)
                        }
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue placeholder={t("apps.control-panels.select")}>
                            {ttsVoice === "YC3iw27qriLq7UUaqAyi"
                              ? "Ryo v3"
                              : ttsVoice === "kAyjEabBEu68HYYYRAHR"
                              ? "Ryo v2"
                              : ttsVoice === "G0mlS0y8ByHjGAOxBgvV"
                              ? "Ryo"
                              : t("apps.control-panels.select")}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__null__">
                            {t("apps.control-panels.select")}
                          </SelectItem>
                          <SelectItem value="YC3iw27qriLq7UUaqAyi">
                            Ryo v3
                          </SelectItem>
                          <SelectItem value="kAyjEabBEu68HYYYRAHR">
                            Ryo v2
                          </SelectItem>
                          <SelectItem value="G0mlS0y8ByHjGAOxBgvV">
                            Ryo
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select
                        value={ttsVoice || "__null__"}
                        onValueChange={(value) =>
                          setTtsVoice(value === "__null__" ? null : value)
                        }
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue placeholder={t("apps.control-panels.select")}>
                            {ttsVoice || t("apps.control-panels.select")}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__null__">
                            {t("apps.control-panels.select")}
                          </SelectItem>
                          <SelectItem value="alloy">Alloy</SelectItem>
                          <SelectItem value="echo">Echo</SelectItem>
                          <SelectItem value="fable">Fable</SelectItem>
                          <SelectItem value="onyx">Onyx</SelectItem>
                          <SelectItem value="nova">Nova</SelectItem>
                          <SelectItem value="shimmer">Shimmer</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}

                {isAdmin && debugMode && (
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <Label>{t("apps.control-panels.bootScreen")}</Label>
                      <Label className="text-[11px] text-neutral-600 font-geneva-12">
                        {t("apps.control-panels.bootScreenDescription")}
                      </Label>
                    </div>
                    <Button
                      variant="retro"
                      onClick={handleShowBootScreen}
                      className="w-fit"
                    >
                      {t("apps.control-panels.show")}
                    </Button>
                  </div>
                )}

                {isAdmin && debugMode && (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col gap-1">
                      <Label>{t("apps.control-panels.errorBoundaries")}</Label>
                      <Label className="text-[11px] text-neutral-600 font-geneva-12">
                        {t("apps.control-panels.errorBoundariesDescription")}
                      </Label>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="retro"
                        onClick={handleTriggerAppCrashTest}
                        className="flex-1"
                      >
                        {t("apps.control-panels.crashApp")}
                      </Button>
                      <Button
                        variant="retro"
                        onClick={handleTriggerDesktopCrashTest}
                        className="flex-1"
                      >
                        {t("apps.control-panels.crashDesktop")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </ThemedTabsContent>
          </Tabs>
        </div>

        <HelpDialog
          isOpen={isHelpDialogOpen}
          onOpenChange={setIsHelpDialogOpen}
          helpItems={translatedHelpItems}
          appId="control-panels"
        />
        <AboutDialog
          isOpen={isAboutDialogOpen}
          onOpenChange={setIsAboutDialogOpen}
          metadata={appMetadata}
          appId="control-panels"
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
        {/* Sign Up Dialog (was SetUsernameDialog) */}
        <LoginDialog
          initialTab="signup"
          isOpen={isUsernameDialogOpen}
          onOpenChange={setIsUsernameDialogOpen}
          /* Login props (inactive) */
          usernameInput={verifyUsernameInput}
          onUsernameInputChange={setVerifyUsernameInput}
          passwordInput={verifyPasswordInput}
          onPasswordInputChange={setVerifyPasswordInput}
          onLoginSubmit={async () => {
            await handleVerifyTokenSubmit(verifyPasswordInput, true);
          }}
          isLoginLoading={isVerifyingToken}
          loginError={verifyError}
          /* Sign Up props */
          newUsername={newUsername}
          onNewUsernameChange={setNewUsername}
          newPassword={newPassword}
          onNewPasswordChange={setNewPassword}
          onSignUpSubmit={submitUsernameDialog}
          isSignUpLoading={isSettingUsername}
          signUpError={usernameError}
        />

        {/* Log In Dialog */}
        <LoginDialog
          isOpen={isVerifyDialogOpen}
          onOpenChange={setVerifyDialogOpen}
          /* Login props */
          usernameInput={verifyUsernameInput}
          onUsernameInputChange={setVerifyUsernameInput}
          passwordInput={verifyPasswordInput}
          onPasswordInputChange={setVerifyPasswordInput}
          onLoginSubmit={async () => {
            await handleVerifyTokenSubmit(verifyPasswordInput, true);
          }}
          isLoginLoading={isVerifyingToken}
          loginError={verifyError}
          /* Sign Up props (inactive) */
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
        <InputDialog
          isOpen={isPasswordDialogOpen}
          onOpenChange={setIsPasswordDialogOpen}
          onSubmit={handleSetPassword}
          title={t("apps.control-panels.setPasswordDialog.title")}
          description={t("apps.control-panels.setPasswordDialog.description")}
          value={passwordInput}
          onChange={(value) => {
            setPasswordInput(value);
            setPasswordError(null);
          }}
          isLoading={isSettingPassword}
          errorMessage={passwordError}
          submitLabel={t("apps.control-panels.setPasswordDialog.submitLabel")}
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
        {/* Cloud Restore Confirmation */}
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
        <TelegramLinkDialog
          isOpen={isTelegramDialogOpen}
          onClose={() => setIsTelegramDialogOpen(false)}
          linkedAccount={telegramLinkedAccount}
          linkSession={telegramLinkSession}
          isStatusLoading={isTelegramStatusLoading}
          isCreatingLink={isCreatingTelegramLink}
          isDisconnectingLink={isDisconnectingTelegramLink}
          onCreateLink={handleCreateTelegramLink}
          onOpenTelegramLink={handleOpenTelegramLink}
          onCopyTelegramCode={handleCopyTelegramCode}
          onDisconnectTelegramLink={handleDisconnectTelegramLink}
        />
      </WindowFrame>
    </>
  );
}
