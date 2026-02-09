interface RefreshTokenResponseData {
  token?: string;
}

export const parseRefreshTokenResponse = (
  data: RefreshTokenResponseData
): { ok: true; token: string } | { ok: false; error: string } => {
  if (data.token) {
    return { ok: true, token: data.token };
  }

  return {
    ok: false,
    error: "Invalid response format for token refresh",
  };
};
