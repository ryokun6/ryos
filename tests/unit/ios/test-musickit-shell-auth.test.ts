/**
 * Apple Music sign-in inside the iOS shell (`src/utils/musicKitShellAuth.ts`).
 *
 * MusicKit's `authorize()` opens Apple's page with `window.open` and waits on
 * that window. These run a stand-in with the same window handling against a
 * fake shell bridge: a popup sheet that comes up is left alone, and one that
 * doesn't (null window, "failed" status, or no status at all) is replaced by
 * the system auth sheet, whose token MusicKit then adopts.
 */
import { afterAll, afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ensureTestLocalStorage } from "../../setup";

let registeredDomHere = false;
if (typeof document === "undefined") {
  GlobalRegistrator.register();
  registeredDomHere = true;
}
ensureTestLocalStorage();

const {
  MUSICKIT_AUTH_CALLBACK,
  MUSICKIT_AUTH_PAGE_PATH,
  authorizeMusicKit,
  buildAuthSheetUrl,
  parseAuthSheetCallback,
} = await import("../../../src/utils/musicKitShellAuth");

const ORIGIN = "https://os.ryo.lu";
const AUTHORIZE_URL =
  "https://authorize.music.apple.com/woa?a=abc&referrer=os.ryo.lu&app=music&p=subscribe";
const AUTH_PAGE = readFileSync(
  join(import.meta.dir, "../../../public", MUSICKIT_AUTH_PAGE_PATH),
  "utf8"
);

const win = window as unknown as Record<string, unknown> & { open: typeof window.open };
const originalOpen = win.open;

type Status = { status: string; reason?: string; url: string };

interface FakeRealWindow {
  closed: boolean;
  close: ReturnType<typeof mock>;
  focus: ReturnType<typeof mock>;
  postMessage: ReturnType<typeof mock>;
}

function fakeRealWindow(): FakeRealWindow {
  const real: FakeRealWindow = {
    closed: false,
    close: mock(() => {
      real.closed = true;
    }),
    focus: mock(() => {}),
    postMessage: mock(() => {}),
  };
  return real;
}

/** What WKWebView's window.open returns: the popup's window, or null. */
function shellOpens(real: FakeRealWindow | null) {
  const open = mock(() => real as unknown as Window | null);
  win.open = open as unknown as typeof window.open;
  return open;
}

function tokenCallback(token: string, itre = "0") {
  return `${MUSICKIT_AUTH_CALLBACK}#${btoa(JSON.stringify({ musicUserToken: token, itre, cid: "c" }))}`;
}

function fakeShell(options: { fallback?: boolean; sheet?: () => Promise<{ url: string }> } = {}) {
  const listeners = new Set<(status: Status) => void>();
  const shell = {
    platform: "ios",
    listeners,
    emit(status: Status) {
      for (const listener of listeners) listener(status);
    },
    openAuthSheet: mock(options.sheet ?? (async () => ({ url: tokenCallback("sheet-token") }))),
    onAuthPopupStatus: (cb: (status: Status) => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  const bridge: Record<string, unknown> = { platform: "ios" };
  if (options.fallback !== false) {
    bridge.openAuthSheet = shell.openAuthSheet;
    bridge.onAuthPopupStatus = shell.onAuthPopupStatus;
  }
  win.ryosDesktop = bridge;
  return shell;
}

/**
 * MusicKit JS v3's authorize(): opens Apple's page synchronously, polls the
 * window's `closed`, and rejects once it closes without a token. A null
 * window is never polled, so that sign-in never settles.
 */
function fakeMusicKit(signedInAs = "") {
  const inst = {
    musicUserToken: signedInAs,
    restrictedEnabled: false,
    storefrontId: "us",
    get isAuthorized() {
      return Boolean(inst.musicUserToken);
    },
    api: { music: mock(async (_path: string) => ({ data: { data: [{ id: "jp" }] } })) },
    opened: undefined as (Window & { window: unknown }) | null | undefined,
    settled: false,
    finish: (_token: string) => {},
    authorize: mock(() => {
      if (inst.musicUserToken) return Promise.resolve(inst.musicUserToken);
      return new Promise<string>((resolve, reject) => {
        const opened = window.open(AUTHORIZE_URL, "AppleMusicAuthorizeWindow", "width=500");
        inst.opened = opened as typeof inst.opened;
        const done = () => {
          inst.settled = true;
          clearInterval(timer);
        };
        inst.finish = (token) => {
          done();
          inst.musicUserToken = token;
          resolve(token);
        };
        const timer = opened
          ? setInterval(() => {
              if (!opened.closed) return;
              done();
              reject(new Error("Unauthorized"));
            }, 5)
          : undefined;
      });
    }),
  };
  return inst;
}

const asInstance = (inst: ReturnType<typeof fakeMusicKit>) =>
  inst as unknown as MusicKit.MusicKitInstance;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let warn: ReturnType<typeof spyOn>;
let error: ReturnType<typeof spyOn>;

beforeEach(() => {
  warn = spyOn(console, "warn").mockImplementation(() => {});
  error = spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  error.mockRestore();
  win.open = originalOpen;
  delete win.ryosDesktop;
});

afterAll(() => {
  if (registeredDomHere && GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
});

describe("authorizeMusicKit outside the iOS shell", () => {
  test("is MusicKit's own authorize()", async () => {
    const open = shellOpens(fakeRealWindow());
    const inst = fakeMusicKit();
    const result = authorizeMusicKit(asInstance(inst), { origin: ORIGIN });
    expect(inst.opened).toBe(open.mock.results[0].value);
    inst.finish("browser-token");
    expect(await result).toBe("browser-token");
  });

  test("leaves Electron's bridge alone", async () => {
    win.ryosDesktop = { platform: "darwin" };
    const real = fakeRealWindow();
    shellOpens(real);
    const inst = fakeMusicKit();
    const result = authorizeMusicKit(asInstance(inst), { origin: ORIGIN });
    expect(inst.opened as unknown).toBe(real);
    inst.finish("desktop-token");
    expect(await result).toBe("desktop-token");
  });
});

describe("authorizeMusicKit in the iOS shell", () => {
  test("a popup sheet that comes up is left to MusicKit", async () => {
    const shell = fakeShell();
    const real = fakeRealWindow();
    const open = shellOpens(real);
    const inst = fakeMusicKit();
    const result = authorizeMusicKit(asInstance(inst), {
      origin: ORIGIN,
      popupStatusTimeoutMs: 20,
    });
    expect(win.open).toBe(open as unknown as typeof window.open);

    // MusicKit talks to Apple's page through the handle as if it were the window.
    const handle = inst.opened!;
    expect(handle.window).toBe(handle);
    expect(handle.closed).toBe(false);
    handle.postMessage({ hi: 1 }, "https://authorize.music.apple.com");
    expect(real.postMessage).toHaveBeenCalledWith({ hi: 1 }, "https://authorize.music.apple.com");

    shell.emit({ status: "presented", url: AUTHORIZE_URL });
    await wait(40);
    inst.finish("popup-token");
    expect(await result).toBe("popup-token");
    expect(shell.openAuthSheet).not.toHaveBeenCalled();
    expect(real.close).not.toHaveBeenCalled();
    expect(shell.listeners.size).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  test("a null window.open goes straight to the auth sheet", async () => {
    const shell = fakeShell();
    shellOpens(null);
    const inst = fakeMusicKit();
    const token = await authorizeMusicKit(asInstance(inst), { origin: ORIGIN });

    expect(token).toBe("sheet-token");
    expect(inst.musicUserToken).toBe("sheet-token");
    expect(inst.isAuthorized).toBe(true);
    expect(inst.restrictedEnabled).toBe(false);
    expect(inst.storefrontId).toBe("jp");
    expect(inst.api.music).toHaveBeenCalledWith("/v1/me/storefront");
    expect(shell.openAuthSheet).toHaveBeenCalledTimes(1);
    expect(shell.openAuthSheet.mock.calls[0]).toEqual([
      {
        url: buildAuthSheetUrl(AUTHORIZE_URL, ORIGIN),
        callback: MUSICKIT_AUTH_CALLBACK,
        reason: "musickit popup window.open returned null",
      },
    ]);
    // MusicKit's own attempt was unwound rather than left hanging.
    expect(inst.settled).toBe(true);
    expect(shell.listeners.size).toBe(0);
    expect(String(warn.mock.calls[0])).toContain("using the system auth sheet");
  });

  test("a failed popup sheet is closed and replaced by the auth sheet", async () => {
    const shell = fakeShell();
    const real = fakeRealWindow();
    shellOpens(real);
    const inst = fakeMusicKit();
    const result = authorizeMusicKit(asInstance(inst), { origin: ORIGIN });
    const failure = "no view controller to present from (window=false)";
    shell.emit({ status: "failed", reason: failure, url: AUTHORIZE_URL });

    expect(await result).toBe("sheet-token");
    expect(real.close).toHaveBeenCalled();
    expect(shell.openAuthSheet.mock.calls[0][0]).toMatchObject({
      reason: `musickit popup failed (${failure})`,
    });
  });

  test("statuses for other popups are ignored", async () => {
    const shell = fakeShell();
    shellOpens(fakeRealWindow());
    const inst = fakeMusicKit();
    const result = authorizeMusicKit(asInstance(inst), {
      origin: ORIGIN,
      popupStatusTimeoutMs: 20,
    });
    shell.emit({ status: "presented", url: "https://example.com/other" });
    expect(await result).toBe("sheet-token");
    expect(shell.openAuthSheet.mock.calls[0][0]).toMatchObject({
      reason: "musickit popup no popup status from the shell in 20ms",
    });
  });

  test("no word from the shell falls back after the timeout", async () => {
    const shell = fakeShell();
    shellOpens(fakeRealWindow());
    const inst = fakeMusicKit();
    const started = Date.now();
    const token = await authorizeMusicKit(asInstance(inst), {
      origin: ORIGIN,
      popupStatusTimeoutMs: 20,
    });
    expect(token).toBe("sheet-token");
    expect(Date.now() - started).toBeGreaterThanOrEqual(15);
    expect(shell.openAuthSheet).toHaveBeenCalledTimes(1);
  });

  test("closing a popup sheet that was shown is a normal MusicKit rejection", async () => {
    const shell = fakeShell();
    shellOpens(fakeRealWindow());
    const inst = fakeMusicKit();
    const result = authorizeMusicKit(asInstance(inst), { origin: ORIGIN });
    shell.emit({ status: "presented", url: AUTHORIZE_URL });
    shell.emit({ status: "closed", reason: "swipe", url: AUTHORIZE_URL });
    await expect(result).rejects.toThrow("Unauthorized");
    expect(shell.openAuthSheet).not.toHaveBeenCalled();
  });

  test("cancelling the auth sheet rejects cleanly", async () => {
    const shell = fakeShell({
      sheet: async () => {
        throw new Error("cancelled");
      },
    });
    shellOpens(null);
    const inst = fakeMusicKit();
    await expect(authorizeMusicKit(asInstance(inst), { origin: ORIGIN })).rejects.toThrow(
      "Apple Music sign-in was cancelled"
    );
    expect(inst.musicUserToken).toBe("");
    expect(inst.settled).toBe(true);
    expect(shell.listeners.size).toBe(0);
  });

  test("an auth sheet error is reported with its message", async () => {
    fakeShell({
      sheet: async () => {
        throw new Error("the auth sheet could not start");
      },
    });
    shellOpens(null);
    await expect(
      authorizeMusicKit(asInstance(fakeMusicKit()), { origin: ORIGIN })
    ).rejects.toThrow("Apple Music sign-in failed: the auth sheet could not start");
  });

  test("a restricted account is flagged before the token is set", async () => {
    fakeShell({ sheet: async () => ({ url: tokenCallback("kid-token", "1") }) });
    shellOpens(null);
    const inst = fakeMusicKit();
    expect(await authorizeMusicKit(asInstance(inst), { origin: ORIGIN })).toBe("kid-token");
    expect(inst.restrictedEnabled).toBe(true);
  });

  test("a shell build without the fallback says to update instead of hanging", async () => {
    fakeShell({ fallback: false });
    shellOpens(null);
    const inst = fakeMusicKit();
    await expect(authorizeMusicKit(asInstance(inst), { origin: ORIGIN })).rejects.toThrow(
      /Update the app/
    );
    expect(inst.settled).toBe(true);
    expect(error).toHaveBeenCalled();
  });

  test("a shell build without the fallback still uses a popup that opened", async () => {
    fakeShell({ fallback: false });
    shellOpens(fakeRealWindow());
    const inst = fakeMusicKit();
    const result = authorizeMusicKit(asInstance(inst), { origin: ORIGIN });
    inst.finish("popup-token");
    expect(await result).toBe("popup-token");
  });

  test("an account that is already signed in opens nothing", async () => {
    const shell = fakeShell();
    const open = shellOpens(null);
    const inst = fakeMusicKit("existing-token");
    expect(await authorizeMusicKit(asInstance(inst), { origin: ORIGIN })).toBe("existing-token");
    expect(open).not.toHaveBeenCalled();
    expect(shell.openAuthSheet).not.toHaveBeenCalled();
    expect(win.open).toBe(open as unknown as typeof window.open);
  });
});

describe("the auth sheet hand-off", () => {
  test("the sheet starts on the bounce page, which Apple will return to", () => {
    const sheet = new URL(buildAuthSheetUrl(AUTHORIZE_URL, ORIGIN));
    expect(sheet.origin + sheet.pathname).toBe(`${ORIGIN}${MUSICKIT_AUTH_PAGE_PATH}`);
    const target = new URL(sheet.searchParams.get("to") ?? "");
    expect(target.origin + target.pathname).toBe("https://authorize.music.apple.com/woa");
    expect(target.searchParams.get("a")).toBe("abc");
    expect(target.searchParams.get("app")).toBe("music");
    expect(target.searchParams.get("referrer")).toBe(`${ORIGIN}${MUSICKIT_AUTH_PAGE_PATH}`);
  });

  test("Apple's callback is decoded, including a percent-encoded hash", () => {
    const callback = tokenCallback("t+/=", "1");
    expect(parseAuthSheetCallback(callback)).toEqual({ musicUserToken: "t+/=", restricted: true });
    const [base, hash] = callback.split("#");
    expect(parseAuthSheetCallback(`${base}#${encodeURIComponent(hash)}`).musicUserToken).toBe(
      "t+/="
    );
  });

  test("a callback without a token is an error", () => {
    for (const url of [
      MUSICKIT_AUTH_CALLBACK,
      `${MUSICKIT_AUTH_CALLBACK}#error`,
      `${MUSICKIT_AUTH_CALLBACK}#${btoa(JSON.stringify({ itre: "0" }))}`,
    ]) {
      expect(() => parseAuthSheetCallback(url)).toThrow(
        "Apple Music sign-in finished without a token"
      );
    }
  });

  function runAuthPage(url: string) {
    const script = /<script>([\s\S]*?)<\/script>/.exec(AUTH_PAGE)?.[1];
    if (!script) throw new Error("musickit-auth.html has no inline script");
    const parsed = new URL(url);
    const replace = mock((_to: string) => {});
    new Function("location", "URLSearchParams", script)(
      { hash: parsed.hash, search: parsed.search, replace },
      URLSearchParams
    );
    return replace.mock.calls.map(([to]) => to);
  }

  test("the bounce page forwards to Apple, then hands Apple's token to the app", () => {
    const sheetUrl = buildAuthSheetUrl(AUTHORIZE_URL, ORIGIN);
    const [toApple] = runAuthPage(sheetUrl);
    expect(toApple).toBe(new URL(sheetUrl).searchParams.get("to"));

    // Apple redirects to `referrer` with the token in the hash.
    const referrer = new URL(toApple).searchParams.get("referrer");
    const back = runAuthPage(`${referrer}#${tokenCallback("t").split("#")[1]}`);
    expect(back).toEqual([tokenCallback("t")]);
    expect(parseAuthSheetCallback(back[0]).musicUserToken).toBe("t");
  });

  test("the bounce page only forwards to Apple", () => {
    expect(
      runAuthPage(`${ORIGIN}${MUSICKIT_AUTH_PAGE_PATH}?to=${encodeURIComponent("https://evil.example/")}`)
    ).toEqual([`${MUSICKIT_AUTH_CALLBACK}#error`]);
    expect(runAuthPage(`${ORIGIN}${MUSICKIT_AUTH_PAGE_PATH}`)).toEqual([
      `${MUSICKIT_AUTH_CALLBACK}#error`,
    ]);
  });

  test("the bounce page sends Apple a referrer and uses the app's callback", () => {
    expect(AUTH_PAGE).toContain('<meta name="referrer" content="origin" />');
    expect(AUTH_PAGE).toContain(`var callback = "${MUSICKIT_AUTH_CALLBACK}";`);
  });
});
