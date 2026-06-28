import { apiRequest, apiRequestRaw } from "@/api/core";
import { serializeAuthCookieRequest } from "@/auth/sessionBoundary";
import type {
  CheckPasswordResponse,
  DeleteAccountResponse,
  EmailMutationResponse,
  EmailStatusResponse,
  LoginResponse,
  RecoveryRequestResponse,
  RegisterResponse,
  ResetPasswordResponse,
  SessionResponse,
  VerifyTokenResponse,
} from "@/shared/contracts/auth";

export type {
  CheckPasswordResponse,
  DeleteAccountResponse,
  EmailMutationResponse,
  EmailStatusResponse,
  LoginResponse,
  RecoveryRequestResponse,
  RegisterResponse,
  ResetPasswordResponse,
  SessionResponse,
  VerifyTokenResponse,
} from "@/shared/contracts/auth";

export async function loginWithPassword(params: {
  username: string;
  password: string;
}): Promise<LoginResponse> {
  return serializeAuthCookieRequest(() =>
    apiRequest<LoginResponse, {
      username: string;
      password: string;
    }>({
      path: "/api/auth/login",
      method: "POST",
      body: {
        username: params.username,
        password: params.password,
      },
    })
  );
}

export async function verifyAuthToken(params: {
  username: string;
  token: string;
}): Promise<VerifyTokenResponse> {
  return serializeAuthCookieRequest(() =>
    apiRequest<VerifyTokenResponse, { username: string; token: string }>({
      path: "/api/auth/token/verify",
      method: "POST",
      body: {
        username: params.username,
        token: params.token,
      },
    })
  );
}

export async function registerUser(params: {
  username: string;
  password: string;
}): Promise<RegisterResponse> {
  return serializeAuthCookieRequest(() =>
    apiRequest<RegisterResponse, { username: string; password: string }>({
      path: "/api/auth/register",
      method: "POST",
      body: params,
    })
  );
}

export async function logoutUser(): Promise<{ success: boolean }> {
  return serializeAuthCookieRequest(() =>
    apiRequest<{ success: boolean }>({
      path: "/api/auth/logout",
      method: "POST",
    })
  );
}

export async function logoutUserSafe(): Promise<void> {
  try {
    await logoutUser();
  } catch {
    // Logout should always clear local state, even if the server call fails.
  }
}

export async function checkUserPassword(): Promise<CheckPasswordResponse> {
  return apiRequest<CheckPasswordResponse>({
    path: "/api/auth/password/check",
    method: "GET",
  });
}

export async function getAuthSession(): Promise<
  | { ok: true; data: SessionResponse }
  | { ok: false; status: number }
> {
  const response = await serializeAuthCookieRequest(() =>
    apiRequestRaw({
      path: "/api/auth/session",
      method: "GET",
      timeout: 10000,
      retry: { maxAttempts: 2, initialDelayMs: 500 },
    })
  );

  if (!response.ok) {
    return { ok: false, status: response.status };
  }

  return { ok: true, data: (await response.json()) as SessionResponse };
}

export interface SetPasswordRequest {
  /** New password to store. */
  password: string;
  /**
   * Existing password. Required by the server when the user already has
   * a password set; omitted only for first-time setup on legacy accounts.
   */
  currentPassword?: string;
}

export async function setUserPassword(
  params: SetPasswordRequest
): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }, SetPasswordRequest>({
    path: "/api/auth/password/set",
    method: "POST",
    body: params,
  });
}

// ---------------------------------------------------------------------------
// Account recovery (forgot password)
// ---------------------------------------------------------------------------

export async function requestRecovery(params: {
  identifier: string;
}): Promise<RecoveryRequestResponse> {
  return apiRequest<RecoveryRequestResponse, typeof params>({
    path: "/api/auth/recovery/request",
    method: "POST",
    body: params,
  });
}

export async function resetPasswordWithCode(params: {
  identifier: string;
  code: string;
  newPassword: string;
}): Promise<ResetPasswordResponse> {
  return serializeAuthCookieRequest(() =>
    apiRequest<ResetPasswordResponse, typeof params>({
      path: "/api/auth/recovery/reset",
      method: "POST",
      body: params,
    })
  );
}

export async function logoutAllSessionsRaw(): Promise<Response> {
  return serializeAuthCookieRequest(() =>
    apiRequestRaw({
      path: "/api/auth/logout-all",
      method: "POST",
    })
  );
}

// ---------------------------------------------------------------------------
// Recovery email management (authenticated)
// ---------------------------------------------------------------------------

export async function getEmailStatus(): Promise<EmailStatusResponse> {
  return apiRequest<EmailStatusResponse>({
    path: "/api/auth/email/status",
    method: "GET",
  });
}

export async function setRecoveryEmail(params: {
  email: string;
}): Promise<EmailMutationResponse> {
  return apiRequest<EmailMutationResponse, typeof params>({
    path: "/api/auth/email/set",
    method: "POST",
    body: params,
  });
}

export async function verifyRecoveryEmail(params: {
  code: string;
}): Promise<EmailMutationResponse> {
  return apiRequest<EmailMutationResponse, typeof params>({
    path: "/api/auth/email/verify",
    method: "POST",
    body: params,
  });
}

export async function removeRecoveryEmail(): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    path: "/api/auth/email/remove",
    method: "POST",
  });
}

// ---------------------------------------------------------------------------
// Account deletion (authenticated)
// ---------------------------------------------------------------------------

export async function deleteAccount(params: {
  confirm: boolean;
  confirmUsername: string;
  currentPassword?: string;
}): Promise<DeleteAccountResponse> {
  return serializeAuthCookieRequest(() =>
    apiRequest<DeleteAccountResponse, typeof params>({
      path: "/api/auth/account/delete",
      method: "POST",
      body: params,
    })
  );
}
