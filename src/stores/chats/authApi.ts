import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";
import { withChatRequestDefaults } from "./transport";

export type RefreshTokenResult = {
  ok: boolean;
  error?: string;
  token?: string;
};

export type RefreshTokenHandler = () => Promise<RefreshTokenResult>;

export const makeAuthenticatedRequest = async (
  url: string,
  options: RequestInit,
  refreshToken: RefreshTokenHandler
): Promise<Response> => {
  const initialResponse = await abortableFetch(
    url,
    withChatRequestDefaults({
      ...options,
    })
  );

  if (
    initialResponse.status !== 401 ||
    !options.headers ||
    !("Authorization" in options.headers)
  ) {
    return initialResponse;
  }

  console.log("[ChatsStore] Received 401, attempting token refresh...");

  const refreshResult = await refreshToken();
  if (!refreshResult.ok || !refreshResult.token) {
    console.log(
      "[ChatsStore] Token refresh failed, returning original 401 response"
    );
    return initialResponse;
  }

  const newHeaders = {
    ...options.headers,
    Authorization: `Bearer ${refreshResult.token}`,
  };

  console.log("[ChatsStore] Retrying request with refreshed token");
  return abortableFetch(
    url,
    withChatRequestDefaults({
      ...options,
      headers: newHeaders,
    })
  );
};

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
