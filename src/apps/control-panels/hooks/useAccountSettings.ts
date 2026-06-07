import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useTelegramLink } from "@/hooks/useTelegramLink";
import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";

export function useAccountSettings() {
  const { t } = useTranslation();

  const {
    username,
    isAuthenticated,
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
    promptVerifyToken,
    isVerifyDialogOpen,
    setVerifyDialogOpen,
    verifyPasswordInput,
    setVerifyPasswordInput,
    verifyUsernameInput,
    setVerifyUsernameInput,
    hasPassword,
    setPassword,
    logout,
    confirmLogout,
    isLogoutConfirmDialogOpen,
    setIsLogoutConfirmDialogOpen,
    isVerifyingToken,
    verifyError,
    handleVerifyTokenSubmit,
  } = useAuth();

  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const [isLoggingOutAllDevices, setIsLoggingOutAllDevices] = useState(false);

  useEffect(() => {
    console.log(
      "[ControlPanel] hasPassword value:",
      hasPassword,
      "type:",
      typeof hasPassword
    );
  }, [hasPassword]);

  const handleSetPassword = async (
    password: string,
    currentPassword?: string
  ) => {
    setIsSettingPassword(true);
    setPasswordError(null);

    if (!password || password.length < 8) {
      setPasswordError(t("common.auth.changePassword.tooShort"));
      setIsSettingPassword(false);
      return;
    }

    const result = await setPassword(password, currentPassword);

    if (result.ok) {
      const wasChange = hasPassword === true;
      toast.success(
        wasChange
          ? t("common.auth.changePassword.toastChangedTitle")
          : t("common.auth.changePassword.toastSetTitle"),
        {
          description: wasChange
            ? t("common.auth.changePassword.toastChangedDescription")
            : t("common.auth.changePassword.toastSetDescription"),
        }
      );
      setIsPasswordDialogOpen(false);
      setPasswordInput("");
    } else {
      setPasswordError(
        result.error || t("common.auth.changePassword.genericError")
      );
    }

    setIsSettingPassword(false);
  };

  const handleLogoutAllDevices = async () => {
    setIsLoggingOutAllDevices(true);

    try {
      if (!isAuthenticated || !username) {
        toast.error("Authentication Error", {
          description: "Not authenticated",
        });
        return;
      }

      const response = await abortableFetch(getApiUrl("/api/auth/logout-all"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 15000,
        throwOnHttpError: false,
        retry: { maxAttempts: 1, initialDelayMs: 250 },
      });

      const data = await response.json();

      if (response.ok) {
        toast.success("Logged Out", {
          description: data.message || "Logged out from all devices",
        });

        confirmLogout();
      } else {
        toast.error("Logout Failed", {
          description: data.error || "Failed to logout from all devices",
        });
      }
    } catch (error) {
      console.error("Error logging out all devices:", error);
      toast.error("Network Error", {
        description: "Failed to connect to server",
      });
    } finally {
      setIsLoggingOutAllDevices(false);
    }
  };

  const {
    telegramLinkedAccount,
    telegramLinkSession,
    isTelegramStatusLoading,
    isCreatingTelegramLink,
    isDisconnectingTelegramLink,
    refreshTelegramLinkStatus,
    handleCreateTelegramLink,
    handleOpenTelegramLink,
    handleCopyTelegramCode,
    handleDisconnectTelegramLink,
  } = useTelegramLink({ username, isAuthenticated });

  return {
    username,
    isAuthenticated,
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
    promptVerifyToken,
    isVerifyDialogOpen,
    setVerifyDialogOpen,
    verifyPasswordInput,
    setVerifyPasswordInput,
    verifyUsernameInput,
    setVerifyUsernameInput,
    hasPassword,
    logout,
    confirmLogout,
    isLogoutConfirmDialogOpen,
    setIsLogoutConfirmDialogOpen,
    isVerifyingToken,
    verifyError,
    handleVerifyTokenSubmit,
    isPasswordDialogOpen,
    setIsPasswordDialogOpen,
    passwordInput,
    setPasswordInput,
    passwordError,
    setPasswordError,
    isSettingPassword,
    isLoggingOutAllDevices,
    handleSetPassword,
    handleLogoutAllDevices,
    telegramLinkedAccount,
    telegramLinkSession,
    isTelegramStatusLoading,
    isCreatingTelegramLink,
    isDisconnectingTelegramLink,
    refreshTelegramLinkStatus,
    handleCreateTelegramLink,
    handleOpenTelegramLink,
    handleCopyTelegramCode,
    handleDisconnectTelegramLink,
  };
}
