import { useState, useCallback } from "react";
import { toast } from "sonner";
import { track } from "@vercel/analytics";
import { APP_ANALYTICS } from "@/utils/analytics";
import { useChatsStoreShallow } from "@/stores/helpers";

export function useAuth() {
  const {
    username,
    authToken,
    hasPassword,
    setAuthToken,
    setUsername,
    createUser,
    logout,
    checkHasPassword: storeCheckHasPassword,
    setPassword: storeSetPassword,
  } = useChatsStoreShallow((state) => ({
    username: state.username,
    authToken: state.authToken,
    hasPassword: state.hasPassword,
    setAuthToken: state.setAuthToken,
    setUsername: state.setUsername,
    createUser: state.createUser,
    logout: state.logout,
    checkHasPassword: state.checkHasPassword,
    setPassword: state.setPassword,
  }));

  // Set username dialog states
  const [isUsernameDialogOpen, setIsUsernameDialogOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isSettingUsername, setIsSettingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  // Token verification dialog states
  const [isVerifyDialogOpen, setVerifyDialogOpen] = useState(false);
  const [verifyTokenInput, setVerifyTokenInput] = useState("");
  const [verifyPasswordInput, setVerifyPasswordInput] = useState("");
  const [verifyUsernameInput, setVerifyUsernameInput] = useState("");
  const [isVerifyingToken, setIsVerifyingToken] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Password state is now managed by the store

  // Logout confirmation dialog state
  const [isLogoutConfirmDialogOpen, setIsLogoutConfirmDialogOpen] =
    useState(false);

  // Username management
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

    // If we have a different user already logged in, clear their data first
    if (username && username !== trimmedUsername) {
      console.log(
        "[useAuth] Clearing old user data for different user:",
        username,
        "->",
        trimmedUsername
      );
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
  }, [newUsername, newPassword, createUser]);

  // Token verification management
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

          // If we have a different user already logged in, clear their data first
          if (username && username !== targetUsername) {
            console.log(
              "[useAuth] Clearing old user data for different user login:",
              username,
              "->",
              targetUsername
            );
            await logout();
          }

          // Authenticate with password
          const response = await fetch(
            "/api/auth/login",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
              },
              body: JSON.stringify({
                username: targetUsername,
                password: input.trim(),
                ...(authToken ? { oldToken: authToken } : {}),
              }),
            }
          );

          if (!response.ok) {
            const data = await response.json();
            setVerifyError(data.error || "Invalid username or password");
            return;
          }

          const result = await response.json();
          if (result.token) {
            setAuthToken(result.token);
            // Set username from the response to ensure it's properly stored
            if (result.username) {
              setUsername(result.username);
            }
            // Track password login analytics
            track(APP_ANALYTICS.USER_LOGIN_PASSWORD, {
              username: result.username || targetUsername,
            });
            toast.success("Success", {
              description: "Logged in successfully with password",
            });
            setVerifyDialogOpen(false);
            setVerifyPasswordInput("");
            // Also close the sign-up/username dialog if it happens to be open
            setIsUsernameDialogOpen(false);
          }
        } else {
          // For token login, clear any existing user data to prevent token mixing
          if (username || authToken) {
            console.log(
              "[useAuth] Clearing existing user data before token login to prevent mixing"
            );
            await logout();
          }

          // Test the token using the dedicated verification endpoint
          const testResponse = await fetch(
            "/api/auth/token/verify",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${input.trim()}`,
                "X-Username": verifyUsernameInput.trim() || "",
              },
            }
          );

          if (!testResponse.ok) {
            if (testResponse.status === 401) {
              setVerifyError("Invalid token - authentication failed");
            } else {
              setVerifyError(
                `Token validation failed (${testResponse.status})`
              );
            }
            return;
          }

          // Parse the response to get validation details
          const result = await testResponse.json();
          console.log("[useAuth] Token validation successful:", result);

          // Token is valid, set it in the store
          setAuthToken(input.trim());

          // Set username from the response to ensure it's properly stored
          if (result.username) {
            setUsername(result.username);
          }

          // Track token login analytics
          track(APP_ANALYTICS.USER_LOGIN_TOKEN, {
            username: result.username || "",
          });

          toast.success("Success", {
            description: "Token verified and set successfully",
          });
          setVerifyDialogOpen(false);
          setVerifyTokenInput("");
          // Also close the sign-up/username dialog if it happens to be open
          setIsUsernameDialogOpen(false);
        }
      } catch (err) {
        console.error("[useAuth] Error verifying:", err);
        setVerifyError("Network error while verifying");
      } finally {
        setIsVerifyingToken(false);
      }
    },
    [setAuthToken, setUsername, username, verifyUsernameInput]
  );

  // Check if user has a password set (now uses store)
  const checkHasPassword = useCallback(async () => {
    return storeCheckHasPassword();
  }, [storeCheckHasPassword]);

  // Set password for existing user (now uses store)
  const setPassword = useCallback(
    async (password: string) => {
      return storeSetPassword(password);
    },
    [storeSetPassword]
  );

  // Logout functionality
  const handleLogout = useCallback(async () => {
    console.log("[useAuth] Logging out user...");

    // Clear local dialog states
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
    // hasPassword is now managed by the store and reset automatically on logout

    // Call store logout to clear all user data and refresh rooms
    await logout();

    toast.success("Logged Out", {
      description: "You have been successfully logged out.",
    });
  }, [logout]);

  // Show logout confirmation dialog
  const promptLogout = useCallback(async () => {
    setIsLogoutConfirmDialogOpen(true);
  }, []);

  // Handle logout confirmation
  const confirmLogout = useCallback(() => {
    setIsLogoutConfirmDialogOpen(false);
    handleLogout();
  }, [handleLogout]);

  return {
    // State
    username,
    authToken,
    hasPassword,

    // Username management
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

    // Token verification
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

    // Password management
    checkHasPassword,
    setPassword,

    // Logout
    logout: promptLogout,
    confirmLogout,
    isLogoutConfirmDialogOpen,
    setIsLogoutConfirmDialogOpen,
  };
}
