import type { RyosAuthPopupStatus, RyosDesktopApi } from "@/types/ryos-desktop";
import { createClientLogger } from "@/utils/logger";

/**
 * MusicKit `authorize()` with the iOS shell's recovery path.
 *
 * MusicKit opens Apple's sign-in page with `window.open` (synchronously,
 * inside `authorize()`) and waits on that window — forever, if `window.open`
 * returned null. The iOS shell shows the popup as a sheet and reports what
 * happened to it (`onAuthPopupStatus`). When the sheet doesn't come up, this
 * unwinds MusicKit's attempt and runs the same Apple page in the system auth
 * sheet (`openAuthSheet`) through `/musickit-auth.html`, then hands MusicKit
 * the token Apple returns. Everywhere else it is plain `authorize()`.
 */

const log = createClientLogger("MusicKit");

const APPLE_AUTHORIZE_PREFIX = "https://authorize.music.apple.com/";
export const MUSICKIT_AUTH_PAGE_PATH = "/musickit-auth.html";
/** Must match the redirect in public/musickit-auth.html. */
export const MUSICKIT_AUTH_CALLBACK = "ryos-auth://musickit";
/** The shell reports a popup sheet within ~3s; this is the backstop. */
export const POPUP_STATUS_TIMEOUT_MS = 5_000;

export interface AuthorizeMusicKitOptions {
  popupStatusTimeoutMs?: number;
  /** Origin serving the auth page; defaults to the current page's. */
  origin?: string;
}

type FallbackBridge = RyosDesktopApi &
  Required<Pick<RyosDesktopApi, "openAuthSheet" | "onAuthPopupStatus">>;

interface WritableAuthState {
  musicUserToken: string;
  restrictedEnabled: boolean;
  storefrontId: string;
}

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error: unknown) => ({ ok: false, error })
  );
}

function hasAuthFallback(bridge: RyosDesktopApi): bridge is FallbackBridge {
  return (
    typeof bridge.openAuthSheet === "function" &&
    typeof bridge.onAuthPopupStatus === "function"
  );
}

/**
 * Patches `window.open` so MusicKit gets a handle we can close even when the
 * shell returned no window: closing it is how MusicKit's own attempt unwinds
 * (it polls `closed` and rejects).
 */
function interceptAuthorizeWindow() {
  const originalOpen = window.open;
  const popup = {
    url: null as string | null,
    real: null as Window | null,
    forcedClosed: false,
    close() {
      popup.forcedClosed = true;
      popup.real?.close();
    },
    restore() {
      window.open = originalOpen;
    },
  };
  const handle = {
    // MusicKit only passes a target origin to postMessage when `w.window === w`.
    get window() {
      return handle;
    },
    get closed() {
      return popup.forcedClosed || Boolean(popup.real?.closed);
    },
    close: () => popup.close(),
    focus: () => popup.real?.focus(),
    postMessage: (message: unknown, targetOrigin: string) =>
      popup.real?.postMessage(message, targetOrigin),
  };
  window.open = function (
    this: Window | undefined,
    url?: string | URL,
    target?: string,
    features?: string
  ) {
    const real = originalOpen.call(this ?? window, url, target, features);
    const href = url === undefined ? "" : String(url);
    if (popup.url || !href.startsWith(APPLE_AUTHORIZE_PREFIX)) return real;
    popup.url = href;
    popup.real = real;
    return handle as unknown as Window;
  } as typeof window.open;
  return popup;
}

/** The auth-sheet entry point: the bounce page, which forwards to Apple. */
export function buildAuthSheetUrl(authorizeUrl: string, origin: string): string {
  const page = new URL(MUSICKIT_AUTH_PAGE_PATH, origin);
  const target = new URL(authorizeUrl);
  // Apple sends the token back to `referrer`, but only when it shares an
  // origin with the page that navigated to it (the bounce page).
  target.searchParams.set("referrer", page.href);
  page.searchParams.set("to", target.href);
  return page.href;
}

/** Reads Apple's `#base64({ musicUserToken, itre, cid })` hand-off. */
export function parseAuthSheetCallback(url: string): {
  musicUserToken: string;
  restricted: boolean;
} {
  const hashIndex = url.indexOf("#");
  let data: { musicUserToken?: unknown; itre?: unknown } | null = null;
  try {
    data = JSON.parse(atob(decodeURIComponent(url.slice(hashIndex + 1))));
  } catch {
    data = null;
  }
  if (hashIndex === -1 || typeof data?.musicUserToken !== "string" || !data.musicUserToken) {
    throw new Error("Apple Music sign-in finished without a token");
  }
  return { musicUserToken: data.musicUserToken, restricted: String(data.itre) === "1" };
}

export async function authorizeMusicKit(
  inst: MusicKit.MusicKitInstance,
  options: AuthorizeMusicKitOptions = {}
): Promise<string | undefined> {
  const bridge = typeof window !== "undefined" ? window.ryosDesktop : undefined;
  if (bridge?.platform !== "ios") return inst.authorize();
  const fallback = hasAuthFallback(bridge) ? bridge : null;

  let presented = false;
  let reportStatus: (status: RyosAuthPopupStatus) => void = () => {};
  const firstStatus = new Promise<RyosAuthPopupStatus>((resolve) => {
    reportStatus = resolve;
  });
  const popup = interceptAuthorizeWindow();
  const unsubscribe = fallback?.onAuthPopupStatus((status) => {
    if (!status?.url?.startsWith(APPLE_AUTHORIZE_PREFIX)) return;
    log.debug("Apple Music popup status from the iOS shell", {
      status: status.status,
      reason: status.reason,
    });
    if (status.status === "presented") presented = true;
    // The user dismissed the sheet: let MusicKit see its window close.
    if (status.status === "closed") popup.close();
    reportStatus(status);
  });

  let authorizing: Promise<string>;
  try {
    authorizing = inst.authorize();
  } finally {
    popup.restore();
  }
  const attempt = settle(authorizing);

  try {
    // Already signed in: MusicKit returned without opening its page.
    if (!popup.url) return await authorizing;

    if (!fallback) {
      if (popup.real) return await authorizing;
      log.error("Apple Music sign-in popup was blocked by this iOS shell build");
      popup.close();
      await attempt;
      throw new Error(
        "Apple Music sign-in can't open in this version of the ryOS app. Update the app and try again."
      );
    }

    const reason = popup.real
      ? await whyPopupFailed(
          attempt,
          firstStatus,
          () => presented,
          options.popupStatusTimeoutMs ?? POPUP_STATUS_TIMEOUT_MS
        )
      : "window.open returned null";
    if (!reason) return await authorizing;

    log.warn("Apple Music popup did not open in the iOS shell; using the system auth sheet", {
      reason,
    });
    popup.close();
    // Wait out MusicKit's own attempt too, so a retry doesn't overlap it.
    const [sheet, earlier] = await Promise.all([
      settle(openSheet(fallback, popup.url, reason, options.origin ?? window.location.origin)),
      attempt,
    ]);
    if (earlier.ok && earlier.value) return earlier.value;
    if (!sheet.ok) throw sheet.error;
    return await adoptToken(inst, sheet.value.url);
  } finally {
    unsubscribe?.();
  }
}

/** Null when MusicKit's own popup is up (or already settled the sign-in). */
async function whyPopupFailed(
  attempt: Promise<Settled<string>>,
  firstStatus: Promise<RyosAuthPopupStatus>,
  wasPresented: () => boolean,
  timeoutMs: number
): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const first = await Promise.race([
    attempt.then((result) => ({ kind: "settled" as const, result })),
    firstStatus.then((status) => ({ kind: "status" as const, status })),
    new Promise<{ kind: "timeout" }>((resolve) => {
      timer = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
    }),
  ]);
  clearTimeout(timer);
  switch (first.kind) {
    case "timeout":
      return `no popup status from the shell in ${timeoutMs}ms`;
    case "settled":
      return first.result.ok || wasPresented() ? null : "popup closed before it was shown";
    case "status": {
      const { status, reason } = first.status;
      if (status === "presented" || status === "closed") return null;
      return `${status} (${reason ?? "no reason"})`;
    }
  }
}

async function openSheet(
  bridge: FallbackBridge,
  authorizeUrl: string,
  reason: string,
  origin: string
): Promise<{ url: string }> {
  try {
    return await bridge.openAuthSheet({
      url: buildAuthSheetUrl(authorizeUrl, origin),
      callback: MUSICKIT_AUTH_CALLBACK,
      reason: `musickit popup ${reason}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("Apple Music auth sheet did not finish", { message });
    throw new Error(
      message === "cancelled"
        ? "Apple Music sign-in was cancelled"
        : `Apple Music sign-in failed: ${message}`
    );
  }
}

/** What MusicKit does with the same hand-off when it lands in `location.hash`. */
async function adoptToken(inst: MusicKit.MusicKitInstance, callbackUrl: string) {
  const { musicUserToken, restricted } = parseAuthSheetCallback(callbackUrl);
  const writable = inst as unknown as WritableAuthState;
  if (restricted) writable.restrictedEnabled = true;
  writable.musicUserToken = musicUserToken;
  try {
    const response = await inst.api.music<{ data?: Array<{ id?: string }> }>(
      "/v1/me/storefront"
    );
    const storefrontId = response.data?.data?.[0]?.id;
    if (storefrontId) writable.storefrontId = storefrontId;
  } catch (error) {
    log.warn("Could not read the Apple Music storefront after auth-sheet sign-in", { error });
  }
  log.info("Apple Music signed in through the system auth sheet", {
    isAuthorized: inst.isAuthorized,
  });
  return musicUserToken;
}
