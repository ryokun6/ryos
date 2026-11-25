import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { GoogleLogoIcon } from "@/components/shared/GoogleLogoIcon";
import { useGoogleSyncStoreShallow } from "@/stores/useGoogleSyncStore";
import {
  connectGoogleAccount,
  disableGoogleFeatureSync,
  disconnectGoogleAndCleanup,
  enableGoogleFeatureSync,
  refreshGoogleStatus,
  runGoogleCalendarSync,
  runGoogleContactsSync,
} from "@/sync/googleSyncEngine";

interface GoogleAccountDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GoogleAccountDialog({
  isOpen,
  onClose,
}: GoogleAccountDialogProps) {
  const { t } = useTranslation();
  const { isWindowsTheme, isMacOSTheme, isWinXp } = useThemeFlags();
  const {
    configured,
    linked,
    hasPassword,
    account,
    isStatusLoading,
    calendarSyncEnabled,
    contactsSyncEnabled,
    isSyncingCalendar,
    isSyncingContacts,
    lastCalendarSyncError,
    lastContactsSyncError,
  } = useGoogleSyncStoreShallow((s) => ({
    configured: s.configured,
    linked: s.linked,
    hasPassword: s.hasPassword,
    account: s.account,
    isStatusLoading: s.isStatusLoading,
    calendarSyncEnabled: s.calendarSyncEnabled,
    contactsSyncEnabled: s.contactsSyncEnabled,
    isSyncingCalendar: s.isSyncingCalendar,
    isSyncingContacts: s.isSyncingContacts,
    lastCalendarSyncError: s.lastCalendarSyncError,
    lastContactsSyncError: s.lastContactsSyncError,
  }));

  const [busyAction, setBusyAction] = useState<
    null | "connect" | "disconnect" | "calendar" | "contacts" | "syncNow"
  >(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLocalError(null);
      void refreshGoogleStatus();
    }
  }, [isOpen]);

  const themeFont = isWindowsTheme
    ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
    : "font-geneva-12 text-[12px]";
  const themeFontStyle: React.CSSProperties | undefined = isWindowsTheme
    ? {
        fontFamily: '"Pixelated MS Sans Serif", "ArkPixel", Arial',
        fontSize: "11px",
      }
    : undefined;

  const handleConnect = async () => {
    setBusyAction("connect");
    setLocalError(null);
    try {
      await connectGoogleAccount();
      toast.success(t("apps.control-panels.google.connectedToast"));
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : t("apps.control-panels.google.genericError")
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleCalendar = async (next: boolean) => {
    setLocalError(null);
    if (!next) {
      disableGoogleFeatureSync("calendar");
      return;
    }
    setBusyAction("calendar");
    try {
      const enabled = await enableGoogleFeatureSync("calendar");
      if (enabled) {
        toast.success(t("apps.control-panels.google.calendarSyncSyncedToast"));
      }
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : t("apps.control-panels.google.genericError")
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleContacts = async (next: boolean) => {
    setLocalError(null);
    if (!next) {
      disableGoogleFeatureSync("contacts");
      return;
    }
    setBusyAction("contacts");
    try {
      const enabled = await enableGoogleFeatureSync("contacts");
      if (enabled) {
        toast.success(t("apps.control-panels.google.contactsSyncSyncedToast"));
      }
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : t("apps.control-panels.google.genericError")
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleSyncNow = async () => {
    setBusyAction("syncNow");
    setLocalError(null);
    try {
      const tasks: Promise<unknown>[] = [];
      if (calendarSyncEnabled) {
        tasks.push(runGoogleCalendarSync({ mode: "incremental" }));
      }
      if (contactsSyncEnabled) {
        tasks.push(runGoogleContactsSync({ mode: "incremental" }));
      }
      await Promise.all(tasks);
      toast.success(t("apps.control-panels.google.syncedNowToast"));
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : t("apps.control-panels.google.genericError")
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleDisconnect = async () => {
    setBusyAction("disconnect");
    setLocalError(null);
    try {
      await disconnectGoogleAndCleanup();
      toast.success(t("apps.control-panels.google.disconnectedToast"));
      onClose();
    } catch (err) {
      setLocalError(
        err instanceof Error
          ? err.message
          : t("apps.control-panels.google.genericError")
      );
    } finally {
      setBusyAction(null);
    }
  };

  const formatSyncSubtitle = (
    enabled: boolean,
    isSyncing: boolean,
    lastSyncAt: number | string | null | undefined,
    errorMsg: string | null,
    idleDesc: string
  ) => {
    if (isSyncing) return t("apps.control-panels.google.syncing");
    if (errorMsg) return errorMsg;
    if (enabled && lastSyncAt) {
      return t("apps.control-panels.google.lastSyncedAt", {
        time: new Date(lastSyncAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      });
    }
    return idleDesc;
  };

  const headerPreview = (
    <div className="flex items-center justify-center gap-2">
      <img
        src="/icons/mac-192.png"
        alt="ryOS"
        className="size-8 shrink-0 object-contain"
      />
      <ArrowRight
        size={14}
        weight="bold"
        className="shrink-0 text-os-text-secondary"
      />
      {account?.picture ? (
        <img
          src={account.picture}
          alt={account.email || "Google"}
          referrerPolicy="no-referrer"
          className="size-8 shrink-0 rounded-full border border-os-input-border object-cover"
        />
      ) : (
        <div className="flex size-8 items-center justify-center rounded-full border border-os-input-border bg-white shadow-sm">
          <GoogleLogoIcon className="size-4" />
        </div>
      )}
    </div>
  );

  const descriptionText = !configured
    ? t("apps.control-panels.google.notConfigured")
    : linked && account
      ? t("apps.control-panels.google.linkedAs", { email: account.email })
      : isStatusLoading
        ? t("apps.control-panels.google.checking")
        : t("apps.control-panels.google.description");

  const dialogContent = (
    <div className="w-full p-3 space-y-3">
      <div className="flex w-full flex-col items-center space-y-2">
        {headerPreview}
        <p
          className={cn(
            "w-[88%] break-words text-center text-os-text-secondary",
            themeFont
          )}
          style={themeFontStyle}
        >
          {descriptionText}
        </p>
      </div>

      {linked && account ? (
        <div className="space-y-2.5 rounded-os border-[length:var(--os-metrics-border-width)] border-os-input-border bg-os-panel-bg p-2.5 text-os-text-primary">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div
                className={cn("font-medium text-os-text-primary", themeFont)}
                style={themeFontStyle}
              >
                {t("apps.control-panels.google.calendarSyncTitle")}
              </div>
              <div
                className={cn(
                  "truncate text-[11px]",
                  lastCalendarSyncError
                    ? "text-red-600"
                    : "text-os-text-secondary",
                  themeFont
                )}
                style={themeFontStyle}
              >
                {formatSyncSubtitle(
                  calendarSyncEnabled,
                  isSyncingCalendar,
                  account.calendarLastSyncedAt,
                  lastCalendarSyncError,
                  t("apps.control-panels.google.calendarSyncDescription")
                )}
              </div>
            </div>
            <Switch
              checked={calendarSyncEnabled}
              disabled={busyAction !== null || isSyncingCalendar}
              onCheckedChange={(checked) => void handleToggleCalendar(checked)}
            />
          </div>

          <div className="border-t border-os-separator pt-2.5 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div
                className={cn("font-medium text-os-text-primary", themeFont)}
                style={themeFontStyle}
              >
                {t("apps.control-panels.google.contactsSyncTitle")}
              </div>
              <div
                className={cn(
                  "truncate text-[11px]",
                  lastContactsSyncError
                    ? "text-red-600"
                    : "text-os-text-secondary",
                  themeFont
                )}
                style={themeFontStyle}
              >
                {formatSyncSubtitle(
                  contactsSyncEnabled,
                  isSyncingContacts,
                  account.contactsLastSyncedAt,
                  lastContactsSyncError,
                  t("apps.control-panels.google.contactsSyncDescription")
                )}
              </div>
            </div>
            <Switch
              checked={contactsSyncEnabled}
              disabled={busyAction !== null || isSyncingContacts}
              onCheckedChange={(checked) => void handleToggleContacts(checked)}
            />
          </div>

          {!hasPassword && (
            <p
              className={cn(
                "border-t border-os-separator pt-2 text-[11px] text-os-text-secondary",
                themeFont
              )}
              style={themeFontStyle}
            >
              {t("apps.control-panels.google.passwordRequiredToDisconnect")}
            </p>
          )}
        </div>
      ) : null}

      {localError && (
        <p
          className={cn("text-red-600", themeFont)}
          style={themeFontStyle}
          role="alert"
        >
          {localError}
        </p>
      )}

      <DialogFooter className="mt-2 flex flex-col-reverse gap-1.5 sm:flex-row sm:justify-between">
        {linked ? (
          <>
            <Button
              type="button"
              variant="retro"
              onClick={() => void handleDisconnect()}
              disabled={
                busyAction !== null ||
                !hasPassword ||
                isSyncingCalendar ||
                isSyncingContacts
              }
              className={cn("h-7 w-full sm:w-auto text-red-600", themeFont)}
              style={themeFontStyle}
            >
              {busyAction === "disconnect"
                ? t("apps.control-panels.google.disconnecting")
                : t("apps.control-panels.google.disconnect")}
            </Button>
            <div className="flex flex-col-reverse gap-1.5 sm:flex-row">
              {(calendarSyncEnabled || contactsSyncEnabled) && (
                <Button
                  type="button"
                  variant="retro"
                  onClick={() => void handleSyncNow()}
                  disabled={
                    busyAction !== null ||
                    isSyncingCalendar ||
                    isSyncingContacts
                  }
                  className={cn("h-7 w-full sm:w-auto", themeFont)}
                  style={themeFontStyle}
                >
                  {busyAction === "syncNow" ||
                  isSyncingCalendar ||
                  isSyncingContacts
                    ? t("apps.control-panels.google.syncing")
                    : t("apps.control-panels.google.syncNow")}
                </Button>
              )}
              <Button
                type="button"
                variant={isMacOSTheme ? "default" : "retro"}
                onClick={onClose}
                className={cn("h-7 w-full sm:w-auto", themeFont)}
                style={themeFontStyle}
              >
                {t("common.dialog.done")}
              </Button>
            </div>
          </>
        ) : (
          <Button
            type="button"
            variant="retro"
            onClick={() => void handleConnect()}
            disabled={!configured || busyAction !== null || isStatusLoading}
            className={cn("h-7 w-full", themeFont)}
            style={themeFontStyle}
          >
            {busyAction === "connect"
              ? t("apps.control-panels.google.connecting")
              : t("apps.control-panels.google.connect")}
          </Button>
        )}
      </DialogFooter>
    </div>
  );

  if (isWindowsTheme) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className="window max-w-sm overflow-hidden border-0 p-0"
          style={{ fontSize: "11px" }}
          onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
        >
          <DialogTitle className="sr-only">
            {t("apps.control-panels.google.title")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {descriptionText}
          </DialogDescription>
          <div
            className="title-bar"
            style={isWinXp ? { minHeight: "30px" } : undefined}
          >
            <div className="title-bar-text">
              {t("apps.control-panels.google.title")}
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
              {t("apps.control-panels.google.title")}
            </DialogTitle>
            <DialogHeader>{t("apps.control-panels.google.title")}</DialogHeader>
            <DialogDescription className="sr-only">
              {descriptionText}
            </DialogDescription>
          </>
        ) : (
          <DialogHeader>
            <DialogTitle className="text-[16px] font-normal">
              {t("apps.control-panels.google.title")}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {descriptionText}
            </DialogDescription>
          </DialogHeader>
        )}
        {dialogContent}
      </DialogContent>
    </Dialog>
  );
}
