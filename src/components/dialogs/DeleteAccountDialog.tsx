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
import { useShallow } from "zustand/react/shallow";
import { useAuthStore } from "@/stores/useAuthStore";

interface DeleteAccountDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** Whether the account has a password (controls the password field). */
  hasPassword: boolean | null;
}

export function DeleteAccountDialog({
  isOpen,
  onOpenChange,
  hasPassword,
}: DeleteAccountDialogProps) {
  const { t } = useTranslation();
  const { isWindowsTheme, isMacOSTheme } = useThemeFlags();
  const { username, deleteAccount } = useAuthStore(useShallow((s) => ({
    username: s.username,
    deleteAccount: s.deleteAccount,
  })));

  const [password, setPassword] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPassword("");
      setConfirmName("");
      setBusy(false);
      setError(null);
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

  const requiresPassword = hasPassword !== false;

  const handleDelete = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    if (requiresPassword && !password.trim()) {
      setError(t("apps.control-panels.deleteAccount.passwordRequired"));
      return;
    }
    if (confirmName.trim().toLowerCase() !== (username || "").toLowerCase()) {
      setError(t("apps.control-panels.deleteAccount.confirmMismatch"));
      return;
    }

    setBusy(true);
    setError(null);
    const result = await deleteAccount({
      confirmUsername: confirmName.trim(),
      ...(requiresPassword ? { currentPassword: password } : {}),
    });
    if (result.ok) {
      toast.success(t("apps.control-panels.deleteAccount.successTitle"), {
        description: t("apps.control-panels.deleteAccount.successDescription"),
      });
      onOpenChange(false);
    } else {
      setError(
        result.error || t("apps.control-panels.deleteAccount.genericError")
      );
      setBusy(false);
    }
  };

  const title = t("apps.control-panels.deleteAccount.title");
  const description = t("apps.control-panels.deleteAccount.description");

  const form = (
    <form onSubmit={handleDelete} className="space-y-3">
      {requiresPassword && (
        <div className="space-y-2">
          <Label
            className={cn("text-neutral-700", themeFont)}
            style={themeFontStyle}
          >
            {t("apps.control-panels.deleteAccount.passwordLabel")}
          </Label>
          <Input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
            className={cn("shadow-none h-8", themeFont)}
            style={themeFontStyle}
            disabled={busy}
          />
        </div>
      )}
      <div className="space-y-2">
        <Label
          className={cn("text-neutral-700", themeFont)}
          style={themeFontStyle}
        >
          {t("apps.control-panels.deleteAccount.confirmLabel")}
        </Label>
        <Input
          autoFocus={!requiresPassword}
          value={confirmName}
          placeholder={t("apps.control-panels.deleteAccount.confirmPlaceholder", {
            username: username || "",
          })}
          onChange={(e) => {
            setConfirmName(e.target.value);
            setError(null);
          }}
          className={cn("shadow-none h-8", themeFont)}
          style={themeFontStyle}
          disabled={busy}
        />
      </div>
      {error && (
        <p
          className={cn("text-red-600", themeFont)}
          style={themeFontStyle}
          role="alert"
        >
          {error}
        </p>
      )}
      <DialogFooter className="mt-4 gap-1 sm:justify-end">
        <Button
          type="button"
          variant="retro"
          onClick={() => onOpenChange(false)}
          disabled={busy}
          className={cn("w-full sm:w-auto h-7", themeFont)}
          style={themeFontStyle}
        >
          {t("apps.control-panels.deleteAccount.cancel")}
        </Button>
        <Button
          type="submit"
          variant="retro"
          disabled={busy}
          className={cn("w-full sm:w-auto h-7 text-red-600", themeFont)}
          style={themeFontStyle}
        >
          {busy
            ? t("apps.control-panels.deleteAccount.deleting")
            : t("apps.control-panels.deleteAccount.submit")}
        </Button>
      </DialogFooter>
    </form>
  );

  const body = (
    <div className={isWindowsTheme ? "p-2 px-4" : "p-4 px-6"}>
      <p
        className={cn("text-neutral-500 mb-3", themeFont)}
        style={themeFontStyle}
      >
        {description}
      </p>
      {form}
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
