import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";
import { readErrorResponseBody } from "./httpErrors";
import { withChatRequestDefaults } from "./requestConfig";

interface PasswordAuthContext {
  username: string;
  authToken: string;
}

export const checkPasswordStatusRequest = async ({
  username,
  authToken,
}: PasswordAuthContext): Promise<Response> =>
  abortableFetch(
    "/api/auth/password/check",
    withChatRequestDefaults({
      method: "GET",
      headers: {
        Authorization: `Bearer ${authToken}`,
        "X-Username": username,
      },
    })
  );

export const fetchPasswordStatus = async ({
  username,
  authToken,
}: PasswordAuthContext): Promise<
  { ok: true; hasPassword: boolean } | { ok: false; error: string }
> => {
  const response = await checkPasswordStatusRequest({
    username,
    authToken,
  });

  if (!response.ok) {
    return { ok: false, error: "Failed to check password status" };
  }

  const data = (await response.json()) as { hasPassword?: unknown };
  return { ok: true, hasPassword: Boolean(data.hasPassword) };
};

interface SetPasswordContext extends PasswordAuthContext {
  password: string;
}

export const setPasswordRequest = async ({
  username,
  authToken,
  password,
}: SetPasswordContext): Promise<Response> =>
  abortableFetch(
    getApiUrl("/api/auth/password/set"),
    withChatRequestDefaults({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
        "X-Username": username,
      },
      body: JSON.stringify({ password }),
    })
  );

export const submitPassword = async ({
  username,
  authToken,
  password,
}: SetPasswordContext): Promise<{ ok: true } | { ok: false; error: string }> => {
  const response = await setPasswordRequest({
    username,
    authToken,
    password,
  });

  if (!response.ok) {
    const errorData = await readErrorResponseBody(response);
    return {
      ok: false,
      error: errorData.error || "Failed to set password",
    };
  }

  return { ok: true };
};

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
