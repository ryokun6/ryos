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
import { useGoogleSyncStore } from "@/stores/useGoogleSyncStore";
import { GoogleLogoIcon } from "@/components/shared/GoogleLogoIcon";

export function GoogleSyncPromptDialog() {
  const { t } = useTranslation();
  const { isWindowsTheme, isMacOSTheme, isWinXp } = useThemeFlags();
  const pending = useGoogleSyncStore((s) => s.pendingInitialSyncPrompt);
  const resolveInitialSyncPrompt = useGoogleSyncStore(
    (s) => s.resolveInitialSyncPrompt
  );

  const isOpen = pending !== null;
  const feature = pending?.feature ?? "calendar";
  const localCount = pending?.localCount ?? 0;

  const title =
    feature === "calendar"
      ? t("apps.control-panels.google.prompt.calendarTitle")
      : t("apps.control-panels.google.prompt.contactsTitle");

  const description =
    feature === "calendar"
      ? localCount > 0
        ? t("apps.control-panels.google.prompt.calendarDescriptionWithCount", {
            count: localCount,
          })
        : t("apps.control-panels.google.prompt.calendarDescriptionEmpty")
      : localCount > 0
        ? t("apps.control-panels.google.prompt.contactsDescriptionWithCount", {
            count: localCount,
          })
        : t("apps.control-panels.google.prompt.contactsDescriptionEmpty");

  const themeFont = isWindowsTheme
    ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
    : "font-geneva-12 text-[12px]";
  const themeFontStyle: React.CSSProperties | undefined = isWindowsTheme
    ? {
        fontFamily: '"Pixelated MS Sans Serif", "ArkPixel", Arial',
        fontSize: "11px",
      }
    : undefined;

  const handleClose = () => {
    resolveInitialSyncPrompt(null);
  };

  const body = (
    <div className={cn(isWindowsTheme ? "p-3 px-4" : "p-4 px-6", "space-y-3")}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-os border-[length:var(--os-metrics-border-width)] border-os-input-border bg-os-panel-bg">
          <GoogleLogoIcon className="size-4" />
        </div>
        <p
          className={cn("text-os-text-primary leading-relaxed", themeFont)}
          style={themeFontStyle}
        >
          {description}
        </p>
      </div>

      <div className="space-y-2 rounded-os border-[length:var(--os-metrics-border-width)] border-os-input-border bg-os-panel-bg p-2.5">
        <div className="space-y-0.5">
          <p
            className={cn("font-medium text-os-text-primary", themeFont)}
            style={themeFontStyle}
          >
            {t("apps.control-panels.google.prompt.mergeOptionTitle")}
          </p>
          <p
            className={cn("text-os-text-secondary text-[11px]", themeFont)}
            style={themeFontStyle}
          >
            {t("apps.control-panels.google.prompt.mergeOptionDesc")}
          </p>
        </div>
        <div className="border-t border-os-separator pt-2 space-y-0.5">
          <p
            className={cn("font-medium text-os-text-primary", themeFont)}
            style={themeFontStyle}
          >
            {t("apps.control-panels.google.prompt.discardOptionTitle")}
          </p>
          <p
            className={cn("text-os-text-secondary text-[11px]", themeFont)}
            style={themeFontStyle}
          >
            {t("apps.control-panels.google.prompt.discardOptionDesc")}
          </p>
        </div>
      </div>

      <DialogFooter className="mt-3 flex flex-col-reverse gap-1.5 sm:flex-row sm:justify-between">
        <Button
          type="button"
          variant={isMacOSTheme ? "secondary" : "retro"}
          onClick={handleClose}
          className={cn("h-7 w-full sm:w-auto", themeFont)}
          style={themeFontStyle}
        >
          {t("common.dialog.cancel")}
        </Button>
        <div className="flex flex-col-reverse gap-1.5 sm:flex-row">
          <Button
            type="button"
            variant="destructive"
            onClick={() => resolveInitialSyncPrompt("discard")}
            className={cn("h-7 w-full sm:w-auto", themeFont)}
            style={themeFontStyle}
          >
            {t("apps.control-panels.google.prompt.discardButton")}
          </Button>
          <Button
            type="button"
            variant={isMacOSTheme ? "default" : "retro"}
            onClick={() => resolveInitialSyncPrompt("merge")}
            className={cn("h-7 w-full sm:w-auto", themeFont)}
            style={themeFontStyle}
          >
            {t("apps.control-panels.google.prompt.mergeButton")}
          </Button>
        </div>
      </DialogFooter>
    </div>
  );

  if (isWindowsTheme) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent
          className="window max-w-[440px] overflow-hidden border-0 p-0"
          style={{ fontSize: "11px" }}
          onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
          <div
            className="title-bar"
            style={isWinXp ? { minHeight: "30px" } : undefined}
          >
            <div className="title-bar-text">{title}</div>
            <div className="title-bar-controls">
              <button
                aria-label={t("common.menu.close")}
                data-action="close"
                onClick={handleClose}
              />
            </div>
          </div>
          <div className="window-body">{body}</div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        className="max-w-[440px] rounded-os border-[length:var(--os-metrics-border-width)] border-os-window bg-os-window-bg shadow-os-window"
        onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
      >
        {isMacOSTheme ? (
          <>
            <DialogTitle className="sr-only">{title}</DialogTitle>
            <DialogHeader>{title}</DialogHeader>
            <DialogDescription className="sr-only">
              {description}
            </DialogDescription>
          </>
        ) : (
          <DialogHeader>
            <DialogTitle className="text-[16px] font-normal">{title}</DialogTitle>
            <DialogDescription className="sr-only">
              {description}
            </DialogDescription>
          </DialogHeader>
        )}
        {body}
      </DialogContent>
    </Dialog>
  );
}
