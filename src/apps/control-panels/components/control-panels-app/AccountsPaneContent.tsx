import { useState } from "react";
import { PaperPlaneRight } from "@phosphor-icons/react";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import type { AIModel } from "@/types/aiModels";
import type { AIModelInfo } from "@/types/aiModels";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getTelegramLinkedAccountLabel } from "@/hooks/useTelegramLink";
import type { LanguageCode } from "@/stores/useLanguageStore";
import type { RealtimeConnectionState } from "@/lib/pusherClient";
import type { Contact } from "@/utils/contacts";
import type { TelegramLinkedAccount } from "@/api/telegram";
import { cn } from "@/lib/utils";
import type { TabStyleConfig } from "@/utils/tabStyles";
import {
  SYSTEM_FONT_OPTIONS,
  THEME_DEFAULT_SYSTEM_FONT,
  type SystemFontId,
} from "@/themes/systemFonts";
import { controlPanelItemIconShell } from "./constants";
import { AccountProfileHeader } from "./AccountProfileHeader";
import { ControlPanelsPrefFormRow } from "./ControlPanelsPrefFormRow";
import {
  ELEVENLABS_TTS_VOICES,
  getTtsVoiceLabel,
  OPENAI_TTS_VOICES,
} from "./ttsVoiceOptions";
import { RecoveryEmailDialog } from "@/components/dialogs/RecoveryEmailDialog";
import type { EmailStatusResponse } from "@/shared/contracts/auth";
import { SecurityPaneContent } from "./SecurityPaneContent";
import type { ControlPanelPaneId } from "./controlPanelsCategories";

export type AccountsPaneContentProps = {
  t: (key: string, opts?: Record<string, unknown>) => string;
  tabStyles: TabStyleConfig;
  username: string | null;
  myContact: Contact | null;
  accountAvatarLabel: string;
  accountAvatarInitials: string;
  realtimeStatus: RealtimeConnectionState;
  accountJoinedAt?: number | null;
  locale: LanguageCode;
  debugMode: boolean;
  isAdmin: boolean;
  promptSetUsername: () => void;
  promptLogin: () => void;
  telegramLinkedAccount: TelegramLinkedAccount | null;
  openTelegramDialog: () => void;
  isTelegramStatusLoading: boolean;
  recoveryEmailStatus: EmailStatusResponse | null;
  isEmailStatusLoading: boolean;
  refreshRecoveryEmailStatus: () => Promise<EmailStatusResponse | null>;
  hasPassword: boolean | null;
  logout: () => void;
  handleLogoutAllDevices: () => void;
  isLoggingOutAllDevices: boolean;
  setPasswordInput: (value: string) => void;
  setPasswordError: (error: string | null) => void;
  setIsPasswordDialogOpen: (open: boolean) => void;
  setDebugMode: (enabled: boolean) => void;
  showResizers: boolean;
  setShowResizers: (enabled: boolean) => void;
  systemFont: SystemFontId;
  setSystemFont: (font: SystemFontId) => void;
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
  onNavigateToPane?: (paneId: ControlPanelPaneId) => void;
};

type AccountsPaneTab = "accounts" | "security" | "debug";

export function AccountsPaneContent({
  t,
  username,
  myContact,
  accountAvatarLabel,
  accountAvatarInitials,
  realtimeStatus,
  accountJoinedAt,
  locale,
  debugMode,
  isAdmin,
  promptSetUsername,
  promptLogin,
  telegramLinkedAccount,
  openTelegramDialog,
  isTelegramStatusLoading,
  recoveryEmailStatus,
  isEmailStatusLoading,
  refreshRecoveryEmailStatus,
  hasPassword,
  logout,
  handleLogoutAllDevices,
  isLoggingOutAllDevices,
  setPasswordInput,
  setPasswordError,
  setIsPasswordDialogOpen,
  setDebugMode,
  showResizers,
  setShowResizers,
  systemFont,
  setSystemFont,
  AI_MODELS,
  aiModel,
  setAiModel,
  ttsModel,
  setTtsModel,
  ttsVoice,
  setTtsVoice,
  handleShowBootScreen,
  handleTriggerAppCrashTest,
  handleTriggerDesktopCrashTest,
  onNavigateToPane,
}: AccountsPaneContentProps) {
  const [accountsTab, setAccountsTab] = useState<AccountsPaneTab>("accounts");
  const [isRecoveryEmailOpen, setIsRecoveryEmailOpen] = useState(false);
  const selectedSystemFont =
    SYSTEM_FONT_OPTIONS.find((option) => option.id === systemFont) ??
    SYSTEM_FONT_OPTIONS[0];

  const openRecoveryEmailDialog = async () => {
    await refreshRecoveryEmailStatus();
    setIsRecoveryEmailOpen(true);
  };

  const handleRecoveryEmailOpenChange = (open: boolean) => {
    setIsRecoveryEmailOpen(open);
    if (!open) {
      void refreshRecoveryEmailStatus();
    }
  };

  const emailSubtitle = (() => {
    if (!username) {
      return t("apps.control-panels.email.linkForRecovery");
    }
    if (isEmailStatusLoading && !recoveryEmailStatus) {
      return t("apps.control-panels.email.checking");
    }
    if (recoveryEmailStatus && !recoveryEmailStatus.emailConfigured) {
      return t("apps.control-panels.email.notAvailable");
    }
    if (recoveryEmailStatus?.hasEmail && recoveryEmailStatus.email) {
      return recoveryEmailStatus.emailVerified
        ? t("apps.control-panels.email.verifiedAs", {
            email: recoveryEmailStatus.email,
          })
        : t("apps.control-panels.email.unverifiedAs", {
            email: recoveryEmailStatus.email,
          });
    }
    return t("apps.control-panels.email.linkForRecovery");
  })();

  const emailActionLabel = (() => {
    if (recoveryEmailStatus?.hasEmail) {
      return recoveryEmailStatus.emailVerified
        ? t("apps.control-panels.email.manage")
        : t("apps.control-panels.email.verify");
    }
    return t("apps.control-panels.email.link");
  })();

  const isEmailActionDisabled =
    !username ||
    isEmailStatusLoading ||
    (recoveryEmailStatus !== null && !recoveryEmailStatus.emailConfigured);

  return (
    <div className="control-panels-pref-form control-panels-pref-form-tabbed h-full overflow-y-auto">
      <div className="control-panels-pref-tabbed">
        <div
          role="tablist"
          className="aqua-tab-bar control-panels-pref-tab-bar"
          aria-label={t("apps.control-panels.panes.accounts")}
        >
          <button
            type="button"
            role="tab"
            className="aqua-tab"
            data-state={accountsTab === "accounts" ? "active" : "inactive"}
            aria-selected={accountsTab === "accounts"}
            onClick={() => setAccountsTab("accounts")}
          >
            {t("apps.control-panels.accountsTabs.accounts")}
          </button>
          <button
            type="button"
            role="tab"
            className="aqua-tab"
            data-state={accountsTab === "security" ? "active" : "inactive"}
            aria-selected={accountsTab === "security"}
            onClick={() => setAccountsTab("security")}
          >
            {t("apps.control-panels.accountsTabs.security")}
          </button>
          {isAdmin && (
            <button
              type="button"
              role="tab"
              className="aqua-tab"
              data-state={accountsTab === "debug" ? "active" : "inactive"}
              aria-selected={accountsTab === "debug"}
              onClick={() => setAccountsTab("debug")}
            >
              {t("apps.control-panels.accountsTabs.debug")}
            </button>
          )}
        </div>
        <div className="control-panels-pref-well">
          <div
            role="tabpanel"
            className="control-panels-pref-tab-panel"
            hidden={accountsTab !== "accounts"}
            aria-hidden={accountsTab !== "accounts"}
          >
            <div className="control-panels-pref-form-section">
              <AccountProfileHeader
                t={t}
                username={username}
                myContact={myContact}
                accountAvatarLabel={accountAvatarLabel}
                accountAvatarInitials={accountAvatarInitials}
                realtimeStatus={realtimeStatus}
                accountJoinedAt={accountJoinedAt}
                locale={locale}
                promptSetUsername={promptSetUsername}
                promptLogin={promptLogin}
              />

              <div
                className={cn(
                  "flex items-center justify-between gap-3",
                  !username && "opacity-50"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <ThemedIcon
                    name="mail.png"
                    alt=""
                    className={cn(controlPanelItemIconShell, "object-contain")}
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13px] font-geneva-12 font-medium">
                      {t("apps.control-panels.email.title")}
                    </span>
                    <span className="text-[11px] text-neutral-600 font-geneva-12 truncate">
                      {emailSubtitle}
                    </span>
                  </div>
                </div>
                <Button
                  variant="retro"
                  onClick={() => void openRecoveryEmailDialog()}
                  disabled={isEmailActionDisabled}
                  className="h-7"
                >
                  {emailActionLabel}
                </Button>
              </div>

              <div
                className={cn(
                  "flex items-center justify-between gap-3",
                  !username && "opacity-50"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      controlPanelItemIconShell,
                      "rounded-full bg-[#229ED9] text-white flex items-center justify-center scale-90"
                    )}
                    aria-hidden="true"
                  >
                    <PaperPlaneRight
                      size={16}
                      weight="fill"
                      className="-rotate-[32deg] translate-x-[1px] -translate-y-[1px]"
                    />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13px] font-geneva-12 font-medium">
                      {t("apps.control-panels.telegram.title")}
                    </span>
                    <span className="text-[11px] text-neutral-600 font-geneva-12">
                      {username && telegramLinkedAccount
                        ? t("apps.control-panels.telegram.linkedAs", {
                            account: getTelegramLinkedAccountLabel(telegramLinkedAccount),
                          })
                        : t("apps.control-panels.telegram.description")}
                    </span>
                  </div>
                </div>
                <Button
                  variant="retro"
                  onClick={openTelegramDialog}
                  disabled={!username || isTelegramStatusLoading}
                  className="h-7"
                >
                  {telegramLinkedAccount
                    ? t("apps.control-panels.telegram.manage")
                    : t("apps.control-panels.telegram.link")}
                </Button>
              </div>

              <div
                className={cn(
                  "flex items-center justify-between gap-3",
                  !username && "opacity-50"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <ThemedIcon
                    name="cloud-sync.png"
                    alt=""
                    className={cn(controlPanelItemIconShell, "object-contain")}
                  />
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13px] font-geneva-12 font-medium">
                      {t("apps.control-panels.panes.dotMac")}
                    </span>
                    <span className="text-[11px] text-neutral-600 font-geneva-12">
                      {t("apps.control-panels.cloudSync.accountDescription")}
                    </span>
                  </div>
                </div>
                <Button
                  variant="retro"
                  onClick={() => onNavigateToPane?.("dot-mac")}
                  disabled={!username || !onNavigateToPane}
                  className="h-7"
                >
                  {t("apps.control-panels.setup")}
                </Button>
              </div>
            </div>
          </div>
          <div
            role="tabpanel"
            className="control-panels-pref-tab-panel"
            hidden={accountsTab !== "security"}
            aria-hidden={accountsTab !== "security"}
          >
            <SecurityPaneContent
              t={t}
              username={username}
              myContact={myContact}
              accountAvatarLabel={accountAvatarLabel}
              accountAvatarInitials={accountAvatarInitials}
              realtimeStatus={realtimeStatus}
              accountJoinedAt={accountJoinedAt}
              locale={locale}
              hasPassword={hasPassword}
              promptSetUsername={promptSetUsername}
              promptLogin={promptLogin}
              logout={logout}
              handleLogoutAllDevices={handleLogoutAllDevices}
              isLoggingOutAllDevices={isLoggingOutAllDevices}
              setPasswordInput={setPasswordInput}
              setPasswordError={setPasswordError}
              setIsPasswordDialogOpen={setIsPasswordDialogOpen}
            />
          </div>
          {isAdmin && (
            <div
              role="tabpanel"
              className="control-panels-pref-tab-panel"
              hidden={accountsTab !== "debug"}
              aria-hidden={accountsTab !== "debug"}
            >
              <div className="control-panels-pref-form-section">
                <ControlPanelsPrefFormRow
                  label={t("apps.control-panels.debugMode")}
                  description={t("apps.control-panels.debugModeDescription")}
                >
                  <Switch
                    checked={debugMode}
                    onCheckedChange={setDebugMode}
                    className="data-[state=checked]:bg-[#000000]"
                  />
                </ControlPanelsPrefFormRow>
                {debugMode && (
                  <>
                    <ControlPanelsPrefFormRow
                      label={t("apps.control-panels.showResizers")}
                      description={t("apps.control-panels.showResizersDescription")}
                    >
                      <Switch
                        checked={showResizers}
                        onCheckedChange={setShowResizers}
                        className="data-[state=checked]:bg-[#000000]"
                      />
                    </ControlPanelsPrefFormRow>
                    <ControlPanelsPrefFormRow
                      label={t("apps.control-panels.systemFont")}
                      description={t("apps.control-panels.systemFontDescription")}
                    >
                      <Select
                        value={systemFont}
                        onValueChange={(value) => setSystemFont(value as SystemFontId)}
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue placeholder={t("apps.control-panels.select")}>
                            {systemFont === THEME_DEFAULT_SYSTEM_FONT
                              ? t("apps.control-panels.systemFontThemeDefault")
                              : selectedSystemFont.label}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent className="system-font-select-content">
                          {SYSTEM_FONT_OPTIONS.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.id === THEME_DEFAULT_SYSTEM_FONT
                                ? t("apps.control-panels.systemFontThemeDefault")
                                : option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </ControlPanelsPrefFormRow>
                    <ControlPanelsPrefFormRow
                      label={t("apps.control-panels.aiModel")}
                      description={t("apps.control-panels.aiModelDescription")}
                    >
                      <Select
                        value={aiModel || "__null__"}
                        onValueChange={(value) =>
                          setAiModel(value === "__null__" ? null : (value as AIModel))
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
                    </ControlPanelsPrefFormRow>
                    <ControlPanelsPrefFormRow
                      label={t("apps.control-panels.ttsModel")}
                      description={t("apps.control-panels.ttsModelDescription")}
                    >
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
                    </ControlPanelsPrefFormRow>
                    {ttsModel && (
                      <ControlPanelsPrefFormRow
                        label={t("apps.control-panels.ttsVoice")}
                        description={
                          ttsModel === "elevenlabs"
                            ? t("apps.control-panels.elevenlabsVoiceId")
                            : t("apps.control-panels.openaiVoice")
                        }
                      >
                        {ttsModel === "elevenlabs" ? (
                          <Select
                            value={ttsVoice || "__null__"}
                            onValueChange={(value) =>
                              setTtsVoice(value === "__null__" ? null : value)
                            }
                          >
                            <SelectTrigger className="w-[120px]">
                              <SelectValue placeholder={t("apps.control-panels.select")}>
                                {getTtsVoiceLabel(
                                  t,
                                  "elevenlabs",
                                  ttsVoice,
                                  t("apps.control-panels.select")
                                )}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__null__">
                                {t("apps.control-panels.select")}
                              </SelectItem>
                              {ELEVENLABS_TTS_VOICES.map((voice) => (
                                <SelectItem key={voice.value} value={voice.value}>
                                  {t(voice.labelKey)}
                                </SelectItem>
                              ))}
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
                                {getTtsVoiceLabel(
                                  t,
                                  "openai",
                                  ttsVoice,
                                  t("apps.control-panels.select")
                                )}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__null__">
                                {t("apps.control-panels.select")}
                              </SelectItem>
                              {OPENAI_TTS_VOICES.map((voice) => (
                                <SelectItem key={voice.value} value={voice.value}>
                                  {t(voice.labelKey)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </ControlPanelsPrefFormRow>
                    )}
                    <ControlPanelsPrefFormRow
                      label={t("apps.control-panels.bootScreen")}
                      description={t("apps.control-panels.bootScreenDescription")}
                    >
                      <Button
                        variant="retro"
                        onClick={handleShowBootScreen}
                        className="w-fit"
                      >
                        {t("apps.control-panels.show")}
                      </Button>
                    </ControlPanelsPrefFormRow>
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
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <RecoveryEmailDialog
        isOpen={isRecoveryEmailOpen}
        onOpenChange={handleRecoveryEmailOpenChange}
      />
    </div>
  );
}
