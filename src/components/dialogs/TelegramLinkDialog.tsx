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
  onCreateLink: () => void;
  onOpenTelegramLink: () => void;
  onCopyTelegramCode: () => void;
  onDisconnectTelegramLink: () => void;
}

export function TelegramLinkDialog({
  isOpen,
  onClose,
  linkedAccount,
  linkSession,
  isStatusLoading,
  isCreatingLink,
  isDisconnectingLink,
  onCreateLink,
  onOpenTelegramLink,
  onCopyTelegramCode,
  onDisconnectTelegramLink,
}: TelegramLinkDialogProps) {
  const { t } = useTranslation();
  const {
    isWindowsTheme: isXpTheme,
    isMacOSTheme: isMacOsxTheme,
    isWinXp,
  } = useThemeFlags();

  const linkedAccountLabel = linkedAccount
    ? getTelegramLinkedAccountLabel(linkedAccount)
    : null;
  const shouldShowLinkSession = !linkedAccount && !!linkSession;
  const hasDeepLink = shouldShowLinkSession && !!linkSession?.deepLink;
  const stackedActionButtonClass = "h-7 w-full shrink-0 sm:w-auto sm:flex-1";

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
        className="h-8 w-8 shrink-0 object-contain"
      />
      <ArrowRight size={14} weight="bold" className="shrink-0 text-black/45" />
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#229ED9] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_1px_2px_rgba(0,0,0,0.18)]">
        <PaperPlaneRight size={16} weight="fill" />
      </div>
    </div>
  );

  const previewContent = isStatusLoading && !shouldShowLinkSession ? (
    <div className="flex h-32 w-32 items-center justify-center rounded bg-gray-100">
      <p
        className={cn(
          "text-gray-500",
          isXpTheme
            ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[10px]"
            : "font-geneva-12 text-[10px]"
        )}
        style={{
          fontFamily: isXpTheme
            ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
            : undefined,
          fontSize: isXpTheme ? "10px" : undefined,
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
            isXpTheme
              ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[10px]"
              : "font-geneva-12 text-xs"
          )}
          style={{
            fontFamily: isXpTheme
              ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
              : undefined,
            fontSize: isXpTheme ? "10px" : undefined,
          }}
        >
          {descriptionText}
        </p>
      </div>

      <DialogFooter className="mt-2 flex justify-end gap-1">
        {linkedAccount ? (
          <Button
            onClick={onDisconnectTelegramLink}
            disabled={isDisconnectingLink}
            variant="retro"
            className={cn(
              "h-7 w-full",
              isXpTheme
                ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                : "font-geneva-12 text-[12px]"
            )}
            style={{
              fontFamily: isXpTheme
                ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                : undefined,
              fontSize: isXpTheme ? "11px" : undefined,
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
                  isXpTheme
                    ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                    : "font-geneva-12 text-[12px]"
                )}
                style={{
                  fontFamily: isXpTheme
                    ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                    : undefined,
                  fontSize: isXpTheme ? "11px" : undefined,
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
                isXpTheme
                  ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                  : "font-geneva-12 text-[12px]"
              )}
              style={{
                fontFamily: isXpTheme
                  ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                  : undefined,
                fontSize: isXpTheme ? "11px" : undefined,
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
              isXpTheme
                ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
                : "font-geneva-12 text-[12px]"
            )}
            style={{
              fontFamily: isXpTheme
                ? '"Pixelated MS Sans Serif", "ArkPixel", Arial'
                : undefined,
              fontSize: isXpTheme ? "11px" : undefined,
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

  if (isXpTheme) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className={cn("window max-w-xs overflow-hidden border-0 p-0")}
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
        className="max-w-xs rounded-os border-[length:var(--os-metrics-border-width)] border-os-window bg-os-window-bg shadow-os-window"
        onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
      >
        {isMacOsxTheme ? (
          <>
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
