import { abortableFetch } from "@/utils/abortableFetch";
import { getApiUrl } from "@/utils/platform";
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

interface SetPasswordRequestParams extends PasswordAuthContext {
  password: string;
}

export const setPasswordRequest = async ({
  username,
  authToken,
  password,
}: SetPasswordRequestParams): Promise<Response> =>
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
