import { fetchPasswordStatus, submitPassword } from "./passwordFlow";

interface PasswordActionContext {
  username: string | null;
  authToken: string | null;
  setHasPassword: (value: boolean | null) => void;
}

export const runCheckHasPasswordFlow = async ({
  username,
  authToken,
  setHasPassword,
}: PasswordActionContext): Promise<{ ok: boolean; error?: string }> => {
  if (!username || !authToken) {
    console.log("[ChatsStore] checkHasPassword: No username or token, setting null");
    setHasPassword(null);
    return { ok: false, error: "Authentication required" };
  }

  console.log("[ChatsStore] checkHasPassword: Checking for user", username);
  try {
    const result = await fetchPasswordStatus({ username, authToken });

    if (result.ok) {
      console.log("[ChatsStore] checkHasPassword: Result", result);
      setHasPassword(result.hasPassword);
      return { ok: true };
    }

    console.log("[ChatsStore] checkHasPassword: Failed");
    setHasPassword(null);
    return { ok: false, error: result.error };
  } catch (error) {
    console.error("[ChatsStore] Error checking password status:", error);
    setHasPassword(null);
    return {
      ok: false,
      error: "Network error while checking password",
    };
  }
};

interface SetPasswordFlowContext extends PasswordActionContext {
  password: string;
}

export const runSetPasswordFlow = async ({
  username,
  authToken,
  password,
  setHasPassword,
}: SetPasswordFlowContext): Promise<{ ok: boolean; error?: string }> => {
  if (!username || !authToken) {
    return { ok: false, error: "Authentication required" };
  }

  try {
    const result = await submitPassword({
      username,
      authToken,
      password,
    });

    if (!result.ok) {
      return {
        ok: false,
        error: result.error || "Failed to set password",
      };
    }

    setHasPassword(true);
    return { ok: true };
  } catch (error) {
    console.error("[ChatsStore] Error setting password:", error);
    return { ok: false, error: "Network error while setting password" };
  }
};
