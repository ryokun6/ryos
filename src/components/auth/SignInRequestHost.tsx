import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { consumeRedirectGoogleOAuthResult } from "@/api/google";
import {
  applyAuthenticatedGoogleSession,
  LoginDialog,
  type PendingGoogleSignupState,
} from "@/components/dialogs/LoginDialog";
import { useAuth } from "@/hooks/useAuth";
import { refreshGoogleStatus } from "@/sync/googleSyncEngine";
import { REQUEST_SIGN_IN_EVENT } from "@/utils/requestSignIn";

/**
 * Always-mounted sign-in dialog. Toasts and other non-React callers open it
 * by dispatching {@link REQUEST_SIGN_IN_EVENT}, the same LoginDialog the
 * Apple menu uses for Sign In.
 */
export function SignInRequestHost() {
  const { t } = useTranslation();
  const [redirectPendingGoogle, setRedirectPendingGoogle] =
    useState<PendingGoogleSignupState | null>(null);
  const {
    promptVerifyToken,
    promptSetUsername,
    isUsernameDialogOpen,
    setIsUsernameDialogOpen,
    newUsername,
    setNewUsername,
    newPassword,
    setNewPassword,
    isSettingUsername,
    usernameError,
    submitUsernameDialog,
    isVerifyDialogOpen,
    setVerifyDialogOpen,
    verifyPasswordInput,
    setVerifyPasswordInput,
    verifyUsernameInput,
    setVerifyUsernameInput,
    isVerifyingToken,
    verifyError,
    handleVerifyTokenSubmit,
  } = useAuth();

  useEffect(() => {
    const onRequest = () => {
      promptVerifyToken();
    };
    window.addEventListener(REQUEST_SIGN_IN_EVENT, onRequest);
    return () => window.removeEventListener(REQUEST_SIGN_IN_EVENT, onRequest);
  }, [promptVerifyToken]);

  useEffect(() => {
    const redirectResult = consumeRedirectGoogleOAuthResult();
    if (!redirectResult) return;

    if (redirectResult.status === "error") {
      toast.error(redirectResult.error || t("common.auth.googleFailed"));
      return;
    }

    if (redirectResult.status === "authenticated" && redirectResult.username) {
      applyAuthenticatedGoogleSession({
        username: redirectResult.username,
        autoLinked: redirectResult.autoLinked,
        welcomeText: t("common.auth.googleWelcome", {
          username: redirectResult.username,
        }),
        autoLinkedText: t("common.auth.googleAutoLinkedDescription"),
      });
      return;
    }

    if (redirectResult.status === "linked") {
      void refreshGoogleStatus();
      toast.success(t("apps.control-panels.google.connectedToast"));
      return;
    }

    if (
      redirectResult.status === "needs_username" &&
      redirectResult.pendingToken
    ) {
      setRedirectPendingGoogle({
        pendingToken: redirectResult.pendingToken,
        suggestedUsername: redirectResult.suggestedUsername || "",
        profile: redirectResult.profile,
      });
      setIsUsernameDialogOpen(true);
    }
  }, [setIsUsernameDialogOpen, t]);

  return (
    <>
      <LoginDialog
        initialTab="signup"
        isOpen={isUsernameDialogOpen}
        onOpenChange={(open) => {
          setIsUsernameDialogOpen(open);
          if (!open) setRedirectPendingGoogle(null);
        }}
        initialPendingGoogleSignup={redirectPendingGoogle}
        onClearPendingGoogleSignup={() => setRedirectPendingGoogle(null)}
        usernameInput={verifyUsernameInput}
        onUsernameInputChange={setVerifyUsernameInput}
        passwordInput={verifyPasswordInput}
        onPasswordInputChange={setVerifyPasswordInput}
        onLoginSubmit={async () => {
          await handleVerifyTokenSubmit(verifyPasswordInput, true);
        }}
        isLoginLoading={isVerifyingToken}
        loginError={verifyError}
        newUsername={newUsername}
        onNewUsernameChange={setNewUsername}
        newPassword={newPassword}
        onNewPasswordChange={setNewPassword}
        onSignUpSubmit={submitUsernameDialog}
        isSignUpLoading={isSettingUsername}
        signUpError={usernameError}
      />
      <LoginDialog
        isOpen={isVerifyDialogOpen}
        onOpenChange={setVerifyDialogOpen}
        usernameInput={verifyUsernameInput}
        onUsernameInputChange={setVerifyUsernameInput}
        passwordInput={verifyPasswordInput}
        onPasswordInputChange={setVerifyPasswordInput}
        onLoginSubmit={async () => {
          await handleVerifyTokenSubmit(verifyPasswordInput, true);
        }}
        isLoginLoading={isVerifyingToken}
        loginError={verifyError}
        newUsername={newUsername}
        onNewUsernameChange={setNewUsername}
        newPassword={newPassword}
        onNewPasswordChange={setNewPassword}
        onSignUpSubmit={async () => {
          setVerifyDialogOpen(false);
          promptSetUsername();
        }}
        isSignUpLoading={false}
        signUpError={null}
      />
    </>
  );
}
