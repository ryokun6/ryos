import React, { useEffect, useReducer } from "react";
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

export interface ChangePasswordSubmitInput {
  /** Empty string when the account has no password yet (initial set-up). */
  currentPassword: string;
  newPassword: string;
}

interface ChangePasswordDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Whether the account already has a password. When `false`, the
   * "Current password" field is hidden — this is the initial password
   * set-up flow for legacy accounts.
   */
  hasPassword: boolean;
  isLoading?: boolean;
  errorMessage?: string | null;
  onSubmit: (input: ChangePasswordSubmitInput) => void | Promise<void>;
  /** Called whenever any input changes so the parent can clear errors. */
  onAnyInputChange?: () => void;
}

/**
 * Dialog for changing or initially setting a user's password.
 *
 * When `hasPassword` is true:
 *   - Requires the current password before allowing the change.
 *   - Validates that the two new-password entries match before submitting.
 *
 * When `hasPassword` is false (legacy account / first set-up):
 *   - Only asks for the new password and a confirmation.
 */
export function ChangePasswordDialog({
  isOpen,
  onOpenChange,
  hasPassword,
  isLoading = false,
  errorMessage = null,
  onSubmit,
  onAnyInputChange,
}: ChangePasswordDialogProps) {
  const { t } = useTranslation();
  const {
    isWindowsTheme: isXpTheme,
    isMacOSTheme: isMacTheme,
  } = useThemeFlags();

  type PasswordFormState = {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
    localError: string | null;
  };
  type PasswordFormAction =
    | { type: "reset" }
    | {
        type: "setField";
        field: "currentPassword" | "newPassword" | "confirmPassword";
        value: string;
      }
    | { type: "setLocalError"; value: string | null };
  const initialState: PasswordFormState = {
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
    localError: null,
  };
  const reducer = (
    state: PasswordFormState,
    action: PasswordFormAction
  ): PasswordFormState => {
    switch (action.type) {
      case "reset":
        return initialState;
      case "setField":
        return {
          ...state,
          [action.field]: action.value,
          localError: null,
        };
      case "setLocalError":
        return { ...state, localError: action.value };
      default:
        return state;
    }
  };
  const [state, dispatch] = useReducer(reducer, initialState);
  const { currentPassword, newPassword, confirmPassword, localError } = state;

  useEffect(() => {
    if (isOpen) {
      dispatch({ type: "reset" });
    }
  }, [isOpen]);

  const themeFont = isXpTheme
    ? "font-['Pixelated_MS_Sans_Serif',Arial] text-[11px]"
    : "font-geneva-12 text-[12px]";
  const themeFontStyle: React.CSSProperties | undefined = isXpTheme
    ? {
        fontFamily: '"Pixelated MS Sans Serif", "ArkPixel", Arial',
        fontSize: "11px",
      }
    : undefined;

  const dialogTitle = hasPassword
    ? t("common.auth.changePassword.title")
    : t("apps.control-panels.setPasswordDialog.title");

  const dialogDescription = hasPassword
    ? t("common.auth.changePassword.description")
    : t("apps.control-panels.setPasswordDialog.description");

  const handleInputChange = (
    field: "currentPassword" | "newPassword" | "confirmPassword",
    value: string
  ) => {
    dispatch({ type: "setField", field, value });
    onAnyInputChange?.();
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isLoading) return;

    if (hasPassword && currentPassword.length === 0) {
      dispatch({
        type: "setLocalError",
        value: t("common.auth.changePassword.currentPasswordRequired"),
      });
      return;
    }

    if (newPassword.length < 8) {
      dispatch({
        type: "setLocalError",
        value: t("common.auth.changePassword.tooShort"),
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      dispatch({
        type: "setLocalError",
        value: t("common.auth.changePassword.mismatch"),
      });
      return;
    }

    if (hasPassword && currentPassword === newPassword) {
      dispatch({
        type: "setLocalError",
        value: t("common.auth.changePassword.sameAsCurrent"),
      });
      return;
    }

    await onSubmit({
      currentPassword: hasPassword ? currentPassword : "",
      newPassword,
    });
  };

  const submitDisabled =
    isLoading ||
    !newPassword.trim() ||
    !confirmPassword.trim() ||
    (hasPassword && !currentPassword.trim());

  const visibleError = localError || errorMessage;

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-3">
      {hasPassword && (
        <div className="space-y-2">
          <Label
            className={cn("text-gray-700", themeFont)}
            style={themeFontStyle}
            htmlFor="change-password-current"
          >
            {t("common.auth.changePassword.currentPassword")}
          </Label>
          <Input
            id="change-password-current"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={currentPassword}
            onChange={(e) =>
              handleInputChange("currentPassword", e.target.value)
            }
            className={cn("shadow-none h-8", themeFont)}
            style={themeFontStyle}
            disabled={isLoading}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label
          className={cn("text-gray-700", themeFont)}
          style={themeFontStyle}
          htmlFor="change-password-new"
        >
          {t("common.auth.changePassword.newPassword")}
        </Label>
        <Input
          id="change-password-new"
          type="password"
          autoComplete="new-password"
          autoFocus={!hasPassword}
          value={newPassword}
          onChange={(e) => handleInputChange("newPassword", e.target.value)}
          className={cn("shadow-none h-8", themeFont)}
          style={themeFontStyle}
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2">
        <Label
          className={cn("text-gray-700", themeFont)}
          style={themeFontStyle}
          htmlFor="change-password-confirm"
        >
          {t("common.auth.changePassword.confirmPassword")}
        </Label>
        <Input
          id="change-password-confirm"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) =>
            handleInputChange("confirmPassword", e.target.value)
          }
          className={cn("shadow-none h-8", themeFont)}
          style={themeFontStyle}
          disabled={isLoading}
        />
      </div>

      {visibleError && (
        <p
          className={cn("text-red-600", themeFont)}
          style={themeFontStyle}
          role="alert"
        >
          {visibleError}
        </p>
      )}

      <DialogFooter className="mt-4 gap-1 sm:justify-end">
        <Button
          type="button"
          variant={isMacTheme ? "secondary" : "retro"}
          onClick={() => onOpenChange(false)}
          disabled={isLoading}
          className={cn("w-full sm:w-auto", !isMacTheme && "h-7", themeFont)}
          style={themeFontStyle}
        >
          {t("common.dialog.cancel")}
        </Button>
        <Button
          type="submit"
          variant={isMacTheme ? "default" : "retro"}
          disabled={submitDisabled}
          className={cn("w-full sm:w-auto", !isMacTheme && "h-7", themeFont)}
          style={themeFontStyle}
        >
          {isLoading
            ? t("common.auth.changePassword.saving")
            : hasPassword
              ? t("common.auth.changePassword.submit")
              : t("apps.control-panels.setPasswordDialog.submitLabel")}
        </Button>
      </DialogFooter>
    </form>
  );

  const dialogBody = (
    <div className={isXpTheme ? "p-2 px-4" : "p-4 px-6"}>
      <p
        className={cn("text-gray-500 mb-3", themeFont)}
        style={themeFontStyle}
        id="change-password-description"
      >
        {dialogDescription}
      </p>
      {formContent}
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn("max-w-[420px]", isXpTheme && "p-0 overflow-hidden")}
        style={isXpTheme ? { fontSize: "11px" } : undefined}
        onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
      >
        {isXpTheme ? (
          <>
            <DialogHeader>{dialogTitle}</DialogHeader>
            <div className="window-body">{dialogBody}</div>
          </>
        ) : isMacTheme ? (
          <>
            <DialogHeader>{dialogTitle}</DialogHeader>
            {dialogBody}
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-normal text-[16px]">
                {dialogTitle}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {dialogDescription}
              </DialogDescription>
            </DialogHeader>
            {dialogBody}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
