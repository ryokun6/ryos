import { apiRequest, ApiRequestError } from "@/api/core";

export interface SavedAppleMusicUserTokenResponse {
  authenticated: boolean;
  hasToken: boolean;
  musicUserToken?: string;
  updatedAt?: string;
  lastValidatedAt?: string | null;
}

export interface AppleMusicUserTokenMutationResponse {
  ok: boolean;
  hasToken: boolean;
  authenticated?: boolean;
  updatedAt?: string;
  lastValidatedAt?: string | null;
}

const USER_TOKEN_PATH = "/api/musickit/user-token";

function unauthenticatedTokenResponse(): SavedAppleMusicUserTokenResponse {
  return { authenticated: false, hasToken: false };
}

function unauthenticatedMutationResponse(): AppleMusicUserTokenMutationResponse {
  return { ok: false, authenticated: false, hasToken: false };
}

export async function getSavedAppleMusicUserToken(): Promise<SavedAppleMusicUserTokenResponse> {
  try {
    return await apiRequest<SavedAppleMusicUserTokenResponse>({
      path: USER_TOKEN_PATH,
      method: "GET",
    });
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 401) {
      return unauthenticatedTokenResponse();
    }
    throw err;
  }
}

export async function saveAppleMusicUserToken(
  musicUserToken: string,
  options: { validated?: boolean } = {}
): Promise<AppleMusicUserTokenMutationResponse> {
  try {
    return await apiRequest<
      AppleMusicUserTokenMutationResponse,
      { musicUserToken: string; validated?: boolean }
    >({
      path: USER_TOKEN_PATH,
      method: "PUT",
      body: {
        musicUserToken,
        ...(options.validated ? { validated: true } : {}),
      },
    });
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 401) {
      return unauthenticatedMutationResponse();
    }
    throw err;
  }
}

export async function deleteSavedAppleMusicUserToken(): Promise<AppleMusicUserTokenMutationResponse> {
  try {
    return await apiRequest<AppleMusicUserTokenMutationResponse>({
      path: USER_TOKEN_PATH,
      method: "DELETE",
    });
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 401) {
      return unauthenticatedMutationResponse();
    }
    throw err;
  }
}
