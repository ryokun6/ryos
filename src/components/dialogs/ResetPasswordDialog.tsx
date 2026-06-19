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
import { requestRecovery, resetPasswordWithCode } from "@/api/auth";
import type { RecoveryChannel } from "@/shared/contracts/auth";
import { useChatsStore } from "@/stores/useChatsStore";
import { ApiRequestError } from "@/api/core";
import { PASSWORD_MIN_LENGTH } from "@/shared/validation";
import { track, APP_ANALYTICS } from "@/utils/analytics";

interface ResetPasswordDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  defaultIdentifier?: string;
  /** Called after a successful reset (the user is now logged in). */
  onSuccess?: () => void;
}

type Step = "request" | "reset";

export function ResetPasswordDialog({
  isOpen,
  onOpenChange,
  defaultIdentifier = "",
  onSuccess,
}: ResetPasswordDialogProps) {
  const { t } = useTranslation();
  const { isWindowsTheme, isMacOSTheme } = useThemeFlags();

  const [step, setStep] = useState<Step>("request");
  const [identifier, setIdentifier] = useState(defaultIdentifier);
  const [channel, setChannel] = useState<RecoveryChannel>("telegram");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setStep("request");
      setIdentifier(defaultIdentifier);
      setChannel("telegram");
      setCode("");
      setNewPassword("");
      setConfirmPassword("");
      setIsBusy(false);
      setError(null);
    }
  }, [isOpen, defaultIdentifier]);

  const themeFont = isWindowsTheme
    ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
    : "font-geneva-12 text-[12px]";
  const themeFontStyle: React.CSSProperties | undefined = isWindowsTheme
    ? {
        fontFamily: '"Pixelated MS Sans Serif", "ArkPixel", Arial',
        fontSize: "11px",
      }
    : undefined;

  const handleSendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isBusy) return;
    if (!identifier.trim()) {
      setError(t("common.auth.recovery.identifierRequired"));
      return;
    }
    setIsBusy(true);
    setError(null);
    try {
      await requestRecovery({ identifier: identifier.trim(), channel });
      toast.success(t("common.auth.recovery.codeSent"));
      setStep("reset");
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : t("common.auth.recovery.genericError")
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleReset = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isBusy) return;
    if (!code.trim()) {
      setError(t("common.auth.recovery.codeRequired"));
      return;
    }
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      setError(t("common.auth.recovery.tooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("common.auth.recovery.mismatch"));
      return;
    }

    setIsBusy(true);
    setError(null);
    try {
      const result = await resetPasswordWithCode({
        identifier: identifier.trim(),
        code: code.trim(),
        newPassword,
      });
      const store = useChatsStore.getState();
      store.setUsername(result.username);
      store.setAuthenticated(true);
      track(APP_ANALYTICS.USER_LOGIN_PASSWORD, { username: result.username });
      toast.success(t("common.auth.recovery.successTitle"), {
        description: t("common.auth.recovery.successDescription"),
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      setError(
        err instanceof ApiRequestError
          ? err.message
          : t("common.auth.recovery.genericError")
      );
    } finally {
      setIsBusy(false);
    }
  };

  const channelButton = (value: RecoveryChannel, label: string) => (
    <Button
      type="button"
      variant="retro"
      onClick={() => setChannel(value)}
      className={cn(
        "h-7 flex-1",
        channel === value && "ring-2 ring-offset-1 ring-neutral-500",
        themeFont
      )}
      style={themeFontStyle}
      disabled={isBusy}
    >
      {label}
    </Button>
  );

  const requestForm = (
    <form onSubmit={handleSendCode} className="space-y-3">
      <div className="space-y-2">
        <Label className={cn("text-neutral-700", themeFont)} style={themeFontStyle}>
          {t("common.auth.recovery.identifier")}
        </Label>
        <Input
          autoFocus
          value={identifier}
          onChange={(e) => {
            setIdentifier(e.target.value);
            setError(null);
          }}
          className={cn("shadow-none h-8", themeFont)}
          style={themeFontStyle}
          disabled={isBusy}
        />
      </div>
      <div className="space-y-2">
        <Label className={cn("text-neutral-700", themeFont)} style={themeFontStyle}>
          {t("common.auth.recovery.channel")}
        </Label>
        <div className="flex gap-2">
          {channelButton("telegram", t("common.auth.recovery.channelTelegram"))}
          {channelButton("email", t("common.auth.recovery.channelEmail"))}
        </div>
      </div>
      {error && (
        <p className={cn("text-red-600", themeFont)} style={themeFontStyle} role="alert">
          {error}
        </p>
      )}
      <DialogFooter className="mt-4 gap-1 sm:justify-end">
        <Button
          type="submit"
          variant="retro"
          disabled={isBusy || !identifier.trim()}
          className={cn("w-full sm:w-auto h-7", themeFont)}
          style={themeFontStyle}
        >
          {isBusy
            ? t("common.auth.recovery.sending")
            : t("common.auth.recovery.sendCode")}
        </Button>
      </DialogFooter>
    </form>
  );

  const resetForm = (
    <form onSubmit={handleReset} className="space-y-3">
      <div className="space-y-2">
        <Label className={cn("text-neutral-700", themeFont)} style={themeFontStyle}>
          {t("common.auth.recovery.code")}
        </Label>
        <Input
          autoFocus
          inputMode="numeric"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
          className={cn("shadow-none h-8", themeFont)}
          style={themeFontStyle}
          disabled={isBusy}
        />
      </div>
      <div className="space-y-2">
        <Label className={cn("text-neutral-700", themeFont)} style={themeFontStyle}>
          {t("common.auth.recovery.newPassword")}
        </Label>
        <Input
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => {
            setNewPassword(e.target.value);
            setError(null);
          }}
          className={cn("shadow-none h-8", themeFont)}
          style={themeFontStyle}
          disabled={isBusy}
        />
      </div>
      <div className="space-y-2">
        <Label className={cn("text-neutral-700", themeFont)} style={themeFontStyle}>
          {t("common.auth.recovery.confirmPassword")}
        </Label>
        <Input
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            setError(null);
          }}
          className={cn("shadow-none h-8", themeFont)}
          style={themeFontStyle}
          disabled={isBusy}
        />
      </div>
      {error && (
        <p className={cn("text-red-600", themeFont)} style={themeFontStyle} role="alert">
          {error}
        </p>
      )}
      <DialogFooter className="mt-4 gap-1 sm:justify-between">
        <Button
          type="button"
          variant="retro"
          onClick={() => {
            setStep("request");
            setError(null);
          }}
          disabled={isBusy}
          className={cn("w-full sm:w-auto h-7", themeFont)}
          style={themeFontStyle}
        >
          {t("common.auth.recovery.back")}
        </Button>
        <Button
          type="submit"
          variant="retro"
          disabled={isBusy || !code.trim() || !newPassword || !confirmPassword}
          className={cn("w-full sm:w-auto h-7", themeFont)}
          style={themeFontStyle}
        >
          {isBusy
            ? t("common.auth.recovery.resetting")
            : t("common.auth.recovery.submit")}
        </Button>
      </DialogFooter>
    </form>
  );

  const title = t("common.auth.recovery.title");
  const description = t("common.auth.recovery.description");

  const body = (
    <div className={isWindowsTheme ? "p-2 px-4" : "p-4 px-6"}>
      <p
        className={cn("text-neutral-500 mb-3", themeFont)}
        style={themeFontStyle}
      >
        {description}
      </p>
      {step === "request" ? requestForm : resetForm}
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
            <DialogHeader>{title}</DialogHeader>
            <div className="window-body">{body}</div>
          </>
        ) : isMacOSTheme ? (
          <>
            <DialogHeader>{title}</DialogHeader>
            {body}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-normal text-[16px]">{title}</DialogTitle>
              <DialogDescription className="sr-only">{description}</DialogDescription>
            </DialogHeader>
            {body}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
