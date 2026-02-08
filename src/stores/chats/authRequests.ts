import { abortableFetch } from "@/utils/abortableFetch";

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
  const initialResponse = await abortableFetch(url, {
    ...options,
    timeout: 15000,
    throwOnHttpError: false,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });

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
  return abortableFetch(url, {
    ...options,
    headers: newHeaders,
    timeout: 15000,
    throwOnHttpError: false,
    retry: { maxAttempts: 1, initialDelayMs: 250 },
  });
};
