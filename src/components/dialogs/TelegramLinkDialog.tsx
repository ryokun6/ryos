import React from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import type {
  TelegramHeartbeatSettings,
  TelegramLinkSession,
  TelegramLinkedAccount,
} from "@/api/telegram";
import { getTelegramLinkedAccountLabel } from "@/hooks/useTelegramLink";
import { ArrowRight, PaperPlaneRight } from "@phosphor-icons/react";

interface TelegramLinkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  linkedAccount: TelegramLinkedAccount | null;
  linkSession: TelegramLinkSession | null;
  isStatusLoading: boolean;
  isCreatingLink: boolean;
  isDisconnectingLink: boolean;
  heartbeatSettings: TelegramHeartbeatSettings;
  isSavingHeartbeatSettings: boolean;
  onCreateLink: () => void;
  onOpenTelegramLink: () => void;
  onCopyTelegramCode: () => void;
  onDisconnectTelegramLink: () => void;
  onSaveHeartbeatInstructions: (instructions: string) => Promise<boolean>;
}

export function TelegramLinkDialog({
  isOpen,
  onClose,
  linkedAccount,
  linkSession,
  isStatusLoading,
  isCreatingLink,
  isDisconnectingLink,
  heartbeatSettings,
  isSavingHeartbeatSettings,
  onCreateLink,
  onOpenTelegramLink,
  onCopyTelegramCode,
  onDisconnectTelegramLink,
  onSaveHeartbeatInstructions,
}: TelegramLinkDialogProps) {
  const { t } = useTranslation();
  const {
    isWindowsTheme,
    isMacOSTheme,
    isWinXp,
  } = useThemeFlags();

  const linkedAccountLabel = linkedAccount
    ? getTelegramLinkedAccountLabel(linkedAccount)
    : null;
  const [heartbeatInstructionsDraft, setHeartbeatInstructionsDraft] =
    React.useState(heartbeatSettings.instructions);
  const shouldShowLinkSession = !linkedAccount && !!linkSession;
  const hasDeepLink = shouldShowLinkSession && !!linkSession?.deepLink;
  const stackedActionButtonClass = "h-7 w-full shrink-0 sm:w-auto sm:flex-1";
  const normalizedHeartbeatInstructionsDraft = heartbeatInstructionsDraft.trim();
  const hasHeartbeatInstructionsChanges =
    heartbeatInstructionsDraft !== heartbeatSettings.instructions;

  React.useEffect(() => {
    if (isOpen) {
      setHeartbeatInstructionsDraft(heartbeatSettings.instructions);
    }
  }, [heartbeatSettings.instructions, isOpen]);

  const handleSaveHeartbeatInstructions = async () => {
    const didSave = await onSaveHeartbeatInstructions(heartbeatInstructionsDraft);
    if (didSave) {
      setHeartbeatInstructionsDraft(normalizedHeartbeatInstructionsDraft);
    }
  };

  const handleResetHeartbeatInstructions = async () => {
    const didSave = await onSaveHeartbeatInstructions("");
    if (didSave) {
      setHeartbeatInstructionsDraft("");
    }
  };

  const descriptionText = linkedAccount
    ? t("apps.control-panels.telegram.linkedAs", {
        account: linkedAccountLabel,
      })
    : shouldShowLinkSession
      ? hasDeepLink
        ? t("apps.control-panels.telegram.instructionsDeepLink")
        : t("apps.control-panels.telegram.instructionsCodeOnly")
      : isStatusLoading
        ? t("apps.control-panels.telegram.checking")
        : t("apps.control-panels.telegram.description");

  const telegramIconPreview = (
    <div className="flex items-center justify-center gap-2">
      <img
        src="/icons/mac-192.png"
        alt="ryOS"
        className="size-8 shrink-0 object-contain"
      />
      <ArrowRight size={14} weight="bold" className="shrink-0 text-black/45" />
      <div className="flex size-8 items-center justify-center rounded-full bg-[#229ED9] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_1px_2px_rgba(0,0,0,0.18)]">
        <PaperPlaneRight size={16} weight="fill" />
      </div>
    </div>
  );

  const previewContent = isStatusLoading && !shouldShowLinkSession ? (
    <div className="flex size-32 items-center justify-center rounded bg-neutral-100">
      <p
        className={cn(
          "text-neutral-500",
          isWindowsTheme
            ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[10px]"
            : "font-geneva-12 text-[10px]"
        )}
        style={{
          fontFamily: isWindowsTheme
            ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
            : undefined,
          fontSize: isWindowsTheme ? "10px" : undefined,
        }}
      >
        {t("common.dialog.share.generating")}
      </p>
    </div>
  ) : telegramIconPreview;

  const dialogContent = (
    <div className="w-full p-3">
      <div className="flex w-full flex-col items-center space-y-3">
        {previewContent ? previewContent : null}
        <p
          className={cn(
            "mt-0 mb-2 w-[80%] break-words text-center text-neutral-500",
            isWindowsTheme
              ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[10px]"
              : "font-geneva-12 text-xs"
          )}
          style={{
            fontFamily: isWindowsTheme
              ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
              : undefined,
            fontSize: isWindowsTheme ? "10px" : undefined,
          }}
        >
          {descriptionText}
        </p>
      </div>

      {linkedAccount ? (
        <div className="mt-1 space-y-2 rounded-os border-[length:var(--os-metrics-border-width)] border-os-input-border bg-os-panel-bg p-2 text-os-text-primary">
          <div className="space-y-1">
            <label
              htmlFor="telegram-heartbeat-instructions"
              className={cn(
                "block",
                isWindowsTheme
                  ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[10px]"
                  : "font-geneva-12 text-[11px]"
              )}
            >
              {t("apps.control-panels.telegram.heartbeatInstructionsLabel")}
            </label>
            <p
              className={cn(
                "text-os-text-secondary",
                isWindowsTheme
                  ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[9px]"
                  : "font-geneva-12 text-[10px]"
              )}
            >
              {t("apps.control-panels.telegram.heartbeatInstructionsDescription")}
            </p>
          </div>
          <textarea
            id="telegram-heartbeat-instructions"
            value={heartbeatInstructionsDraft}
            onChange={(event) =>
              setHeartbeatInstructionsDraft(event.currentTarget.value.slice(0, 1200))
            }
            placeholder={t(
              "apps.control-panels.telegram.heartbeatInstructionsPlaceholder"
            )}
            maxLength={1200}
            rows={5}
            className={cn(
              "w-full resize-none rounded-os border-[length:var(--os-metrics-border-width)] border-os-input-border bg-os-input-bg p-2 text-os-text-primary shadow-inner outline-none focus:border-os-input-focusBorder",
              isWindowsTheme
                ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[10px]"
                : "font-geneva-12 text-[11px]"
            )}
          />
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "text-os-text-secondary",
                isWindowsTheme
                  ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[9px]"
                  : "font-geneva-12 text-[10px]"
              )}
            >
              {heartbeatInstructionsDraft.length}/1200
            </span>
            <div className="flex gap-1">
              <Button
                onClick={handleResetHeartbeatInstructions}
                disabled={
                  isSavingHeartbeatSettings ||
                  (!heartbeatSettings.instructions && !heartbeatInstructionsDraft)
                }
                variant="retro"
                className={cn(
                  "h-7",
                  isWindowsTheme
                    ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                    : "font-geneva-12 text-[12px]"
                )}
              >
                {t("apps.control-panels.telegram.resetInstructions")}
              </Button>
              <Button
                onClick={handleSaveHeartbeatInstructions}
                disabled={
                  isSavingHeartbeatSettings || !hasHeartbeatInstructionsChanges
                }
                variant="retro"
                className={cn(
                  "h-7",
                  isWindowsTheme
                    ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                    : "font-geneva-12 text-[12px]"
                )}
              >
                {isSavingHeartbeatSettings
                  ? t("apps.control-panels.telegram.savingInstructions")
                  : t("apps.control-panels.telegram.saveInstructions")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <DialogFooter className="mt-2 flex justify-end gap-1">
        {linkedAccount ? (
          <Button
            onClick={onDisconnectTelegramLink}
            disabled={isDisconnectingLink}
            variant="retro"
            className={cn(
              "h-7 w-full",
              isWindowsTheme
                ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                : "font-geneva-12 text-[12px]"
            )}
            style={{
              fontFamily: isWindowsTheme
                ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                : undefined,
              fontSize: isWindowsTheme ? "11px" : undefined,
            }}
          >
            {isDisconnectingLink
              ? t("apps.control-panels.telegram.disconnecting")
              : t("apps.control-panels.telegram.disconnect")}
          </Button>
        ) : shouldShowLinkSession ? (
          <>
            {hasDeepLink ? (
              <Button
                onClick={onOpenTelegramLink}
                variant="retro"
                className={cn(
                  stackedActionButtonClass,
                  isWindowsTheme
                    ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                    : "font-geneva-12 text-[12px]"
                )}
                style={{
                  fontFamily: isWindowsTheme
                    ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                    : undefined,
                  fontSize: isWindowsTheme ? "11px" : undefined,
                }}
              >
                {t("apps.control-panels.telegram.openTelegram")}
              </Button>
            ) : null}
            <Button
              onClick={onCopyTelegramCode}
              variant="retro"
              className={cn(
                hasDeepLink ? stackedActionButtonClass : "h-7 w-full",
                isWindowsTheme
                  ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                  : "font-geneva-12 text-[12px]"
              )}
              style={{
                fontFamily: isWindowsTheme
                  ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                  : undefined,
                fontSize: isWindowsTheme ? "11px" : undefined,
              }}
            >
              {t("apps.control-panels.telegram.copyCode")}
            </Button>
          </>
        ) : (
          <Button
            onClick={onCreateLink}
            disabled={isCreatingLink || isStatusLoading}
            variant="retro"
            className={cn(
              "h-7 w-full",
              isWindowsTheme
                ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                : "font-geneva-12 text-[12px]"
            )}
            style={{
              fontFamily: isWindowsTheme
                ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                : undefined,
              fontSize: isWindowsTheme ? "11px" : undefined,
            }}
          >
            {isCreatingLink
              ? t("apps.control-panels.telegram.preparing")
              : t("apps.control-panels.telegram.connect")}
          </Button>
        )}
      </DialogFooter>
    </div>
  );

  if (isWindowsTheme) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className={cn("window max-w-sm overflow-hidden border-0 p-0")}
          style={{ fontSize: "11px" }}
          onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
        >
          <div
            className="title-bar"
            style={isWinXp ? { minHeight: "30px" } : undefined}
          >
            <div className="title-bar-text">
              {t("apps.control-panels.telegram.title")}
            </div>
            <div className="title-bar-controls">
              <button
                aria-label={t("common.menu.close")}
                data-action="close"
                onClick={onClose}
              />
            </div>
          </div>
          <div className="window-body">{dialogContent}</div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-sm rounded-os border-[length:var(--os-metrics-border-width)] border-os-window bg-os-window-bg shadow-os-window"
        onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
      >
        {isMacOSTheme ? (
          <>
            <DialogTitle className="sr-only">
              {t("apps.control-panels.telegram.title")}
            </DialogTitle>
            <DialogHeader>{t("apps.control-panels.telegram.title")}</DialogHeader>
            <DialogDescription className="sr-only">
              {t("apps.control-panels.telegram.description")}
            </DialogDescription>
          </>
        ) : (
          <DialogHeader>
            <DialogTitle className="text-[16px] font-normal">
              {t("apps.control-panels.telegram.title")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {t("apps.control-panels.telegram.description")}
            </DialogDescription>
          </DialogHeader>
        )}
        {dialogContent}
      </DialogContent>
    </Dialog>
  );
}
