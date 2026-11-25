import { apiRequest } from "@/api/core";
import type {
  GoogleCalendarSyncRequest,
  GoogleCalendarSyncResponse,
  GoogleCompleteSignupRequest,
  GoogleCompleteSignupResponse,
  GoogleContactsSyncRequest,
  GoogleContactsSyncResponse,
  GoogleOAuthMode,
  GoogleOAuthPostMessage,
  GoogleOAuthStartRequest,
  GoogleOAuthStartResponse,
  GoogleStatusResponse,
  GoogleSyncFeature,
} from "@/shared/contracts/google";

export type {
  GoogleCalendarSyncRequest,
  GoogleCalendarSyncResponse,
  GoogleCompleteSignupRequest,
  GoogleCompleteSignupResponse,
  GoogleContactsSyncRequest,
  GoogleContactsSyncResponse,
  GoogleInitialSyncChoice,
  GoogleLinkedAccountPublic,
  GoogleOAuthMode,
  GoogleOAuthPostMessage,
  GoogleOAuthStartRequest,
  GoogleOAuthStartResponse,
  GooglePendingProfile,
  GoogleStatusResponse,
  GoogleSyncFeature,
} from "@/shared/contracts/google";

const OAUTH_POPUP_WIDTH = 520;
const OAUTH_POPUP_HEIGHT = 640;
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;
const SESSION_STORAGE_RESULT_KEY = "ryos:google-oauth-result";

export async function startGoogleOAuth(
  params: GoogleOAuthStartRequest
): Promise<GoogleOAuthStartResponse> {
  return apiRequest<GoogleOAuthStartResponse, GoogleOAuthStartRequest>({
    path: "/api/auth/google/start",
    method: "POST",
    body: params,
  });
}

export async function completeGoogleSignup(
  params: GoogleCompleteSignupRequest
): Promise<GoogleCompleteSignupResponse> {
  return apiRequest<GoogleCompleteSignupResponse, GoogleCompleteSignupRequest>({
    path: "/api/auth/google/complete-signup",
    method: "POST",
    body: params,
  });
}

export async function getGoogleStatus(): Promise<GoogleStatusResponse> {
  return apiRequest<GoogleStatusResponse>({
    path: "/api/google/status",
    method: "GET",
  });
}

export async function disconnectGoogleAccount(): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>({
    path: "/api/google/disconnect",
    method: "POST",
  });
}

export async function syncGoogleCalendarApi(
  body: GoogleCalendarSyncRequest
): Promise<GoogleCalendarSyncResponse> {
  return apiRequest<GoogleCalendarSyncResponse, GoogleCalendarSyncRequest>({
    path: "/api/google/calendar/sync",
    method: "POST",
    body,
    timeout: 45_000,
  });
}

export async function syncGoogleContactsApi(
  body: GoogleContactsSyncRequest
): Promise<GoogleContactsSyncResponse> {
  return apiRequest<GoogleContactsSyncResponse, GoogleContactsSyncRequest>({
    path: "/api/google/contacts/sync",
    method: "POST",
    body,
    timeout: 45_000,
  });
}

export function consumeRedirectGoogleOAuthResult(): GoogleOAuthPostMessage | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_RESULT_KEY);
    if (raw) {
      sessionStorage.removeItem(SESSION_STORAGE_RESULT_KEY);
      const parsed = JSON.parse(raw) as GoogleOAuthPostMessage;
      if (parsed && parsed.type === "ryos:google-oauth-result") {
        return parsed;
      }
    }
  } catch {
    // Ignore storage errors in restricted contexts.
  }
  return null;
}

export async function openGoogleOAuthPopup(options: {
  mode: GoogleOAuthMode;
  features?: GoogleSyncFeature[];
}): Promise<GoogleOAuthPostMessage> {
  if (typeof window === "undefined") {
    throw new Error("Google OAuth requires a browser window");
  }

  // Open an about:blank popup synchronously within the user gesture so popup blockers allow it.
  const left = Math.max(
    0,
    Math.round(window.screenX + (window.outerWidth - OAUTH_POPUP_WIDTH) / 2)
  );
  const top = Math.max(
    0,
    Math.round(window.screenY + (window.outerHeight - OAUTH_POPUP_HEIGHT) / 2)
  );
  const featuresStr = `popup=yes,width=${OAUTH_POPUP_WIDTH},height=${OAUTH_POPUP_HEIGHT},left=${left},top=${top}`;
  const popup = window.open("about:blank", "ryos_google_oauth", featuresStr);

  if (!popup) {
    // Popup blocked (e.g. mobile standalone webview) — fall back to full-page redirect.
    const { authUrl } = await startGoogleOAuth({
      mode: options.mode,
      features: options.features,
      returnMode: "redirect",
    });
    window.location.assign(authUrl);
    return new Promise<GoogleOAuthPostMessage>(() => {});
  }

  let authUrl: string;
  try {
    const started = await startGoogleOAuth({
      mode: options.mode,
      features: options.features,
      returnMode: "popup",
    });
    authUrl = started.authUrl;
  } catch (err) {
    try {
      popup.close();
    } catch {
      // Ignore close errors.
    }
    throw err;
  }

  popup.location.href = authUrl;

  return new Promise<GoogleOAuthPostMessage>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      window.removeEventListener("message", handleMessage);
      clearInterval(closePollTimer);
      clearTimeout(timeoutTimer);
    };

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      const data = event.data as GoogleOAuthPostMessage | undefined;
      if (!data || data.type !== "ryos:google-oauth-result") {
        return;
      }
      finish(() => resolve(data));
    };

    const closePollTimer = setInterval(() => {
      try {
        if (popup.closed) {
          finish(() =>
            reject(new Error("Google sign-in window was closed before completing."))
          );
        }
      } catch {
        // Cross-origin frame access while on accounts.google.com may throw on some shells; ignore.
      }
    }, 500);

    const timeoutTimer = setTimeout(() => {
      try {
        popup.close();
      } catch {
        // Ignore close errors.
      }
      finish(() => reject(new Error("Google sign-in timed out.")));
    }, OAUTH_TIMEOUT_MS);

    window.addEventListener("message", handleMessage);
  });
}
