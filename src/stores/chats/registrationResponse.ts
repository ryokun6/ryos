interface RegisterUserResponseData {
  user?: {
    username: string;
  };
  token?: string;
}

export const parseRegisterUserResponse = (
  data: RegisterUserResponseData
):
  | { ok: true; username: string; token?: string }
  | { ok: false; error: string } => {
  if (!data.user?.username) {
    return { ok: false, error: "Invalid response format" };
  }

  return {
    ok: true,
    username: data.user.username,
    token: data.token,
  };
};
