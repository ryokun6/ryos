import { applySuccessfulRegistration } from "./authStateUpdates";
import { registerUserRequest } from "./authApi";
import { readErrorResponseBody } from "./httpErrors";
import { parseRegisterUserResponse } from "./authParsers";
import { validateCreateUserInput } from "./userValidation";

interface CreateUserFlowParams {
  username: string;
  password: string;
  setUsername: (username: string) => void;
  setAuthToken: (token: string) => void;
  saveAuthTokenToRecovery: (token: string) => void;
  saveTokenRefreshTime: (username: string) => void;
  onCheckHasPassword: () => void;
}

export const runCreateUserFlow = async ({
  username,
  password,
  setUsername,
  setAuthToken,
  saveAuthTokenToRecovery,
  saveTokenRefreshTime,
  onCheckHasPassword,
}: CreateUserFlowParams): Promise<{ ok: boolean; error?: string }> => {
  const trimmedUsername = username.trim();
  const validationError = validateCreateUserInput({
    username: trimmedUsername,
    password,
  });
  if (validationError) {
    return { ok: false, error: validationError };
  }

  try {
    const response = await registerUserRequest({
      username: trimmedUsername,
      password,
    });

    if (!response.ok) {
      const errorData = await readErrorResponseBody(response);
      return {
        ok: false,
        error: errorData.error || "Failed to create user",
      };
    }

    const data = await response.json();
    const parsedRegister = parseRegisterUserResponse(data);
    if (!parsedRegister.ok) {
      return { ok: false, error: parsedRegister.error };
    }

    applySuccessfulRegistration({
      username: parsedRegister.username,
      token: parsedRegister.token,
      setUsername,
      setAuthToken,
      saveAuthTokenToRecovery,
      saveTokenRefreshTime,
      onCheckHasPassword,
    });

    return { ok: true };
  } catch (error) {
    console.error("[ChatsStore] Error creating user:", error);
    return { ok: false, error: "Network error. Please try again." };
  }
};
