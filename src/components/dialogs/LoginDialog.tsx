import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import {
  ThemedTabsList,
  ThemedTabsTrigger,
  ThemedTabsContent,
} from "@/components/shared/ThemedTabs";
import { ResetPasswordDialog } from "@/components/dialogs/ResetPasswordDialog";
import { RecoveryEmailDialog } from "@/components/dialogs/RecoveryEmailDialog";
import { GoogleLogoIcon } from "@/components/shared/GoogleLogoIcon";
import {
  completeGoogleSignup,
  getGoogleStatus,
  openGoogleOAuthPopup,
  type GooglePendingProfile,
} from "@/api/google";
import { ApiRequestError } from "@/api/core";
import { USERNAME_REGEX } from "@/shared/validation";
import { useChatsStore } from "@/stores/useChatsStore";
import { useGoogleSyncStore } from "@/stores/useGoogleSyncStore";
import { refreshGoogleStatus } from "@/sync/googleSyncEngine";
import { isGoogleAuthAvailable } from "@/utils/runtimeConfig";

export interface PendingGoogleSignupState {
  pendingToken: string;
  suggestedUsername: string;
  profile?: GooglePendingProfile;
}

interface LoginDialogProps {
  /* Common */
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  /** When the dialog opens, choose which tab is active first */
  initialTab?: "login" | "signup";
  /** Pre-populated Google signup confirmation state (e.g. from redirect fallback) */
  initialPendingGoogleSignup?: PendingGoogleSignupState | null;
  onClearPendingGoogleSignup?: () => void;

  /* Login fields */
  usernameInput: string;
  onUsernameInputChange: (value: string) => void;
  passwordInput: string;
  onPasswordInputChange: (value: string) => void;
  onLoginSubmit: () => Promise<void>;
  isLoginLoading: boolean;
  loginError: string | null;

  /* Sign-up fields */
  newUsername: string;
  onNewUsernameChange: (value: string) => void;
  newPassword: string;
  onNewPasswordChange: (value: string) => void;
  onSignUpSubmit: () => Promise<void>;
  isSignUpLoading: boolean;
  signUpError: string | null;
}

export function applyAuthenticatedGoogleSession(params: {
  username: string;
  autoLinked?: boolean;
  hasPassword?: boolean;
  welcomeText: string;
  autoLinkedText?: string;
}) {
  const chatsStore = useChatsStore.getState();
  chatsStore.setUsername(params.username);
  chatsStore.setAuthenticated(true);
  const googleStore = useGoogleSyncStore.getState();
  googleStore.ensureOwner(params.username);
  if (typeof params.hasPassword === "boolean") {
    googleStore.setHasPassword(params.hasPassword);
  }
  void refreshGoogleStatus();
  void chatsStore.fetchRooms({ force: true });
  toast.success(params.welcomeText, {
    description: params.autoLinked ? params.autoLinkedText : undefined,
  });
}

export function LoginDialog({
  isOpen,
  onOpenChange,
  initialTab = "login",
  initialPendingGoogleSignup = null,
  onClearPendingGoogleSignup,
  /* Login props */
  usernameInput,
  onUsernameInputChange,
  passwordInput,
  onPasswordInputChange,
  onLoginSubmit,
  isLoginLoading,
  loginError,
  /* Sign-up props */
  newUsername,
  onNewUsernameChange,
  newPassword,
  onNewPasswordChange,
  onSignUpSubmit,
  isSignUpLoading,
  signUpError,
}: LoginDialogProps) {
  const [activeTab, setActiveTab] = useState<"login" | "signup">(initialTab);
  const [isResetOpen, setIsResetOpen] = useState(false);
  // Optional recovery email captured on the sign-up tab.
  const [signupEmail, setSignupEmail] = useState("");
  // Post-sign-up email verification flow.
  const [isVerifyEmailOpen, setIsVerifyEmailOpen] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState("");
  // Setting the recovery email requires the account password; reuse the one
  // just entered on the sign-up tab so the user isn't asked again.
  const signupPasswordRef = useRef("");
  const [verifyEmailPassword, setVerifyEmailPassword] = useState("");

  // Google Sign-In + 1A username confirmation state
  const storeConfigured = useGoogleSyncStore((s) => s.configured);
  const googleAvailable = storeConfigured || isGoogleAuthAvailable();
  const [pendingGoogleSignup, setPendingGoogleSignup] =
    useState<PendingGoogleSignupState | null>(initialPendingGoogleSignup);
  const [googleUsername, setGoogleUsername] = useState(
    initialPendingGoogleSignup?.suggestedUsername ?? ""
  );
  const [isGoogleBusy, setIsGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const { isWindowsTheme, isMacOSTheme } = useThemeFlags();
  const { t } = useTranslation();
  const dialogTitle = pendingGoogleSignup
    ? t("common.auth.googleConfirmTitle")
    : t("common.auth.dialogTitle");

  // Reset to the initial tab whenever the dialog is reopened
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setSignupEmail("");
      setGoogleError(null);
      setIsGoogleBusy(false);
      if (initialPendingGoogleSignup) {
        setPendingGoogleSignup(initialPendingGoogleSignup);
        setGoogleUsername(initialPendingGoogleSignup.suggestedUsername);
      } else {
        setPendingGoogleSignup(null);
        setGoogleUsername("");
      }

      if (!isGoogleAuthAvailable()) {
        void getGoogleStatus()
          .then((status) => {
            useGoogleSyncStore.getState().setServerStatus({
              configured: status.configured,
              linked: status.linked,
              hasPassword: status.hasPassword,
              account: status.account,
            });
          })
          .catch(() => {});
      }
    }
  }, [isOpen, initialTab, initialPendingGoogleSignup]);

  const handleGoogleSignIn = async () => {
    if (isGoogleBusy || isLoginLoading || isSignUpLoading) return;
    setIsGoogleBusy(true);
    setGoogleError(null);
    try {
      const result = await openGoogleOAuthPopup({ mode: "signin" });
      if (result.status === "error") {
        setGoogleError(result.error || t("common.auth.googleFailed"));
        return;
      }
      if (result.status === "authenticated" && result.username) {
        applyAuthenticatedGoogleSession({
          username: result.username,
          autoLinked: result.autoLinked,
          welcomeText: t("common.auth.googleWelcome", {
            username: result.username,
          }),
          autoLinkedText: t("common.auth.googleAutoLinkedDescription"),
        });
        onOpenChange(false);
        return;
      }
      if (result.status === "needs_username" && result.pendingToken) {
        const nextPending: PendingGoogleSignupState = {
          pendingToken: result.pendingToken,
          suggestedUsername: result.suggestedUsername || "",
          profile: result.profile,
        };
        setPendingGoogleSignup(nextPending);
        setGoogleUsername(nextPending.suggestedUsername);
        setGoogleError(null);
      }
    } catch (err) {
      setGoogleError(
        err instanceof Error ? err.message : t("common.auth.googleFailed")
      );
    } finally {
      setIsGoogleBusy(false);
    }
  };

  const handleCompleteGoogleSignup = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!pendingGoogleSignup || isGoogleBusy) return;
    const trimmed = googleUsername.trim();
    if (!USERNAME_REGEX.test(trimmed)) {
      setGoogleError(t("common.auth.googleInvalidUsername"));
      return;
    }

    setIsGoogleBusy(true);
    setGoogleError(null);
    try {
      const currentUsername = useChatsStore.getState().username;
      if (
        currentUsername &&
        currentUsername.toLowerCase() !== trimmed.toLowerCase()
      ) {
        await useChatsStore.getState().logout();
      }
      const created = await completeGoogleSignup({
        pendingToken: pendingGoogleSignup.pendingToken,
        username: trimmed,
      });
      applyAuthenticatedGoogleSession({
        username: created.user.username,
        hasPassword: false,
        welcomeText: t("common.auth.googleWelcome", {
          username: created.user.username,
        }),
      });
      setPendingGoogleSignup(null);
      onClearPendingGoogleSignup?.();
      onOpenChange(false);
    } catch (err) {
      setGoogleError(
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("common.auth.googleFailed")
      );
    } finally {
      setIsGoogleBusy(false);
    }
  };

  /* Handlers */
  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (activeTab === "login") {
      if (!isLoginLoading) {
        await onLoginSubmit();
      }
    } else {
      if (!isSignUpLoading) {
        signupPasswordRef.current = newPassword;
        await onSignUpSubmit();
      }
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

  const renderGoogleButtonBlock = () => {
    if (!googleAvailable) return null;
    return (
      <div className="space-y-3 mb-3">
        <Button
          type="button"
          variant="retro"
          onClick={() => void handleGoogleSignIn()}
          disabled={isGoogleBusy || isLoginLoading || isSignUpLoading}
          className={cn(
            "w-full h-8 flex items-center justify-center gap-2",
            themeFont
          )}
          style={themeFontStyle}
        >
          <GoogleLogoIcon className="size-3.5" />
          <span>
            {isGoogleBusy
              ? t("common.auth.connectingGoogle")
              : t("common.auth.continueWithGoogle")}
          </span>
        </Button>
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-os-separator" />
          <span
            className={cn("text-os-text-secondary text-[11px]", themeFont)}
            style={themeFontStyle}
          >
            {t("common.auth.orDivider")}
          </span>
          <div className="h-px flex-1 bg-os-separator" />
        </div>
      </div>
    );
  };

  const renderLoginForm = () => (
    <div className="space-y-3">
      {renderGoogleButtonBlock()}
      <div className="space-y-2">
        <Label
          className={cn("text-neutral-700", themeFont)}
          style={themeFontStyle}
        >
          {t("common.auth.username")}
        </Label>
        <Input
          autoFocus={activeTab === "login"}
          value={usernameInput}
          onChange={(e) => onUsernameInputChange(e.target.value)}
          className={cn("shadow-none h-8", themeFont)}
          style={themeFontStyle}
          disabled={isLoginLoading || isGoogleBusy}
        />
      </div>
      <div className="space-y-2">
        <Label
          className={cn("text-neutral-700", themeFont)}
          style={themeFontStyle}
        >
          {t("common.auth.password")}
        </Label>
        <Input
          type="password"
          value={passwordInput}
          onChange={(e) => onPasswordInputChange(e.target.value)}
          className={cn("shadow-none h-8", themeFont)}
          style={themeFontStyle}
          disabled={isLoginLoading || isGoogleBusy}
        />
      </div>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setIsResetOpen(true)}
          className={cn(
            "text-neutral-500 underline underline-offset-2 hover:text-neutral-700",
            themeFont
          )}
          style={themeFontStyle}
          disabled={isLoginLoading || isGoogleBusy}
        >
          {t("common.auth.forgotPassword")}
        </button>
      </div>
    </div>
  );

  const renderSignUpForm = () => (
    <div className="space-y-3">
      {renderGoogleButtonBlock()}
      <div className="space-y-2">
        <Label
          className={cn("text-neutral-700", themeFont)}
          style={themeFontStyle}
        >
          {t("common.auth.username")}
        </Label>
        <Input
          autoFocus={activeTab === "signup"}
          value={newUsername}
          onChange={(e) => onNewUsernameChange(e.target.value)}
          className={cn("shadow-none h-8", themeFont)}
          style={themeFontStyle}
          disabled={isSignUpLoading || isGoogleBusy}
        />
      </div>
      <div className="space-y-2">
        <Label
          className={cn("text-neutral-700", themeFont)}
          style={themeFontStyle}
        >
          {t("common.auth.password")}
        </Label>
        <Input
          type="password"
          value={newPassword}
          onChange={(e) => onNewPasswordChange(e.target.value)}
          className={cn("shadow-none h-8", themeFont)}
          style={themeFontStyle}
          disabled={isSignUpLoading || isGoogleBusy}
        />
      </div>
      <div className="space-y-2">
        <Label
          className={cn("text-neutral-700", themeFont)}
          style={themeFontStyle}
        >
          {t("common.auth.recoveryEmailOptional")}
        </Label>
        <Input
          type="email"
          value={signupEmail}
          onChange={(e) => setSignupEmail(e.target.value)}
          className={cn("shadow-none h-8", themeFont)}
          style={themeFontStyle}
          disabled={isSignUpLoading || isGoogleBusy}
          autoComplete="email"
        />
      </div>
    </div>
  );

  const renderGoogleConfirmForm = () => {
    const profile = pendingGoogleSignup?.profile;
    return (
      <form onSubmit={handleCompleteGoogleSignup} className="space-y-3">
        {profile && (
          <div className="flex items-center gap-2.5 rounded-os border-[length:var(--os-metrics-border-width)] border-os-input-border bg-os-panel-bg p-2">
            {profile.picture ? (
              <img
                src={profile.picture}
                alt={profile.email || "Google"}
                referrerPolicy="no-referrer"
                className="size-8 shrink-0 rounded-full object-cover"
              />
            ) : (
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-os-input-border bg-white">
                <GoogleLogoIcon className="size-4" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              {profile.name && (
                <div
                  className={cn(
                    "truncate font-medium text-os-text-primary",
                    themeFont
                  )}
                  style={themeFontStyle}
                >
                  {profile.name}
                </div>
              )}
              <div
                className={cn(
                  "truncate text-os-text-secondary text-[11px]",
                  themeFont
                )}
                style={themeFontStyle}
              >
                {profile.email}
              </div>
            </div>
          </div>
        )}

        <p
          className={cn("text-os-text-secondary", themeFont)}
          style={themeFontStyle}
        >
          {t("common.auth.googleConfirmDescription")}
        </p>

        <div className="space-y-2">
          <Label
            className={cn("text-neutral-700", themeFont)}
            style={themeFontStyle}
          >
            {t("common.auth.username")}
          </Label>
          <Input
            autoFocus
            value={googleUsername}
            onChange={(e) => {
              setGoogleUsername(e.target.value);
              setGoogleError(null);
            }}
            className={cn("shadow-none h-8", themeFont)}
            style={themeFontStyle}
            disabled={isGoogleBusy}
          />
          <p
            className={cn("text-os-text-secondary text-[10px]", themeFont)}
            style={themeFontStyle}
          >
            {t("common.auth.googleUsernameHint")}
          </p>
        </div>

        {googleError && (
          <p
            className={cn("text-red-600", themeFont)}
            style={themeFontStyle}
            role="alert"
          >
            {googleError}
          </p>
        )}

        <DialogFooter className="mt-4 gap-1.5 sm:justify-between">
          <Button
            type="button"
            variant={isMacOSTheme ? "secondary" : "retro"}
            onClick={() => {
              setPendingGoogleSignup(null);
              setGoogleError(null);
              onClearPendingGoogleSignup?.();
            }}
            disabled={isGoogleBusy}
            className={cn("w-full sm:w-auto h-7", themeFont)}
            style={themeFontStyle}
          >
            {t("common.dialog.back")}
          </Button>
          <Button
            type="submit"
            variant={isMacOSTheme ? "default" : "retro"}
            disabled={isGoogleBusy || !googleUsername.trim()}
            className={cn("w-full sm:w-auto h-7", themeFont)}
            style={themeFontStyle}
          >
            {isGoogleBusy
              ? t("common.auth.creatingAccount")
              : t("common.auth.googleCompleteSignUp")}
          </Button>
        </DialogFooter>
      </form>
    );
  };

  const isActionLoading =
    activeTab === "login" ? isLoginLoading : isSignUpLoading;
  const activeError =
    googleError || (activeTab === "login" ? loginError : signUpError);

  // Automatically close the dialog when an action completes successfully
  const prevLoginLoading = React.useRef(isLoginLoading);
  const prevSignUpLoading = React.useRef(isSignUpLoading);

  React.useEffect(() => {
    // Detect transition from loading -> not loading with no errors
    const loginFinishedSuccessfully =
      prevLoginLoading.current &&
      !isLoginLoading &&
      !loginError &&
      activeTab === "login";

    const signUpFinishedSuccessfully =
      prevSignUpLoading.current &&
      !isSignUpLoading &&
      !signUpError &&
      activeTab === "signup";

    // After a successful sign-up with an optional recovery email, continue into
    // the email verification flow. This must run regardless of `isOpen` because
    // the parent flips the login dialog closed as soon as sign-up succeeds.
    if (signUpFinishedSuccessfully && signupEmail.trim()) {
      setVerifyEmail(signupEmail.trim());
      setVerifyEmailPassword(signupPasswordRef.current);
      setIsVerifyEmailOpen(true);
    }
    if (signUpFinishedSuccessfully || loginFinishedSuccessfully) {
      signupPasswordRef.current = "";
    }

    if (isOpen && (loginFinishedSuccessfully || signUpFinishedSuccessfully)) {
      onOpenChange(false);
    }

    prevLoginLoading.current = isLoginLoading;
    prevSignUpLoading.current = isSignUpLoading;
  }, [
    isOpen,
    isLoginLoading,
    isSignUpLoading,
    loginError,
    signUpError,
    activeTab,
    onOpenChange,
    signupEmail,
  ]);

  const dialogContent = pendingGoogleSignup ? (
    <div className="pt-3 pb-6 px-6">{renderGoogleConfirmForm()}</div>
  ) : (
    <div className="pt-3 pb-6 px-6">
      <form onSubmit={handleSubmit}>
        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v as "login" | "signup");
            setGoogleError(null);
          }}
          className="w-full"
        >
          <ThemedTabsList className="w-full">
            <ThemedTabsTrigger value="signup">
              {t("common.auth.createAccount")}
            </ThemedTabsTrigger>
            <ThemedTabsTrigger value="login">
              {t("common.auth.logIn")}
            </ThemedTabsTrigger>
          </ThemedTabsList>

          {/* Sign Up */}
          <ThemedTabsContent value="signup">
            <div className="p-4">{renderSignUpForm()}</div>
          </ThemedTabsContent>

          {/* Login */}
          <ThemedTabsContent value="login">
            <div className="p-4">{renderLoginForm()}</div>
          </ThemedTabsContent>
        </Tabs>

        {activeError && (
          <p
            className={cn("text-red-600 mt-3", themeFont)}
            style={themeFontStyle}
          >
            {activeError}
          </p>
        )}

        <DialogFooter className="mt-6 gap-1.5 sm:justify-end">
          <Button
            type="submit"
            variant="retro"
            disabled={
              isActionLoading ||
              isGoogleBusy ||
              (activeTab === "login"
                ? !usernameInput.trim() || !passwordInput.trim()
                : !newUsername.trim())
            }
            className={cn("w-full sm:w-auto h-7", themeFont)}
            style={themeFontStyle}
          >
            {isActionLoading
              ? activeTab === "login"
                ? t("common.auth.loggingIn")
                : t("common.auth.creatingAccount")
              : activeTab === "login"
              ? t("common.auth.logIn")
              : t("common.auth.createAccount")}
          </Button>
        </DialogFooter>
      </form>
    </div>
  );

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn("max-w-[400px]", isWindowsTheme && "p-0 overflow-hidden")}
          style={isWindowsTheme ? { fontSize: "11px" } : undefined}
          onKeyDown={(e: React.KeyboardEvent) => e.stopPropagation()}
        >
          {isWindowsTheme ? (
            <>
              {/* The themed titlebar is decorative; expose an accessible name/description for screen readers. */}
              <DialogTitle className="sr-only">{dialogTitle}</DialogTitle>
              <DialogDescription className="sr-only">
                {activeTab === "login"
                  ? t("common.auth.loginDescription")
                  : t("common.auth.signupDescription")}
              </DialogDescription>
              <DialogHeader>{dialogTitle}</DialogHeader>
              <div className="window-body">{dialogContent}</div>
            </>
          ) : isMacOSTheme ? (
            <>
              {/* The themed titlebar is decorative; expose an accessible name/description for screen readers. */}
              <DialogTitle className="sr-only">{dialogTitle}</DialogTitle>
              <DialogDescription className="sr-only">
                {activeTab === "login"
                  ? t("common.auth.loginDescription")
                  : t("common.auth.signupDescription")}
              </DialogDescription>
              <DialogHeader>{dialogTitle}</DialogHeader>
              {dialogContent}
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="font-normal text-[16px]">
                  {dialogTitle}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  {activeTab === "login"
                    ? t("common.auth.loginDescription")
                    : t("common.auth.signupDescription")}
                </DialogDescription>
              </DialogHeader>
              {dialogContent}
            </>
          )}
        </DialogContent>
      </Dialog>
      <ResetPasswordDialog
        isOpen={isResetOpen}
        onOpenChange={setIsResetOpen}
        defaultIdentifier={usernameInput}
        onSuccess={() => onOpenChange(false)}
      />
      <RecoveryEmailDialog
        isOpen={isVerifyEmailOpen}
        onOpenChange={(open) => {
          setIsVerifyEmailOpen(open);
          if (!open) setVerifyEmailPassword("");
        }}
        initialEmail={verifyEmail}
        initialPassword={verifyEmailPassword}
        autoSubmit
        hideRemove
        title={t("common.auth.verifyEmailTitle")}
        description={t("common.auth.verifyEmailDescription")}
      />
    </>
  );
}
