import { track } from "@vercel/analytics";
import { APP_ANALYTICS } from "@/utils/analytics";
import { schedulePasswordStatusCheck } from "./identityState";

interface ApplyRefreshedAuthTokenParams {
  username: string;
  token: string;
  setAuthToken: (token: string) => void;
  saveAuthTokenToRecovery: (token: string) => void;
  saveTokenRefreshTime: (username: string) => void;
}

export const applyRefreshedAuthToken = ({
  username,
  token,
  setAuthToken,
  saveAuthTokenToRecovery,
  saveTokenRefreshTime,
}: ApplyRefreshedAuthTokenParams): void => {
  setAuthToken(token);
  saveAuthTokenToRecovery(token);
  saveTokenRefreshTime(username);
};

interface ApplySuccessfulRegistrationParams {
  username: string;
  token?: string;
  setUsername: (username: string) => void;
  setAuthToken: (token: string) => void;
  saveAuthTokenToRecovery: (token: string) => void;
  saveTokenRefreshTime: (username: string) => void;
  onCheckHasPassword: () => void;
}

export const applySuccessfulRegistration = ({
  username,
  token,
  setUsername,
  setAuthToken,
  saveAuthTokenToRecovery,
  saveTokenRefreshTime,
  onCheckHasPassword,
}: ApplySuccessfulRegistrationParams): void => {
  setUsername(username);

  if (token) {
    setAuthToken(token);
    saveAuthTokenToRecovery(token);
    saveTokenRefreshTime(username);
    schedulePasswordStatusCheck(onCheckHasPassword);
  }

  track(APP_ANALYTICS.USER_CREATE, { username });
};
