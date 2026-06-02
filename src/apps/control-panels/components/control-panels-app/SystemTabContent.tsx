import type { RefObject } from "react";
import { PaperPlaneRight } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AIModel } from "@/types/aiModels";
import { getTelegramLinkedAccountLabel } from "@/hooks/useTelegramLink";
import type { RealtimeConnectionState } from "@/lib/pusherClient";
import type { Contact } from "@/utils/contacts";
import type { TelegramLinkedAccount } from "@/api/telegram";
import type { AIModelInfo } from "@/types/aiModels";
import { cn } from "@/lib/utils";
import type { TabStyleConfig } from "@/utils/tabStyles";
import {
  controlPanelItemIconShell,
  userAvatarInitialsTextShadow,
} from "./constants";
import { AccountActionsMenu } from "./AccountActionsMenu";
import { VersionDisplay } from "./VersionDisplay";

export type SystemTabContentProps = {
  t: (key: string, opts?: Record<string, unknown>) => string;
  tabStyles: TabStyleConfig;
  username: string | null;
  myContact: Contact | null;
  accountAvatarLabel: string;
  accountAvatarInitials: string;
  realtimeStatus: RealtimeConnectionState;
  debugMode: boolean;
  isAdmin: boolean;
  promptSetUsername: () => void;
  promptVerifyToken: () => void;
  hasPassword: boolean | null;
  setPasswordInput: (value: string) => void;
  setPasswordError: (error: string | null) => void;
  setIsPasswordDialogOpen: (open: boolean) => void;
  logout: () => void;
  handleLogoutAllDevices: () => void;
  isLoggingOutAllDevices: boolean;
  telegramLinkedAccount: TelegramLinkedAccount | null;
  openTelegramDialog: () => void;
  isTelegramStatusLoading: boolean;
  handleCheckForUpdates: () => void;
  handleBackup: () => void;
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleRestore: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleResetAll: () => void;
  setIsConfirmFormatOpen: (open: boolean) => void;
  setDebugMode: (enabled: boolean) => void;
  shaderEffectEnabled: boolean;
  setShaderEffectEnabled: (enabled: boolean) => void;
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

export function SystemTabContent({
  t,
  tabStyles,
  username,
  myContact,
  accountAvatarLabel,
  accountAvatarInitials,
  realtimeStatus,
  debugMode,
  isAdmin,
  promptSetUsername,
  promptVerifyToken,
  hasPassword,
  setPasswordInput,
  setPasswordError,
  setIsPasswordDialogOpen,
  logout,
  handleLogoutAllDevices,
  isLoggingOutAllDevices,
  telegramLinkedAccount,
  openTelegramDialog,
  isTelegramStatusLoading,
  handleCheckForUpdates,
  handleBackup,
  fileInputRef,
  handleRestore,
  handleResetAll,
  setIsConfirmFormatOpen,
  setDebugMode,
  shaderEffectEnabled,
  setShaderEffectEnabled,
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
}: SystemTabContentProps) {
  return (
    <div className="space-y-4 h-full overflow-y-auto p-4">
      <div className="space-y-2 pt-1">
        {username ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative shrink-0">
                  <div
                    className={cn(
                      controlPanelItemIconShell,
                      "rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)] flex items-center justify-center text-[11px] font-semibold text-white overflow-hidden"
                    )}
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
                        className="size-full object-contain"
                      />
                    ) : (
                      accountAvatarInitials
                    )}
                  </div>
                  <span
                    className={cn(
                      "absolute -bottom-px -right-px block size-[10px] rounded-full border-[1.5px] border-white",
                      realtimeStatus === "connected"
                        ? "bg-green-500"
                        : realtimeStatus === "connecting"
                          ? "bg-amber-400"
                          : "bg-neutral-400"
                    )}
                    title={
                      realtimeStatus === "connected"
                        ? t("apps.control-panels.connectionStatus.connected")
                        : realtimeStatus === "connecting"
                          ? t("apps.control-panels.connectionStatus.connecting")
                          : t("apps.control-panels.connectionStatus.disconnected")
                    }
                  />
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[13px] font-geneva-12 font-medium leading-tight truncate">
                    @{username}
                  </span>
                  <span className="text-[11px] text-neutral-600 font-geneva-12 leading-tight truncate">
                    {t("apps.control-panels.loggedInToRyOS")}
                  </span>
                </div>
              </div>
              <AccountActionsMenu
                t={t}
                hasPassword={hasPassword}
                debugMode={debugMode}
                isLoggingOutAllDevices={isLoggingOutAllDevices}
                setPasswordInput={setPasswordInput}
                setPasswordError={setPasswordError}
                setIsPasswordDialogOpen={setIsPasswordDialogOpen}
                logout={logout}
                handleLogoutAllDevices={handleLogoutAllDevices}
                promptVerifyToken={promptVerifyToken}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    controlPanelItemIconShell,
                    "flex items-center justify-center overflow-hidden"
                  )}
                >
                  <img
                    src="/apple-touch-icon.png"
                    alt={t("apps.control-panels.ryOSAccount")}
                    className="size-8 object-contain"
                  />
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[13px] font-geneva-12 font-medium leading-tight truncate">
                    {t("apps.control-panels.ryOSAccount")}
                  </span>
                  <span className="text-[11px] text-neutral-600 font-geneva-12 leading-tight truncate">
                    {t("apps.control-panels.loginToSendMessages")}
                  </span>
                </div>
              </div>
              <Button variant="retro" onClick={promptSetUsername} className="h-7">
                {t("apps.control-panels.login")}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
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
                "rounded-full bg-[#229ED9] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_1px_2px_rgba(0,0,0,0.18)] flex items-center justify-center"
              )}
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
                {username
                  ? telegramLinkedAccount
                    ? t("apps.control-panels.telegram.linkedAs", {
                        account: getTelegramLinkedAccountLabel(telegramLinkedAccount),
                      })
                    : t("apps.control-panels.telegram.description")
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
      </div>

      <hr className="my-4 border-t" style={tabStyles.separatorStyle} />

      <div className="space-y-2">
        <Button variant="retro" onClick={handleCheckForUpdates} className="w-full">
          {t("apps.control-panels.checkForUpdates")}
        </Button>
        <VersionDisplay />
      </div>

      <div className="space-y-2">
        <div className="flex gap-2">
          <Button variant="retro" onClick={handleBackup} className="flex-1">
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
        <Button variant="retro" onClick={handleResetAll} className="w-full">
          {t("apps.control-panels.resetAllSettings")}
        </Button>
        <p className="text-[11px] text-neutral-600 font-geneva-12">
          {t("apps.control-panels.resetAllSettingsDescription")}
        </p>
      </div>

      <div className="space-y-2">
        <Button
          variant="retro"
          onClick={() => setIsConfirmFormatOpen(true)}
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
          <hr className="my-4 border-t" style={tabStyles.separatorStyle} />
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
                value === "__null__" ? null : (value as "openai" | "elevenlabs")
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
              <SelectItem value="openai">{t("apps.control-panels.openai")}</SelectItem>
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
                <SelectItem value="YC3iw27qriLq7UUaqAyi">Ryo v3</SelectItem>
                <SelectItem value="kAyjEabBEu68HYYYRAHR">Ryo v2</SelectItem>
                <SelectItem value="G0mlS0y8ByHjGAOxBgvV">Ryo</SelectItem>
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
          <Button variant="retro" onClick={handleShowBootScreen} className="w-fit">
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
  );
}
