import type { RefObject } from "react";
import type { ReactNode } from "react";
import type { Contact } from "@/utils/contacts";
import type { TelegramLinkedAccount } from "@/api/telegram";
import type { EmailStatusResponse } from "@/shared/contracts/auth";
import type { RealtimeConnectionState } from "@/lib/pusherClient";
import type { LanguageCode } from "@/stores/useLanguageStore";
import type { TimezonePreference } from "@/lib/timezoneConfig";
import type { OsThemeId } from "@/themes/types";
import type { AccentChrome, AccentId } from "@/themes/accents";
import type { TabStyleConfig } from "@/utils/tabStyles";
import {
  type ControlPanelPaneId,
} from "./controlPanelsCategories";
import { AppearancePaneContent } from "./AppearancePaneContent";
import { DesktopScreenSaverPaneContent } from "./DesktopScreenSaverPaneContent";
import { InternationalPaneContent } from "./InternationalPaneContent";
import { SecurityPaneContent } from "./SecurityPaneContent";
import { SoundPaneContent } from "./SoundPaneContent";
import { DisplaysPaneContent } from "./DisplaysPaneContent";
import { DotMacPaneContent } from "./DotMacPaneContent";
import { SharingPaneContent } from "./SharingPaneContent";
import { AccountsPaneContent } from "./AccountsPaneContent";
import { SoftwareUpdatePaneContent } from "./SoftwareUpdatePaneContent";
import type { AIModel } from "@/types/aiModels";
import type { AIModelInfo } from "@/types/aiModels";
import type { SyncAuditStatus } from "./syncUtils";

export type ControlPanelsMacPaneRendererProps = {
  paneId: ControlPanelPaneId;
  onNavigateToPane?: (paneId: ControlPanelPaneId) => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
  tabStyles: TabStyleConfig;
  currentTheme: OsThemeId;
  setTheme: (theme: OsThemeId) => void;
  aquaMaterial: "classic" | "glass";
  setAquaMaterial: (material: "classic" | "glass") => void;
  supportsDarkMode: boolean;
  darkModePreference: "system" | "light" | "dark";
  setDarkMode: (mode: "system" | "light" | "dark") => void;
  supportsAccent: boolean;
  accent: AccentId;
  accentChrome: AccentChrome | null;
  setAccent: (accent: AccentId) => void;
  wallpaperAccentColor: string | null;
  currentLanguage: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  timezone: TimezonePreference;
  setTimezone: (timezone: TimezonePreference) => void;
  uiSoundsEnabled: boolean;
  handleUISoundsChange: (enabled: boolean) => void;
  speechEnabled: boolean;
  handleSpeechChange: (enabled: boolean) => void;
  terminalSoundsEnabled: boolean;
  setTerminalSoundsEnabled: (enabled: boolean) => void;
  synthPreset: string;
  handleSynthPresetChange: (preset: string) => void;
  masterVolume: number;
  setMasterVolume: (volume: number) => void;
  setPrevMasterVolume: (volume: number) => void;
  handleMasterMuteToggle: () => void;
  uiVolume: number;
  setUiVolume: (volume: number) => void;
  setPrevUiVolume: (volume: number) => void;
  handleUiMuteToggle: () => void;
  speechVolume: number;
  setSpeechVolume: (volume: number) => void;
  setPrevSpeechVolume: (volume: number) => void;
  handleSpeechMuteToggle: () => void;
  chatSynthVolume: number;
  setChatSynthVolume: (volume: number) => void;
  setPrevChatSynthVolume: (volume: number) => void;
  handleChatSynthMuteToggle: () => void;
  ipodVolume: number;
  setIpodVolume: (volume: number) => void;
  setPrevIpodVolume: (volume: number) => void;
  handleIpodMuteToggle: () => void;
  isIOS: boolean;
  isMacOSTheme: boolean;
  username: string | null;
  promptSetUsername: () => void;
  promptLogin: () => void;
  autoSyncEnabled: boolean;
  setAutoSyncEnabled: (enabled: boolean) => void;
  isAutoSyncChecking: boolean;
  autoSyncLastCheckedAt: string | null;
  autoSyncLastError: string | null;
  autoSyncDomainStatus: Record<string, SyncAuditStatus>;
  syncFiles: boolean;
  syncSettings: boolean;
  syncCalendar: boolean;
  syncContacts: boolean;
  syncMaps: boolean;
  syncSongs: boolean;
  syncVideos: boolean;
  syncTv: boolean;
  syncStickies: boolean;
  syncBooks: boolean;
  setSyncFiles: (enabled: boolean) => void;
  setSyncSettings: (enabled: boolean) => void;
  setSyncCalendar: (enabled: boolean) => void;
  setSyncContacts: (enabled: boolean) => void;
  setSyncMaps: (enabled: boolean) => void;
  setSyncSongs: (enabled: boolean) => void;
  setSyncVideos: (enabled: boolean) => void;
  setSyncTv: (enabled: boolean) => void;
  setSyncStickies: (enabled: boolean) => void;
  setSyncBooks: (enabled: boolean) => void;
  isCloudForceSyncing: boolean;
  isCloudForceUploading: boolean;
  isCloudForceDownloading: boolean;
  setIsConfirmForceUploadOpen: (open: boolean) => void;
  setIsConfirmForceDownloadOpen: (open: boolean) => void;
  myContact: Contact | null;
  accountAvatarLabel: string;
  accountAvatarInitials: string;
  realtimeStatus: RealtimeConnectionState;
  accountJoinedAt?: number | null;
  debugMode: boolean;
  isAdmin: boolean;
  promptVerifyToken: () => void;
  setPasswordInput: (value: string) => void;
  setPasswordError: (error: string | null) => void;
  setIsPasswordDialogOpen: (open: boolean) => void;
  logout: () => void;
  handleLogoutAllDevices: () => void;
  isLoggingOutAllDevices: boolean;
  telegramLinkedAccount: TelegramLinkedAccount | null;
  openTelegramDialog: () => void;
  isTelegramStatusLoading: boolean;
  recoveryEmailStatus: EmailStatusResponse | null;
  isEmailStatusLoading: boolean;
  refreshRecoveryEmailStatus: () => Promise<EmailStatusResponse | null>;
  handleCheckForUpdates: () => void;
  handleBackup: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleRestore: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleResetAll: () => void;
  setIsConfirmFormatOpen: (open: boolean) => void;
  setDebugMode: (enabled: boolean) => void;
  showResizers: boolean;
  setShowResizers: (enabled: boolean) => void;
  shaderEffectEnabled: boolean;
  setShaderEffectEnabled: (enabled: boolean) => void;
  systemFont: import("@/themes/systemFonts").SystemFontId;
  setSystemFont: (font: import("@/themes/systemFonts").SystemFontId) => void;
  AI_MODELS: AIModelInfo[];
  aiModel: AIModel | null;
  setAiModel: (model: AIModel | null) => void;
  ttsModel: "openai" | "elevenlabs" | null;
  setTtsModel: (model: "openai" | "elevenlabs" | null) => void;
  ttsVoice: string | null;
  setTtsVoice: (voice: string | null) => void;
  handleShowBootScreen: () => void;
  handleTriggerAppCrashTest: () => void;
  handleTriggerDesktopCrashTest: () => void;
};

export function ControlPanelsMacPaneRenderer(
  props: ControlPanelsMacPaneRendererProps
): ReactNode {
  const { paneId, t } = props;

  switch (paneId) {
    case "appearance":
      return (
        <AppearancePaneContent
          t={t}
          currentTheme={props.currentTheme}
          setTheme={props.setTheme}
          aquaMaterial={props.aquaMaterial}
          setAquaMaterial={props.setAquaMaterial}
          supportsDarkMode={props.supportsDarkMode}
          darkModePreference={props.darkModePreference}
          setDarkMode={props.setDarkMode}
          supportsAccent={props.supportsAccent}
          accent={props.accent}
          accentChrome={props.accentChrome}
          setAccent={props.setAccent}
          wallpaperAccentColor={props.wallpaperAccentColor}
          tabStyles={props.tabStyles}
        />
      );
    case "desktop-screen-saver":
      return <DesktopScreenSaverPaneContent t={t} />;
    case "international":
      return (
        <InternationalPaneContent
          t={t}
          currentLanguage={props.currentLanguage}
          setLanguage={props.setLanguage}
          timezone={props.timezone}
          setTimezone={props.setTimezone}
        />
      );
    case "security":
      return (
        <SecurityPaneContent
          t={t}
          username={props.username}
          myContact={props.myContact}
          accountAvatarLabel={props.accountAvatarLabel}
          accountAvatarInitials={props.accountAvatarInitials}
          realtimeStatus={props.realtimeStatus}
          accountJoinedAt={props.accountJoinedAt}
          locale={props.currentLanguage}
          promptSetUsername={props.promptSetUsername}
          promptLogin={props.promptLogin}
          logout={props.logout}
          handleLogoutAllDevices={props.handleLogoutAllDevices}
          isLoggingOutAllDevices={props.isLoggingOutAllDevices}
          setPasswordInput={props.setPasswordInput}
          setPasswordError={props.setPasswordError}
          setIsPasswordDialogOpen={props.setIsPasswordDialogOpen}
        />
      );
    case "sound":
      return (
        <SoundPaneContent
          t={t}
          uiSoundsEnabled={props.uiSoundsEnabled}
          handleUISoundsChange={props.handleUISoundsChange}
          speechEnabled={props.speechEnabled}
          handleSpeechChange={props.handleSpeechChange}
          terminalSoundsEnabled={props.terminalSoundsEnabled}
          setTerminalSoundsEnabled={props.setTerminalSoundsEnabled}
          synthPreset={props.synthPreset}
          handleSynthPresetChange={props.handleSynthPresetChange}
          masterVolume={props.masterVolume}
          setMasterVolume={props.setMasterVolume}
          setPrevMasterVolume={props.setPrevMasterVolume}
          handleMasterMuteToggle={props.handleMasterMuteToggle}
          uiVolume={props.uiVolume}
          setUiVolume={props.setUiVolume}
          setPrevUiVolume={props.setPrevUiVolume}
          handleUiMuteToggle={props.handleUiMuteToggle}
          speechVolume={props.speechVolume}
          setSpeechVolume={props.setSpeechVolume}
          setPrevSpeechVolume={props.setPrevSpeechVolume}
          handleSpeechMuteToggle={props.handleSpeechMuteToggle}
          chatSynthVolume={props.chatSynthVolume}
          setChatSynthVolume={props.setChatSynthVolume}
          setPrevChatSynthVolume={props.setPrevChatSynthVolume}
          handleChatSynthMuteToggle={props.handleChatSynthMuteToggle}
          ipodVolume={props.ipodVolume}
          setIpodVolume={props.setIpodVolume}
          setPrevIpodVolume={props.setPrevIpodVolume}
          handleIpodMuteToggle={props.handleIpodMuteToggle}
          isIOS={props.isIOS}
        />
      );
    case "displays":
      return (
        <DisplaysPaneContent
          t={t}
          shaderEffectEnabled={props.shaderEffectEnabled}
          setShaderEffectEnabled={props.setShaderEffectEnabled}
        />
      );
    case "dot-mac":
      return (
        <DotMacPaneContent
          t={t}
          tabStyles={props.tabStyles}
          username={props.username}
          promptSetUsername={props.promptSetUsername}
          autoSyncEnabled={props.autoSyncEnabled}
          setAutoSyncEnabled={props.setAutoSyncEnabled}
          isAutoSyncChecking={props.isAutoSyncChecking}
          autoSyncLastCheckedAt={props.autoSyncLastCheckedAt}
          autoSyncLastError={props.autoSyncLastError}
          autoSyncDomainStatus={props.autoSyncDomainStatus}
          syncFiles={props.syncFiles}
          syncSettings={props.syncSettings}
          syncCalendar={props.syncCalendar}
          syncContacts={props.syncContacts}
          syncMaps={props.syncMaps}
          syncSongs={props.syncSongs}
          syncVideos={props.syncVideos}
          syncTv={props.syncTv}
          syncStickies={props.syncStickies}
          syncBooks={props.syncBooks}
          setSyncFiles={props.setSyncFiles}
          setSyncSettings={props.setSyncSettings}
          setSyncCalendar={props.setSyncCalendar}
          setSyncContacts={props.setSyncContacts}
          setSyncMaps={props.setSyncMaps}
          setSyncSongs={props.setSyncSongs}
          setSyncVideos={props.setSyncVideos}
          setSyncTv={props.setSyncTv}
          setSyncStickies={props.setSyncStickies}
          setSyncBooks={props.setSyncBooks}
          isCloudForceSyncing={props.isCloudForceSyncing}
          isCloudForceUploading={props.isCloudForceUploading}
          isCloudForceDownloading={props.isCloudForceDownloading}
          setIsConfirmForceUploadOpen={props.setIsConfirmForceUploadOpen}
          setIsConfirmForceDownloadOpen={props.setIsConfirmForceDownloadOpen}
        />
      );
    case "sharing":
      return (
        <SharingPaneContent
          t={t}
          handleBackup={props.handleBackup}
          fileInputRef={props.fileInputRef}
          handleRestore={props.handleRestore}
          handleResetAll={props.handleResetAll}
          setIsConfirmFormatOpen={props.setIsConfirmFormatOpen}
        />
      );
    case "accounts":
      return (
        <AccountsPaneContent
          t={t}
          tabStyles={props.tabStyles}
          username={props.username}
          myContact={props.myContact}
          accountAvatarLabel={props.accountAvatarLabel}
          accountAvatarInitials={props.accountAvatarInitials}
          realtimeStatus={props.realtimeStatus}
          accountJoinedAt={props.accountJoinedAt}
          locale={props.currentLanguage}
          debugMode={props.debugMode}
          isAdmin={props.isAdmin}
          promptSetUsername={props.promptSetUsername}
          promptLogin={props.promptLogin}
          telegramLinkedAccount={props.telegramLinkedAccount}
          openTelegramDialog={props.openTelegramDialog}
          isTelegramStatusLoading={props.isTelegramStatusLoading}
          recoveryEmailStatus={props.recoveryEmailStatus}
          isEmailStatusLoading={props.isEmailStatusLoading}
          refreshRecoveryEmailStatus={props.refreshRecoveryEmailStatus}
          logout={props.logout}
          handleLogoutAllDevices={props.handleLogoutAllDevices}
          isLoggingOutAllDevices={props.isLoggingOutAllDevices}
          setPasswordInput={props.setPasswordInput}
          setPasswordError={props.setPasswordError}
          setIsPasswordDialogOpen={props.setIsPasswordDialogOpen}
          setDebugMode={props.setDebugMode}
          showResizers={props.showResizers}
          setShowResizers={props.setShowResizers}
          systemFont={props.systemFont}
          setSystemFont={props.setSystemFont}
          AI_MODELS={props.AI_MODELS}
          aiModel={props.aiModel}
          setAiModel={props.setAiModel}
          ttsModel={props.ttsModel}
          setTtsModel={props.setTtsModel}
          ttsVoice={props.ttsVoice}
          setTtsVoice={props.setTtsVoice}
          handleShowBootScreen={props.handleShowBootScreen}
          handleTriggerAppCrashTest={props.handleTriggerAppCrashTest}
          handleTriggerDesktopCrashTest={props.handleTriggerDesktopCrashTest}
          onNavigateToPane={props.onNavigateToPane}
        />
      );
    case "software-update":
      return (
        <SoftwareUpdatePaneContent
          t={t}
          handleCheckForUpdates={props.handleCheckForUpdates}
        />
      );
    default:
      return null;
  }
}
