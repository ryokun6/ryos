import { useState, useCallback } from "react";
import { toast } from "sonner";
import { track } from "@vercel/analytics";
import { APP_ANALYTICS } from "@/utils/analytics";
import { useChatsStoreShallow } from "@/stores/helpers";
import { loginWithPassword, verifyAuthToken } from "@/api/auth";

export function useAuth() {
  const {
    username,
    isAuthenticated,
    hasPassword,
    setAuthenticated,
    setUsername,
    createUser,
    logout,
    checkHasPassword: storeCheckHasPassword,
    setPassword: storeSetPassword,
  } = useChatsStoreShallow((state) => ({
    username: state.username,
    isAuthenticated: state.isAuthenticated,
    hasPassword: state.hasPassword,
    setAuthenticated: state.setAuthenticated,
    setUsername: state.setUsername,
    createUser: state.createUser,
    logout: state.logout,
    checkHasPassword: state.checkHasPassword,
    setPassword: state.setPassword,
  }));

  const [isUsernameDialogOpen, setIsUsernameDialogOpen] = useState(false);
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

  const promptSetUsername = useCallback(() => {
    setNewUsername("");
    setNewPassword("");
    setUsernameError(null);
    setIsUsernameDialogOpen(true);
  }, []);

  const submitUsernameDialog = useCallback(async () => {
    setIsSettingUsername(true);
    setUsernameError(null);

    const trimmedUsername = newUsername.trim();
    if (!trimmedUsername) {
      setUsernameError("Username cannot be empty.");
      setIsSettingUsername(false);
      return;
    }

    if (username && username !== trimmedUsername) {
      await logout();
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

    const result = await createUser(trimmedUsername, newPassword);

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
  }, [newUsername, newPassword, createUser, username, logout]);

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

          if (username && username !== targetUsername) {
            await logout();
          }

          const result = await loginWithPassword({
            username: targetUsername,
            password: input.trim(),
          });
          if (result.username) {
            setUsername(result.username);
            setAuthenticated(true);
            track(APP_ANALYTICS.USER_LOGIN_PASSWORD, {
              username: result.username,
            });
            toast.success("Success", {
              description: "Logged in successfully with password",
            });
            setVerifyDialogOpen(false);
            setVerifyPasswordInput("");
            setIsUsernameDialogOpen(false);
          }
        } else {
          if (username || isAuthenticated) {
            await logout();
          }

          const result = await verifyAuthToken({
            username: verifyUsernameInput.trim() || "",
            token: input.trim(),
          });

          if (result.valid && result.username) {
            setUsername(result.username);
            setAuthenticated(true);
            track(APP_ANALYTICS.USER_LOGIN_TOKEN, {
              username: result.username,
            });
            toast.success("Success", {
              description: "Token verified and set successfully",
            });
            setVerifyDialogOpen(false);
            setVerifyTokenInput("");
            setIsUsernameDialogOpen(false);
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
    [setAuthenticated, setUsername, username, verifyUsernameInput, isAuthenticated, logout]
  );

  const checkHasPassword = useCallback(async () => {
    return storeCheckHasPassword();
  }, [storeCheckHasPassword]);

  const setPassword = useCallback(
    async (password: string) => {
      return storeSetPassword(password);
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
