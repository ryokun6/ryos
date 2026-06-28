import { useState, useCallback } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { useAuthStore } from "@/stores/useAuthStore";

export function useAuth() {
  const {
    username,
    isAuthenticated,
    hasPassword,
    login,
    loginWithToken,
    register,
    logout,
    checkHasPassword: storeCheckHasPassword,
    setPassword: storeSetPassword,
  } = useAuthStore(useShallow((state) => ({
    username: state.username,
    isAuthenticated: state.isAuthenticated,
    hasPassword: state.hasPassword,
    login: state.login,
    loginWithToken: state.loginWithToken,
    register: state.register,
    logout: state.logout,
    checkHasPassword: state.checkHasPassword,
    setPassword: state.setPassword,
  })));

  const [isUsernameDialogOpen, setIsUsernameDialogOpen] = useState(false);
  const [usernameDialogInitialTab, setUsernameDialogInitialTab] = useState<
    "login" | "signup"
  >("signup");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isSettingUsername, setIsSettingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  const [isVerifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [verifyTokenInput, setVerifyTokenInput] = useState("");
  const [verifyPasswordInput, setVerifyPasswordInput] = useState("");
  const [verifyUsernameInput, setVerifyUsernameInput] = useState("");
  const [isVerifyingToken, setIsVerifyingToken] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const [isLogoutConfirmDialogOpen, setIsLogoutConfirmDialogOpen] =
    useState(false);

  const openUsernameDialog = useCallback((tab: "login" | "signup") => {
    setNewUsername("");
    setNewPassword("");
    setUsernameError(null);
    setUsernameDialogInitialTab(tab);
    setIsUsernameDialogOpen(true);
  }, []);

  const promptSetUsername = useCallback(() => {
    openUsernameDialog("signup");
  }, [openUsernameDialog]);

  const promptLogin = useCallback(() => {
    openUsernameDialog("login");
  }, [openUsernameDialog]);

  const submitUsernameDialog = useCallback(async () => {
    setIsSettingUsername(true);
    setUsernameError(null);

    const trimmedUsername = newUsername.trim();
    if (!trimmedUsername) {
      setUsernameError("Username cannot be empty.");
      setIsSettingUsername(false);
      return;
    }

    if (!newPassword.trim()) {
      setUsernameError("Password is required.");
      setIsSettingUsername(false);
      return;
    }

    if (newPassword.length < 8) {
      setUsernameError("Password must be at least 8 characters.");
      setIsSettingUsername(false);
      return;
    }

    const result =
      usernameDialogInitialTab === "login"
        ? await login({ username: trimmedUsername, password: newPassword })
        : await register({ username: trimmedUsername, password: newPassword });

    if (result.ok) {
      setIsUsernameDialogOpen(false);
      setNewUsername("");
      setNewPassword("");
      toast.success("Logged In", {
        description: `Welcome, ${trimmedUsername}!`,
      });
    } else {
      setUsernameError(result.error || "Failed to set username");
    }

    setIsSettingUsername(false);
  }, [
    newUsername,
    newPassword,
    usernameDialogInitialTab,
    login,
    register,
  ]);

  const promptVerifyToken = useCallback(() => {
    setVerifyTokenInput("");
    setVerifyPasswordInput("");
    setVerifyUsernameInput(username || "");
    setVerifyError(null);
    setVerifyDialogOpen(true);
  }, [username]);

  const handleVerifyTokenSubmit = useCallback(
    async (input: string, isPassword: boolean = false) => {
      if (!input.trim()) {
        setVerifyError(isPassword ? "Password required" : "Token required");
        return;
      }

      setIsVerifyingToken(true);
      setVerifyError(null);

      try {
        if (isPassword) {
          const targetUsername = verifyUsernameInput.trim() || username || "";

          const result = await login({
            username: targetUsername,
            password: input.trim(),
          });
          if (result.ok) {
            toast.success("Success", {
              description: "Logged in successfully with password",
            });
            setVerifyDialogOpen(false);
            setVerifyPasswordInput("");
            setIsUsernameDialogOpen(false);
          } else {
            setVerifyError(result.error || "Login failed");
          }
        } else {
          const result = await loginWithToken({
            username: verifyUsernameInput.trim() || "",
            token: input.trim(),
          });

          if (result.ok) {
            toast.success("Success", {
              description: "Token verified and set successfully",
            });
            setVerifyDialogOpen(false);
            setVerifyTokenInput("");
            setIsUsernameDialogOpen(false);
          } else {
            setVerifyError(result.error || "Token verification failed");
          }
        }
      } catch (err) {
        console.error("[useAuth] Error verifying:", err);
        const message =
          err instanceof Error ? err.message : "Network error while verifying";
        setVerifyError(message);
      } finally {
        setIsVerifyingToken(false);
      }
    },
    [login, loginWithToken, username, verifyUsernameInput]
  );

  const checkHasPassword = useCallback(async () => {
    return storeCheckHasPassword();
  }, [storeCheckHasPassword]);

  const setPassword = useCallback(
    async (password: string, currentPassword?: string) => {
      return storeSetPassword(password, currentPassword);
    },
    [storeSetPassword]
  );

  const handleLogout = useCallback(async () => {
    setIsUsernameDialogOpen(false);
    setVerifyDialogOpen(false);
    setIsLogoutConfirmDialogOpen(false);
    setNewUsername("");
    setNewPassword("");
    setVerifyTokenInput("");
    setVerifyPasswordInput("");
    setVerifyUsernameInput("");
    setUsernameError(null);
    setVerifyError(null);

    await logout();

    toast.success("Logged Out", {
      description: "You have been successfully logged out.",
    });
  }, [logout]);

  const promptLogout = useCallback(async () => {
    setIsLogoutConfirmDialogOpen(true);
  }, []);

  const confirmLogout = useCallback(() => {
    setIsLogoutConfirmDialogOpen(false);
    handleLogout();
  }, [handleLogout]);

  return {
    username,
    isAuthenticated,
    hasPassword,

    promptSetUsername,
    promptLogin,
    usernameDialogInitialTab,
    isUsernameDialogOpen,
    setIsUsernameDialogOpen,
    newUsername,
    setNewUsername,
    newPassword,
    setNewPassword,
    isSettingUsername,
    usernameError,
    submitUsernameDialog,
    setUsernameError,

    promptVerifyToken,
    isVerifyDialogOpen,
    setVerifyDialogOpen,
    verifyTokenInput,
    setVerifyTokenInput,
    verifyPasswordInput,
    setVerifyPasswordInput,
    verifyUsernameInput,
    setVerifyUsernameInput,
    isVerifyingToken,
    verifyError,
    handleVerifyTokenSubmit,

    checkHasPassword,
    setPassword,

    logout: promptLogout,
    confirmLogout,
    isLogoutConfirmDialogOpen,
    setIsLogoutConfirmDialogOpen,
  };
}
