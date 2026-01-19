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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    if (isMac) {
      fetch("/version.json", { cache: "no-store" })
        .then((res) => res.json())
        .then((data) => setDesktopVersion(data.desktopVersion))
        .catch(() => setDesktopVersion("1.0.1")); // fallback
    }
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
  } = useControlPanelsLogic({ initialData });

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
            {isWindowsLegacyTheme ? (
              <TabsList asChild>
                <menu
                  role="tablist"
                  className="h-7! flex justify-start! p-0 -mt-1 -mb-[2px] bg-transparent shadow-none /* Windows XP/98 tab strip */"
                >
                  <TabsTrigger value="appearance">
                    {t("apps.control-panels.appearance")}
                  </TabsTrigger>
                  <TabsTrigger value="sound">
                    {t("apps.control-panels.sound")}
                  </TabsTrigger>
                  <TabsTrigger value="system">
                    {t("apps.control-panels.system")}
                  </TabsTrigger>
                </menu>
              </TabsList>
            ) : (
              <TabsList className={tabStyles.tabListClasses}>
                <TabsTrigger
                  value="appearance"
                  className={tabStyles.tabTriggerClasses}
                >
                  {t("apps.control-panels.appearance")}
                </TabsTrigger>
                <TabsTrigger
                  value="sound"
                  className={tabStyles.tabTriggerClasses}
                >
                  {t("apps.control-panels.sound")}
                </TabsTrigger>
                <TabsTrigger
                  value="system"
                  className={tabStyles.tabTriggerClasses}
                >
                  {t("apps.control-panels.system")}
                </TabsTrigger>
              </TabsList>
            )}

            <TabsContent
              value="appearance"
              className={tabStyles.tabContentClasses}
            >
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
            </TabsContent>

            <TabsContent value="sound" className={tabStyles.tabContentClasses}>
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
            </TabsContent>

            <TabsContent value="system" className={tabStyles.tabContentClasses}>
              <div className="space-y-4 h-full overflow-y-auto p-4">
                {/* User Account Section */}
                <div className="space-y-2">
                  {username ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-[13px] font-geneva-12 font-medium">
                            @{username}
                          </span>
                          <span className="text-[11px] text-neutral-600 font-geneva-12">
                            {t("apps.control-panels.loggedInToRyOS")}
                          </span>
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

                {debugMode && (
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

                {debugMode && (
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

                {debugMode && (
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

                {debugMode && ttsModel && (
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

                {debugMode && (
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
              </div>
            </TabsContent>
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
          title="Set Password"
          description="Set a password to enable account recovery. You can use this password to get a new token if you lose access."
          value={passwordInput}
          onChange={(value) => {
            setPasswordInput(value);
            setPasswordError(null);
          }}
          isLoading={isSettingPassword}
          errorMessage={passwordError}
          submitLabel="Set Password"
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
      </WindowFrame>
    </>
  );
}
