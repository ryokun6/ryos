import { readErrorResponseBody } from "./httpErrors";
import {
  checkPasswordStatusRequest,
  setPasswordRequest,
} from "./passwordApi";

interface PasswordAuthContext {
  username: string;
  authToken: string;
}

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
