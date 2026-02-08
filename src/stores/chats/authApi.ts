import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";

interface RefreshTokenRequestParams {
  username: string;
  oldToken: string;
}

export const refreshAuthTokenRequest = async ({
  username,
  oldToken,
}: RefreshTokenRequestParams): Promise<Response> =>
  abortableFetch("/api/auth/token/refresh", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username,
      oldToken,
    }),
    timeout: 15000,
    throwOnHttpError: false,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });

interface RegisterUserRequestParams {
  username: string;
  password: string;
}

export const registerUserRequest = async ({
  username,
  password,
}: RegisterUserRequestParams): Promise<Response> =>
  abortableFetch(getApiUrl("/api/auth/register"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    timeout: 15000,
    throwOnHttpError: false,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });

interface LogoutRequestParams {
  username: string;
  token: string;
}

export const logoutRequest = async ({
  username,
  token,
}: LogoutRequestParams): Promise<Response> =>
  abortableFetch(getApiUrl("/api/auth/logout"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Username": username,
    },
    timeout: 15000,
    throwOnHttpError: false,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
