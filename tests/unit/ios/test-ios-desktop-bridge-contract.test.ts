/**
 * iOS shell ↔ web client `window.ryosDesktop` contract.
 *
 * Runs the JavaScript the shell injects at document start
 * (`ios/ryOS/DesktopBridge.swift`) against the web client's own bridge
 * helpers, and checks the native side (`ShellWebView.swift`,
 * `MediaHapticsController.swift`, `RelayClient.swift`, `AppDelegate.swift`,
 * `BatteryBridgeController.swift`)
 * handles every message the injected script posts. Swift can't build on
 * Linux CI, so the native half is checked at the source level.
 */
import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
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

const { playHaptic, resetNativeHapticRateLimitForTests } = await import(
  "../../../src/utils/nativeShellBridge"
);
const { resolveDesktopCapabilities, SIDE_STATUS_BAR_EXTENT_EVENT } = await import(
  "../../../src/utils/platform"
);
const { getDesktopChatNotificationRendererMode, shouldSendDesktopChatNotificationState } =
  await import("../../../src/utils/desktopChatNotificationPolicy");
const { getNativeToastNotification, showNativeToastNotification } = await import(
  "../../../src/utils/nativeToastNotifications"
);

const IOS = join(import.meta.dir, "../../../ios/ryOS");
const ROOT = join(import.meta.dir, "../../..");
const readIos = (file: string) => readFileSync(join(IOS, file), "utf8");

const desktopBridgeSwift = readIos("DesktopBridge.swift");
const shellWebViewSwift = readIos("ShellWebView.swift");
const mediaSwift = readIos("MediaHapticsController.swift");
const relaySwift = readIos("RelayClient.swift");
const appDelegateSwift = readIos("AppDelegate.swift");
const batterySwift = readIos("BatteryBridgeController.swift");

function extractInjectedJavaScript(source: string): string {
  const match = /static let injectedJavaScript = """\n([\s\S]*?)\n\s*"""/.exec(source);
  if (!match) throw new Error("injectedJavaScript literal not found");
  // A plain literal (no escapes / interpolation) is identical in Swift and JS.
  expect(match[1]).not.toContain("\\");
  return match[1];
}
const INJECTED_JS = extractInjectedJavaScript(desktopBridgeSwift);

/** Native `handleInvoke` cases and the bridge message kinds it switches on. */
function swiftSwitchCases(source: string, functionName: string): Set<string> {
  const start = source.indexOf(`func ${functionName}(`);
  if (start === -1) throw new Error(`${functionName} not found`);
  const body = source.slice(start, source.indexOf("\n    }\n", start));
  const names = new Set<string>();
  for (const line of body.matchAll(/^\s*case ((?:"[^"]+",?\s*)+):/gm)) {
    for (const name of line[1].matchAll(/"([^"]+)"/g)) names.add(name[1]);
  }
  return names;
}
const NATIVE_INVOKES = swiftSwitchCases(shellWebViewSwift, "handleInvoke");
const NATIVE_MESSAGE_KINDS = swiftSwitchCases(shellWebViewSwift, "userContentController");

type Posted = { kind: string; id?: string; name?: string; args?: Record<string, unknown> };

interface ShellPage {
  window: Record<string, unknown> & {
    ryosDesktop: Record<string, (...args: unknown[]) => unknown> & {
      platform: string;
      capabilities?: unknown;
    };
    __ryosReply: (payload: unknown) => void;
    __ryosEmitOpenRoom: (roomId: string | null) => void;
    __ryosEmitAuthPopupStatus: (status: unknown) => void;
    __ryosSetSideStatusBarExtent: (extent: unknown, hasCamera?: unknown) => void;
    __ryosSetBattery: (level: unknown, charging?: unknown, lowPowerMode?: unknown) => void;
    navigator: Record<string, unknown>;
  };
  posted: Posted[];
  /** Every event the script dispatched on window, in order. */
  dispatched: Array<{ type: string; detail: unknown }>;
  /** Delay of every timer the script set, in order. */
  timers: number[];
  /** Replies to every invoke so far the way `Coordinator.reply` does. */
  replyAll(value: (message: Posted) => unknown): void;
}

interface ShellPageOptions {
  /** `window.__ryosInitialBattery`, as the shell's document-start prelude sets it. */
  initialBattery?: Record<string, unknown>;
  /** The page's navigator; by default a fresh one without getBattery (WKWebView). */
  navigator?: Record<string, unknown>;
  /** The page's EventTarget constructor; pass `undefined` for a page without one. */
  EventTarget?: unknown;
}

/** Run the injected script in an isolated fake page, as WKUserScript would. */
function loadShellPage(options: ShellPageOptions = {}): ShellPage {
  const posted: Posted[] = [];
  const dispatched: ShellPage["dispatched"] = [];
  const listeners: Record<string, Array<() => void>> = {};
  const fakeWindow: Record<string, unknown> = {
    navigator: options.navigator ?? {},
    __ryosInitialBattery: options.initialBattery,
    webkit: {
      messageHandlers: {
        ryosBridge: { postMessage: (message: Posted) => posted.push(message) },
      },
    },
    addEventListener: (type: string, cb: () => void) => {
      (listeners[type] ??= []).push(cb);
    },
    dispatchEvent: (event: Event) => {
      dispatched.push({ type: event.type, detail: (event as CustomEvent).detail });
      return true;
    },
  };
  const fakeDocument = {
    readyState: "loading",
    hidden: false,
    addEventListener: (type: string, cb: () => void) => {
      (listeners[`document:${type}`] ??= []).push(cb);
    },
  };
  const timers: number[] = [];
  const recordingSetTimeout = (cb: () => void, ms: number) => {
    timers.push(ms);
    return setTimeout(cb, ms);
  };
  new Function("window", "document", "setTimeout", "EventTarget", INJECTED_JS)(
    fakeWindow,
    fakeDocument,
    recordingSetTimeout,
    "EventTarget" in options ? options.EventTarget : EventTarget
  );
  const page = fakeWindow as ShellPage["window"];
  const replied = new Set<string>();
  return {
    window: page,
    posted,
    dispatched,
    timers,
    replyAll(value) {
      for (const message of posted) {
        if (message.kind !== "invoke" || !message.id || replied.has(message.id)) continue;
        replied.add(message.id);
        page.__ryosReply({ id: message.id, ok: true, value: value(message) });
      }
    },
  };
}

function invokes(page: ShellPage) {
  return page.posted
    .filter((message) => message.kind === "invoke")
    .map((message) => [message.name, message.args ?? null]);
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

let page: ShellPage;
const appWindow = window as unknown as Record<string, unknown>;

beforeEach(() => {
  page = loadShellPage();
  appWindow.ryosDesktop = page.window.ryosDesktop;
  resetNativeHapticRateLimitForTests();
});

afterEach(() => {
  delete appWindow.ryosDesktop;
});

afterAll(() => {
  if (registeredDomHere && GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
});

describe("injected bridge surface", () => {
  test("declares the iOS platform and no desktop-window capabilities", () => {
    expect(page.window.ryosDesktop.platform).toBe("ios");
    expect(resolveDesktopCapabilities(page.window.ryosDesktop as never, "iPhone")).toEqual({
      windowChrome: false,
      windowShortcuts: false,
      selfUpdate: false,
    });
  });

  test("every method the web client relies on is present", () => {
    for (const method of [
      "canShowNotifications",
      "shouldShowNativeNotification",
      "showNotification",
      "configureChatNotifications",
      "updateChatNotificationState",
      "stopChatNotifications",
      "onChatNotificationEvent",
      "onChatNotificationStatus",
      "onOpenChatRoomFromNotification",
      "playHaptic",
      "getVersion",
      "isFullscreen",
      "onFullscreenChange",
      "toggleMaximize",
      "openFile",
      "saveFile",
      "checkForUpdates",
      "quitAndInstall",
      "onUpdateStatus",
      "openAuthSheet",
      "onAuthPopupStatus",
      "getBattery",
      "onBatteryChange",
    ]) {
      expect(typeof page.window.ryosDesktop[method]).toBe("function");
    }
    expect(typeof page.window.__ryosEmitOpenRoom).toBe("function");
    expect(typeof page.window.__ryosEmitAuthPopupStatus).toBe("function");
  });

  test("native handles every invoke and message kind the script posts", () => {
    const api = page.window.ryosDesktop;
    for (const [name, fn] of Object.entries(api)) {
      if (typeof fn !== "function" || name.startsWith("on")) continue;
      void (fn as (...args: unknown[]) => Promise<unknown>)({}, {}).catch(() => {});
    }
    const posted = new Set(invokes(page).map(([name]) => name as string));
    expect(posted.size).toBeGreaterThan(10);
    for (const name of posted) expect(NATIVE_INVOKES).toContain(name);

    const kinds = INJECTED_JS.matchAll(/post\(\{ kind: '([^']+)'/g);
    for (const [, kind] of kinds) expect(NATIVE_MESSAGE_KINDS).toContain(kind);
  });

  test("__ryosReply resolves and rejects pending invokes", async () => {
    const version = page.window.ryosDesktop.getVersion() as Promise<string>;
    const fullscreen = page.window.ryosDesktop.isFullscreen() as Promise<boolean>;
    const [versionCall, fullscreenCall] = page.posted;
    page.window.__ryosReply({ id: versionCall.id, ok: true, value: "1.2" });
    page.window.__ryosReply({ id: fullscreenCall.id, ok: false, value: "nope" });
    expect(await version).toBe("1.2");
    await expect(fullscreen).rejects.toThrow("nope");
  });
});

describe("haptics", () => {
  test("the web helper posts the argument key the native handler reads", () => {
    expect(playHaptic("soft", 1_000)).toBe(true);
    expect(invokes(page)).toEqual([["playHaptic", { pattern: "soft" }]]);
    expect(shellWebViewSwift).toContain('["pattern"]');
    expect(mediaSwift).toContain("func playHaptic(");
  });
});

describe("notifications", () => {
  test("configure keeps state updates flowing without taking over notifications", async () => {
    const config = { appPublicOrigin: "https://os.ryo.lu" };
    const state = { username: "a", isAuthenticated: true, rooms: [] };
    const result = page.window.ryosDesktop.configureChatNotifications(config, state);
    page.window.ryosDesktop.updateChatNotificationState(state);
    expect(invokes(page)).toEqual([
      ["configureChatNotifications", { config, state }],
      ["updateChatNotificationState", { state }],
    ]);
    expect(shellWebViewSwift).toContain('["state"]');

    // What ShellWebView replies to configure.
    const reply = /case "configureChatNotifications":[\s\S]*?reply\(id, (\[[^\]]+\])\)/.exec(
      shellWebViewSwift
    );
    expect(reply?.[1]).toBe('["managed": true, "ready": false]');
    const native = { managed: true, ready: false };
    page.replyAll(() => native);
    expect(await result).toEqual(native);
    expect(getDesktopChatNotificationRendererMode(native)).toBe("renderer");
    expect(shouldSendDesktopChatNotificationState(native)).toBe(true);
  });

  test("showNotification carries the chat room through to the shell", async () => {
    const payload = getNativeToastNotification("basic", "@ryo", {
      description: "hello",
      chatRoomId: "room-1",
    });
    const shown = showNativeToastNotification("basic", "@ryo", {
      description: "hello",
      chatRoomId: "room-1",
    });
    await tick();
    page.replyAll(() => true); // shouldShowNativeNotification
    await tick();
    expect(invokes(page).at(-1)).toEqual(["showNotification", { options: payload }]);
    page.replyAll(() => ({ shown: true }));
    expect(await shown).toBe(true);

    expect(shellWebViewSwift).toContain('options["chatRoomId"]');
    expect(shellWebViewSwift).toContain('reply(id, ["shown": true])');
  });

  test("a notification-tap room is held until the web client subscribes", async () => {
    page.window.__ryosEmitOpenRoom("cold-room");
    const opened: Array<string | null> = [];
    const unsubscribe = page.window.ryosDesktop.onOpenChatRoomFromNotification(
      (roomId: unknown) => opened.push(roomId as string)
    ) as () => void;
    await tick();
    expect(opened).toEqual(["cold-room"]);

    page.window.__ryosEmitOpenRoom("warm-room");
    expect(opened).toEqual(["cold-room", "warm-room"]);

    unsubscribe();
    const late: unknown[] = [];
    page.window.ryosDesktop.onOpenChatRoomFromNotification((roomId: unknown) =>
      late.push(roomId)
    );
    await tick();
    expect(late).toEqual([]);
  });

  test("the shell waits for boot before delivering a tapped room", () => {
    expect(shellWebViewSwift).toMatch(
      /case "boot-finished":[\s\S]*?ShellRouter\.shared\.markPageReady\(\)/
    );
    expect(relaySwift).toMatch(/func firePendingRoom\(\) \{[^}]*?guard pageReady/);
    expect(appDelegateSwift).toContain('userInfo["chatRoomId"]');
    // The relay push payload uses the same key.
    expect(readFileSync(join(ROOT, "api/_utils/push-relay.ts"), "utf8")).toMatch(
      /chatRoomId: roomId,/
    );
  });

  test("device registration matches POST /api/push/register", () => {
    const route = readFileSync(join(ROOT, "api/push/register.ts"), "utf8");
    expect(route).toContain('auth: "required"');
    expect(relaySwift).toContain('appending(path: "api/push/register")');
    const primary = swiftFunctionBody(relaySwift, "private func postPrimary");
    // Body keys the route reads — no credentials in the body.
    const bodyKeys = [...primary.matchAll(/^\s*"(\w+)": /gm)].map((match) => match[1]);
    expect(bodyKeys.sort()).toEqual(["appVersion", "deviceToken", "rooms"]);
    for (const key of bodyKeys) expect(route).toContain(`body?.${key}`);
    // apiHandler rejects a missing Origin; auth comes from the ryos_auth cookie.
    expect(primary).toContain('forHTTPHeaderField: "Origin"');
    expect(primary).toContain('forHTTPHeaderField: "Cookie"');
    expect(relaySwift).toContain('$0.name == "ryos_auth"');
    expect(relaySwift).toContain("private static let maxRooms = 200");
    // The session cookie only ever goes to the app origin.
    expect(relaySwift).not.toMatch(/https?:\/\/(?!os\.ryo\.lu)[a-z0-9.-]+\//i);
    expect(relaySwift).not.toContain("X-Ryos-Auth");
    expect(relaySwift).not.toContain("authCookie");
  });

  test("the native bridge only accepts the shell's own top-level page", () => {
    const handler = swiftFunctionBody(
      shellWebViewSwift,
      "func userContentController("
    );
    expect(handler).toContain("message.frameInfo.isMainFrame");
    expect(handler).toContain("Self.isShellOrigin(message.frameInfo.securityOrigin)");
    const guardIndex = handler.indexOf("message.frameInfo.isMainFrame");
    expect(guardIndex).toBeLessThan(handler.indexOf("switch kind"));
    const originCheck = swiftFunctionBody(shellWebViewSwift, "static func isShellOrigin(");
    expect(originCheck).toContain("ShellViewModel.origin");
    expect(originCheck).toContain("origin.protocol == expected.scheme");
    expect(
      readFileSync(join(ROOT, "api/_utils/push-relay.ts"), "utf8")
    ).toContain("export const MAX_ROOMS_PER_DEVICE = 200;");
  });
});

/** A method's body, up to its closing brace at class-member indentation. */
function swiftFunctionBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  if (start === -1) throw new Error(`${signature} not found`);
  return source.slice(start, source.indexOf("\n    }\n", start));
}

describe("auth popups and the auth sheet", () => {
  test("openAuthSheet forwards its options and outlives the default bridge timeout", async () => {
    const options = {
      url: "https://os.ryo.lu/musickit-auth.html",
      callback: "ryos-auth://musickit",
      reason: "musickit popup failed",
    };
    const result = page.window.ryosDesktop.openAuthSheet(options) as Promise<unknown>;
    expect(invokes(page)).toEqual([["openAuthSheet", options]]);
    expect(page.timers.at(-1)).toBe(600_000);
    page.replyAll(() => ({ url: "ryos-auth://musickit#abc" }));
    expect(await result).toEqual({ url: "ryos-auth://musickit#abc" });

    void page.window.ryosDesktop.getVersion();
    expect(page.timers.at(-1)).toBe(15_000);

    for (const key of ["url", "callback", "reason"]) {
      expect(shellWebViewSwift).toContain(`args?["${key}"]`);
    }
    expect(shellWebViewSwift).toContain('reply(id, ["url": callbackURL.absoluteString])');
    expect(shellWebViewSwift).toContain('cancelled ? "cancelled"');
  });

  test("popup statuses reach subscribers until they unsubscribe", () => {
    const seen: unknown[] = [];
    const unsubscribe = page.window.ryosDesktop.onAuthPopupStatus((status: unknown) =>
      seen.push(status)
    ) as () => void;
    const presented = { status: "presented", url: "https://authorize.music.apple.com/woa" };
    page.window.__ryosEmitAuthPopupStatus(presented);
    expect(seen).toEqual([presented]);
    unsubscribe();
    page.window.__ryosEmitAuthPopupStatus({ status: "closed", url: presented.url });
    expect(seen).toEqual([presented]);
    expect(shellWebViewSwift).toContain(
      "window.__ryosEmitAuthPopupStatus && window.__ryosEmitAuthPopupStatus("
    );
  });

  test("the shell emits exactly the statuses the web types declare", () => {
    const emitted = new Set(
      [...shellWebViewSwift.matchAll(/(?:emitAuthPopupStatus|finish)\("(\w+)"/g)].map(
        (match) => match[1]
      )
    );
    expect([...emitted].sort()).toEqual(["closed", "failed", "presented", "refused"]);
    const types = readFileSync(join(ROOT, "src/types/ryos-desktop.d.ts"), "utf8");
    const union = /status: ((?:"\w+"(?: \| )?)+);/.exec(types)?.[1] ?? "";
    expect([...union.matchAll(/"(\w+)"/g)].map((match) => match[1]).sort()).toEqual(
      [...emitted].sort()
    );
  });

  test("window.open is allowed and handled on every webview", () => {
    const makeUIView = swiftFunctionBody(shellWebViewSwift, "func makeUIViewController(");
    const flag = makeUIView.indexOf(
      "config.preferences.javaScriptCanOpenWindowsAutomatically = true"
    );
    expect(flag).toBeGreaterThan(-1);
    expect(flag).toBeLessThan(makeUIView.indexOf("WKWebView(frame: .zero, configuration: config)"));
    expect(makeUIView).toContain("webView.uiDelegate = context.coordinator");
    expect(shellWebViewSwift).toContain("popup.uiDelegate = coordinator");

    const coordinator = shellWebViewSwift.slice(
      shellWebViewSwift.indexOf("final class Coordinator"),
      shellWebViewSwift.indexOf("enum AuthPopupPresenter")
    );
    expect(coordinator).toContain("createWebViewWith configuration: WKWebViewConfiguration");
    expect(coordinator).toContain("func webViewDidClose(_ webView: WKWebView)");
    // Embedded frames still need a tap; the shell's page doesn't.
    expect(coordinator).toContain(
      "!fromMainFrame && navigationAction.navigationType != .linkActivated"
    );
  });

  test("every popup and auth sheet decision is logged under [auth]", () => {
    expect(shellWebViewSwift).toContain('NSLog("ryOS: [auth] %@", message)');
    const logCalls = shellWebViewSwift.replace(/authLog\(\s+"/g, 'authLog("');
    for (const line of [
      "popup requested",
      "popup refused",
      "window.close() from a page without a popup sheet",
      "popup presenting from",
      "popup present refused",
      "popup presented",
      "popup failed",
      "popup closed",
      "auth sheet refused",
      "auth sheet starting",
      "auth sheet failed to start",
      "auth sheet ended",
      "auth sheet completed",
      "auth sheet has no window",
    ]) {
      expect(logCalls).toContain(`authLog("${line}`);
    }
    expect(shellWebViewSwift).not.toContain('pushLog("Auth popup opened');
  });

  test("no popup or auth sheet failure returns without a log line", () => {
    for (const signature of [
      "createWebViewWith configuration",
      "func webViewDidClose(",
      "private static func present(",
      "func runAuthSheet(",
      "private func finishAuthSheet(",
    ]) {
      const lines = swiftFunctionBody(shellWebViewSwift, signature).split("\n");
      lines.forEach((line, index) => {
        if (!/return nil\b|return false\b|reject\(id|^\s*return\s*$/.test(line)) return;
        const before = lines.slice(Math.max(0, index - 3), index).join("\n");
        expect({ signature, line, logged: /authLog\(|\.fail\(/.test(before) }).toEqual({
          signature,
          line,
          logged: true,
        });
      });
    }
  });
});

describe("save sheet", () => {
  test("saveFile posts the bytes as base64 and outlives the default bridge timeout", async () => {
    const bytes = Uint8Array.from({ length: 70_000 }, (_, i) => i % 251);
    const filters = [{ name: "TXT", extensions: ["txt"] }];
    const result = page.window.ryosDesktop.saveFile({
      title: "Export",
      defaultPath: "notes.txt",
      filters,
      data: bytes.buffer,
    }) as Promise<unknown>;
    const [[name, args]] = invokes(page);
    expect(name).toBe("saveFile");
    const { options, data } = args as { options: unknown; data: string };
    expect(options).toEqual({ title: "Export", defaultPath: "notes.txt", filters });
    expect(new Uint8Array(Buffer.from(data, "base64"))).toEqual(bytes);
    expect(page.timers.at(-1)).toBe(600_000);
    page.replyAll(() => ({ canceled: false, filePath: "notes.txt" }));
    expect(await result).toEqual({ canceled: false, filePath: "notes.txt" });
  });

  test("a typed-array view sends only its own bytes; no data sends none", () => {
    const backing = new Uint8Array([1, 2, 3, 4, 5]);
    void page.window.ryosDesktop.saveFile({ defaultPath: "a.bin", data: backing.subarray(1, 4) });
    void page.window.ryosDesktop.saveFile({ defaultPath: "b.bin" });
    const [first, second] = invokes(page).map(([, args]) => (args as { data: string }).data);
    expect([...Buffer.from(first, "base64")]).toEqual([2, 3, 4]);
    expect(second).toBe("");
  });

  test("the shell runs the save sheet itself; openFile still falls back to the file input", () => {
    const handler = swiftFunctionBody(shellWebViewSwift, "private func handleInvoke(");
    expect(handler).toMatch(/case "openFile":\s*reply\(id, \["canceled": true\]\)/);
    expect(handler).toMatch(/case "saveFile":\s*runSaveSheet\(id: id, args:/);
    const sheet = swiftFunctionBody(shellWebViewSwift, "private func runSaveSheet(");
    expect(sheet).toContain('args?["data"]');
    expect(sheet).toContain('options?["defaultPath"]');
    expect(sheet).toContain("Data(base64Encoded:");
    expect(sheet).toContain('reply(id, ["canceled": false, "filePath": savedName])');
    expect(shellWebViewSwift).toContain(
      "UIDocumentPickerViewController(forExporting: files, asCopy: true)"
    );
  });

  test("download links and attachments are routed to the save sheet", () => {
    const coordinator = shellWebViewSwift.slice(
      shellWebViewSwift.indexOf("final class Coordinator"),
      shellWebViewSwift.indexOf("enum AuthPopupPresenter")
    );
    expect(coordinator).toContain("WKDownloadDelegate");
    expect(coordinator).toContain("navigationAction.shouldPerformDownload ? .download : .allow");
    expect(coordinator).toContain("!navigationResponse.canShowMIMEType || attachment ? .download");
    expect(coordinator.match(/didBecome download: WKDownload\) \{\s*download\.delegate = self/g))
      .toHaveLength(2);
    expect(coordinator).toContain("decideDestinationUsing response: URLResponse");
    expect(coordinator).toContain("func downloadDidFinish(_ download: WKDownload)");
  });
});

describe("side status-bar extent", () => {
  test("starts at 0 without a camera until the shell reports a side bar", () => {
    expect(page.window.ryosDesktop.sideStatusBarExtent as unknown).toBe(0);
    expect(page.window.ryosDesktop.sideStatusBarHasCamera as unknown).toBe(false);
    expect(page.dispatched).toEqual([]);
  });

  test("each fold change updates both fields and fires one event the web listens for", () => {
    const set = page.window.__ryosSetSideStatusBarExtent;
    set(150, true);
    set(150, true);
    set(88, false);
    set(88, false);
    set(150, true);
    expect(page.window.ryosDesktop.sideStatusBarExtent as unknown).toBe(150);
    expect(page.window.ryosDesktop.sideStatusBarHasCamera as unknown).toBe(true);
    expect(page.dispatched).toEqual([
      { type: SIDE_STATUS_BAR_EXTENT_EVENT, detail: { extent: 150, hasCamera: true } },
      { type: SIDE_STATUS_BAR_EXTENT_EVENT, detail: { extent: 88, hasCamera: false } },
      { type: SIDE_STATUS_BAR_EXTENT_EVENT, detail: { extent: 150, hasCamera: true } },
    ]);
  });

  test("the shell pushes the value on change and again once the page has booted", () => {
    expect(shellWebViewSwift).toContain(
      "window.__ryosSetSideStatusBarExtent && window.__ryosSetSideStatusBarExtent("
    );
    const bootCase = shellWebViewSwift.slice(
      shellWebViewSwift.indexOf('case "boot-finished":'),
      shellWebViewSwift.indexOf('case "app-active":')
    );
    expect(bootCase).toContain("pushSideStatusBarExtent()");
  });
});

type BatteryManagerLike = EventTarget & {
  level: number;
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
  onlevelchange: ((event: Event) => void) | null;
  onchargingchange: ((event: Event) => void) | null;
};

const navigatorBattery = (shell: ShellPage) =>
  (shell.window.navigator.getBattery as () => Promise<BatteryManagerLike>)();

const batteryStatus = (level: number, charging: boolean, lowPowerMode: boolean) => ({
  level,
  charging,
  lowPowerMode,
});

describe("device battery", () => {
  test("an unknown or missing battery reads as full and charging", async () => {
    expect(await page.window.ryosDesktop.getBattery()).toEqual(batteryStatus(1, true, false));
    const manager = await navigatorBattery(page);
    expect(manager).toBe(await navigatorBattery(page));
    expect(manager instanceof EventTarget).toBe(true);
    expect([manager.level, manager.charging]).toEqual([1, true]);
    expect([manager.chargingTime, manager.dischargingTime]).toEqual([0, Infinity]);
  });

  test("both APIs start from the document-start seed", async () => {
    const shell = loadShellPage({
      initialBattery: { level: 0.42, charging: false, lowPowerMode: true },
    });
    expect(await shell.window.ryosDesktop.getBattery()).toEqual(batteryStatus(0.42, false, true));
    const manager = await navigatorBattery(shell);
    expect([manager.level, manager.charging]).toEqual([0.42, false]);
    expect([manager.chargingTime, manager.dischargingTime]).toEqual([Infinity, Infinity]);
    expect(shell.dispatched).toEqual([]);
  });

  test("__ryosSetBattery updates both APIs and fires each change once", async () => {
    const shell = loadShellPage({
      initialBattery: { level: 1, charging: true, lowPowerMode: false },
    });
    const manager = await navigatorBattery(shell);
    const events: string[] = [];
    for (const type of [
      "levelchange",
      "chargingchange",
      "chargingtimechange",
      "dischargingtimechange",
    ]) {
      manager.addEventListener(type, () => events.push(type));
    }
    manager.onlevelchange = (event) => events.push(`on${event.type}`);
    manager.onchargingchange = (event) => events.push(`on${event.type}`);
    const seen: unknown[] = [];
    const unsubscribe = shell.window.ryosDesktop.onBatteryChange((status: unknown) =>
      seen.push(status)
    ) as () => void;

    const set = shell.window.__ryosSetBattery;
    set(0.5, false, false);
    set(0.5, false, false);
    expect(events).toEqual([
      "levelchange",
      "onlevelchange",
      "chargingchange",
      "onchargingchange",
      "chargingtimechange",
    ]);
    expect([manager.level, manager.charging, manager.chargingTime]).toEqual([0.5, false, Infinity]);
    expect(await shell.window.ryosDesktop.getBattery()).toEqual(batteryStatus(0.5, false, false));

    // Low Power Mode alone has no Battery Status API event.
    set(0.5, false, true);
    expect(events.length).toBe(5);
    expect(seen).toEqual([batteryStatus(0.5, false, false), batteryStatus(0.5, false, true)]);
    expect(shell.dispatched).toEqual(seen.map((detail) => ({ type: "ryos-battery", detail })));

    unsubscribe();
    set(0.51, false, true);
    expect(seen.length).toBe(2);
    expect(events.slice(5)).toEqual(["levelchange", "onlevelchange"]);
  });

  test("out-of-range and missing values fall back to the no-battery reading", async () => {
    const shell = loadShellPage({ initialBattery: { level: 0.3, charging: false } });
    shell.window.__ryosSetBattery(7, false, false);
    expect(await shell.window.ryosDesktop.getBattery()).toEqual(batteryStatus(1, false, false));
    shell.window.__ryosSetBattery("not a number");
    expect(await shell.window.ryosDesktop.getBattery()).toEqual(batteryStatus(1, true, false));
  });

  test("a page that already has navigator.getBattery keeps its own", async () => {
    const getBattery = () => Promise.resolve("native");
    const nav: Record<string, unknown> = { getBattery };
    const shell = loadShellPage({ navigator: nav });
    expect(nav.getBattery).toBe(getBattery);
    shell.window.__ryosSetBattery(0.3, false, false);
    expect(await shell.window.ryosDesktop.getBattery()).toEqual(batteryStatus(0.3, false, false));
  });

  test("without EventTarget the polyfill still delivers listeners and handlers", async () => {
    const shell = loadShellPage({ EventTarget: undefined });
    const manager = await navigatorBattery(shell);
    expect(manager instanceof EventTarget).toBe(false);
    const seen: string[] = [];
    const listener = (event: Event) => seen.push(event.type);
    manager.addEventListener("levelchange", listener);
    manager.addEventListener("levelchange", listener);
    manager.onchargingchange = (event) => seen.push(`on${event.type}`);
    shell.window.__ryosSetBattery(0.2, false, false);
    expect(seen).toEqual(["levelchange", "onchargingchange"]);
    manager.removeEventListener("levelchange", listener);
    shell.window.__ryosSetBattery(0.1, false, false);
    expect(seen).toEqual(["levelchange", "onchargingchange"]);
  });

  test("the shell seeds the battery at document start and pushes every change", () => {
    expect(batterySwift).toContain("UIDevice.current.isBatteryMonitoringEnabled = true");
    for (const name of [
      "UIDevice.batteryLevelDidChangeNotification",
      "UIDevice.batteryStateDidChangeNotification",
      "Notification.Name.NSProcessInfoPowerStateDidChange",
      "UIApplication.didBecomeActiveNotification",
    ]) {
      expect(batterySwift).toContain(name);
    }
    expect(batterySwift).toContain('"window.__ryosInitialBattery="');
    expect(batterySwift).toContain("window.__ryosSetBattery && window.__ryosSetBattery(");
    expect(shellWebViewSwift).toContain("BatteryBridgeController.shared.attach(webView)");
    expect(swiftFunctionBody(shellWebViewSwift, "private func installPreludeAndLoad(")).toContain(
      "BatteryBridgeController.shared.preludeScript"
    );
    const bootCase = shellWebViewSwift.slice(
      shellWebViewSwift.indexOf('case "boot-finished":'),
      shellWebViewSwift.indexOf('case "app-active":')
    );
    expect(bootCase).toContain("BatteryBridgeController.shared.push()");
  });
});
