import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";
import { withChatRequestDefaults } from "./requestConfig";

interface RefreshTokenRequestParams {
  username: string;
  oldToken: string;
}

export const refreshAuthTokenRequest = async ({
  username,
  oldToken,
}: RefreshTokenRequestParams): Promise<Response> =>
  abortableFetch(
    "/api/auth/token/refresh",
    withChatRequestDefaults({
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username,
      oldToken,
    }),
    })
  );

interface RegisterUserRequestParams {
  username: string;
  password: string;
}

export const registerUserRequest = async ({
  username,
  password,
}: RegisterUserRequestParams): Promise<Response> =>
  abortableFetch(
    getApiUrl("/api/auth/register"),
    withChatRequestDefaults({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
    })
  );

interface LogoutRequestParams {
  username: string;
  token: string;
}

export const logoutRequest = async ({
  username,
  token,
}: LogoutRequestParams): Promise<Response> =>
  abortableFetch(
    getApiUrl("/api/auth/logout"),
    withChatRequestDefaults({
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Username": username,
    },
    })
  );
