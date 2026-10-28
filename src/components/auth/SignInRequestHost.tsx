import { useEffect } from "react";
import { LoginDialog } from "@/components/dialogs/LoginDialog";
import { useAuth } from "@/hooks/useAuth";
import { REQUEST_SIGN_IN_EVENT } from "@/utils/requestSignIn";

/**
 * Always-mounted sign-in dialog. Toasts and other non-React callers open it
 * by dispatching {@link REQUEST_SIGN_IN_EVENT}, the same LoginDialog the
 * Apple menu uses for Sign In.
 */
export function SignInRequestHost() {
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

  return (
    <>
      <LoginDialog
        initialTab="signup"
        isOpen={isUsernameDialogOpen}
        onOpenChange={setIsUsernameDialogOpen}
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
