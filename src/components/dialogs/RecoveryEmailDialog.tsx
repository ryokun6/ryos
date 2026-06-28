import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  getEmailStatus,
  setRecoveryEmail,
  verifyRecoveryEmail,
  removeRecoveryEmail,
} from "@/api/auth";
import type { EmailStatusResponse } from "@/shared/contracts/auth";
import { ApiRequestError } from "@/api/core";

interface RecoveryEmailDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefill the email field (e.g. an address entered during sign-up). */
  initialEmail?: string;
  /**
   * When true, automatically send a verification code to `initialEmail` on open
   * (used by the post-sign-up flow so the user lands directly on code entry).
   */
  autoSubmit?: boolean;
  /** Optional title override (e.g. "Verify Your Email" for the sign-up flow). */
  title?: string;
  /** Optional description override. */
  description?: string;
  /** Hide the "Remove" action (used by the sign-up verification flow). */
  hideRemove?: boolean;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RECOVERY_EMAIL_FORM_ID = "recovery-email-form";

export function RecoveryEmailDialog({
  isOpen,
  onOpenChange,
  initialEmail,
  autoSubmit = false,
  title: titleOverride,
  description: descriptionOverride,
  hideRemove = false,
}: RecoveryEmailDialogProps) {
  const { t } = useTranslation();
  const { isWindowsTheme, isMacOSTheme } = useThemeFlags();

  const [status, setStatus] = useState<EmailStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [pendingVerify, setPendingVerify] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = async (): Promise<EmailStatusResponse | null> => {
    setLoadingStatus(true);
    try {
      const data = await getEmailStatus();
      setStatus(data);
      // Surface an unverified pending email so the user can finish verifying.
      setPendingVerify(data.hasEmail && !data.emailVerified);
      return data;
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : t("apps.control-panels.recoveryEmail.genericError")
      );
      return null;
    } finally {
      setLoadingStatus(false);
    }
  };

  const themeFont = isWindowsTheme
    ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
    : "font-geneva-12 text-[12px]";
  const themeFontStyle: React.CSSProperties | undefined = isWindowsTheme
    ? {
        fontFamily: '"Pixelated MS Sans Serif", "ArkPixel", Arial',
        fontSize: "11px",
      }
    : undefined;

  const handleSendVerification = async (
    e?: React.FormEvent,
    emailOverride?: string
  ) => {
    e?.preventDefault();
    if (busy) return;
    const email = (emailOverride ?? emailInput).trim();
    if (!EMAIL_REGEX.test(email)) {
      setError(t("apps.control-panels.recoveryEmail.invalidEmail"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setRecoveryEmail({ email });
      toast.success(t("apps.control-panels.recoveryEmail.codeSentTitle"), {
        description: t("apps.control-panels.recoveryEmail.codeSentDescription"),
      });
      setCodeInput("");
      await refreshStatus();
      setPendingVerify(true);
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : t("apps.control-panels.recoveryEmail.genericError")
      );
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    if (!codeInput.trim()) {
      setError(t("apps.control-panels.recoveryEmail.codeRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await verifyRecoveryEmail({ code: codeInput.trim() });
      toast.success(t("apps.control-panels.recoveryEmail.verifiedToast"));
      setCodeInput("");
      setEmailInput("");
      await refreshStatus();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : t("apps.control-panels.recoveryEmail.genericError")
      );
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await removeRecoveryEmail();
      toast.success(t("apps.control-panels.recoveryEmail.removedToast"));
      setEmailInput("");
      setCodeInput("");
      await refreshStatus();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : t("apps.control-panels.recoveryEmail.genericError")
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const prefill = initialEmail?.trim() ?? "";
    setEmailInput(prefill);
    setCodeInput("");
    setError(null);
    setBusy(false);
    (async () => {
      const data = await refreshStatus();
      // Post-sign-up flow: if an email was provided and the server supports the
      // email channel, immediately send the verification code so the user lands
      // on code entry. Skip when an email is already on file/verified.
      if (
        autoSubmit &&
        prefill &&
        EMAIL_REGEX.test(prefill) &&
        data?.emailConfigured &&
        !data.hasEmail
      ) {
        await handleSendVerification(undefined, prefill);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const title = titleOverride ?? t("apps.control-panels.recoveryEmail.title");
  const description =
    descriptionOverride ?? t("apps.control-panels.recoveryEmail.description");
  const notConfigured = status && !status.emailConfigured;

  const content = (
    <div className="space-y-3">
      {status?.hasEmail && (
        <div className="space-y-1">
          <Label
            className={cn("text-neutral-700", themeFont)}
            style={themeFontStyle}
          >
            {t("apps.control-panels.recoveryEmail.currentLabel")}
          </Label>
          <div
            className={cn("flex items-center justify-between gap-2", themeFont)}
            style={themeFontStyle}
          >
            <span className="truncate">{status.email}</span>
            <span
              className={cn(
                "shrink-0 rounded px-1.5 py-0.5 text-[10px]",
                status.emailVerified
                  ? "bg-green-100 text-green-700"
                  : "bg-amber-100 text-amber-700"
              )}
            >
              {status.emailVerified
                ? t("apps.control-panels.recoveryEmail.verified")
                : t("apps.control-panels.recoveryEmail.unverified")}
            </span>
          </div>
        </div>
      )}

      {pendingVerify ? (
        <form
          id={RECOVERY_EMAIL_FORM_ID}
          onSubmit={handleVerify}
          className="space-y-2"
        >
          <Label
            className={cn("text-neutral-700", themeFont)}
            style={themeFontStyle}
          >
            {t("apps.control-panels.recoveryEmail.codeLabel")}
          </Label>
          <Input
            autoFocus
            inputMode="numeric"
            value={codeInput}
            onChange={(e) => {
              setCodeInput(e.target.value);
              setError(null);
            }}
            className={cn("shadow-none h-8", themeFont)}
            style={themeFontStyle}
            disabled={busy}
          />
        </form>
      ) : (
        <form
          id={RECOVERY_EMAIL_FORM_ID}
          onSubmit={handleSendVerification}
          className="space-y-2"
        >
          <Label
            className={cn("text-neutral-700", themeFont)}
            style={themeFontStyle}
          >
            {t("apps.control-panels.recoveryEmail.emailLabel")}
          </Label>
          <Input
            type="email"
            value={emailInput}
            onChange={(e) => {
              setEmailInput(e.target.value);
              setError(null);
            }}
            className={cn("shadow-none h-8", themeFont)}
            style={themeFontStyle}
            disabled={busy || !!notConfigured || loadingStatus}
          />
        </form>
      )}

      {notConfigured && (
        <p
          className={cn("text-neutral-500", themeFont)}
          style={themeFontStyle}
        >
          {t("apps.control-panels.recoveryEmail.notConfigured")}
        </p>
      )}

      {error && (
        <p
          className={cn("text-red-600", themeFont)}
          style={themeFontStyle}
          role="alert"
        >
          {error}
        </p>
      )}

      <DialogFooter className="mt-2 gap-1.5 sm:justify-between">
        {status?.hasEmail && !hideRemove ? (
          <Button
            type="button"
            variant="retro"
            onClick={handleRemove}
            disabled={busy}
            className={cn("h-7 w-full sm:w-auto text-red-600", themeFont)}
            style={themeFontStyle}
          >
            {busy
              ? t("apps.control-panels.recoveryEmail.removing")
              : t("apps.control-panels.recoveryEmail.remove")}
          </Button>
        ) : null}
        <div className="flex w-full flex-col-reverse gap-1.5 sm:ml-auto sm:w-auto sm:flex-row">
          <Button
            type="button"
            variant="retro"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className={cn("h-7 w-full sm:w-auto", themeFont)}
            style={themeFontStyle}
          >
            {t("common.dialog.cancel")}
          </Button>
          <Button
            type="submit"
            form={RECOVERY_EMAIL_FORM_ID}
            variant={isMacOSTheme ? "default" : "retro"}
            disabled={
              pendingVerify
                ? busy || !codeInput.trim()
                : busy || !!notConfigured || loadingStatus || !emailInput.trim()
            }
            className={cn("h-7 w-full sm:w-auto", themeFont)}
            style={themeFontStyle}
          >
            {pendingVerify
              ? busy
                ? t("apps.control-panels.recoveryEmail.verifying")
                : t("apps.control-panels.recoveryEmail.verify")
              : busy
                ? t("apps.control-panels.recoveryEmail.saving")
                : t("apps.control-panels.recoveryEmail.save")}
          </Button>
        </div>
      </DialogFooter>
    </div>
  );

  const body = (
    <div className={isWindowsTheme ? "p-2 px-4" : "p-4 px-6"}>
      <p
        className={cn("text-neutral-500 mb-3", themeFont)}
        style={themeFontStyle}
      >
        {description}
      </p>
      {content}
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("max-w-[420px]", isWindowsTheme && "p-0 overflow-hidden")}
        style={isWindowsTheme ? { fontSize: "11px" } : undefined}
        onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
      >
        {isWindowsTheme ? (
          <>
            <DialogTitle className="sr-only">{title}</DialogTitle>
            <DialogDescription className="sr-only">{description}</DialogDescription>
            <DialogHeader>{title}</DialogHeader>
            <div className="window-body">{body}</div>
          </>
        ) : isMacOSTheme ? (
          <>
            <DialogTitle className="sr-only">{title}</DialogTitle>
            <DialogDescription className="sr-only">{description}</DialogDescription>
            <DialogHeader>{title}</DialogHeader>
            {body}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-normal text-[16px]">{title}</DialogTitle>
              <DialogDescription className="sr-only">
                {description}
              </DialogDescription>
            </DialogHeader>
            {body}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
