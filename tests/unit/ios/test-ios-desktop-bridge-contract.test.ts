/**
 * iOS shell ↔ web client `window.ryosDesktop` contract.
 *
 * Runs the JavaScript the shell injects at document start
 * (`ios/ryOS/DesktopBridge.swift`) against the web client's own bridge
 * helpers, and checks the native side (`ShellWebView.swift`,
 * `MediaHapticsController.swift`, `RelayClient.swift`, `AppDelegate.swift`)
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
const { resolveDesktopCapabilities } = await import("../../../src/utils/platform");
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
  };
  posted: Posted[];
  /** Replies to every invoke so far the way `Coordinator.reply` does. */
  replyAll(value: (message: Posted) => unknown): void;
}

/** Run the injected script in an isolated fake page, as WKUserScript would. */
function loadShellPage(): ShellPage {
  const posted: Posted[] = [];
  const listeners: Record<string, Array<() => void>> = {};
  const fakeWindow: Record<string, unknown> = {
    webkit: {
      messageHandlers: {
        ryosBridge: { postMessage: (message: Posted) => posted.push(message) },
      },
    },
    addEventListener: (type: string, cb: () => void) => {
      (listeners[type] ??= []).push(cb);
    },
  };
  const fakeDocument = {
    readyState: "loading",
    hidden: false,
    addEventListener: (type: string, cb: () => void) => {
      (listeners[`document:${type}`] ??= []).push(cb);
    },
  };
  new Function("window", "document", INJECTED_JS)(fakeWindow, fakeDocument);
  const page = fakeWindow as ShellPage["window"];
  const replied = new Set<string>();
  return {
    window: page,
    posted,
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
    ]) {
      expect(typeof page.window.ryosDesktop[method]).toBe("function");
    }
    expect(typeof page.window.__ryosEmitOpenRoom).toBe("function");
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
    const primary = relaySwift.slice(
      relaySwift.indexOf("private func postPrimary"),
      relaySwift.indexOf("private func postFallback")
    );
    // Body keys the route reads — no credentials in the body.
    const bodyKeys = [...primary.matchAll(/^\s*"(\w+)": /gm)].map((match) => match[1]);
    expect(bodyKeys.sort()).toEqual(["appVersion", "deviceToken", "rooms"]);
    for (const key of bodyKeys) expect(route).toContain(`body?.${key}`);
    // apiHandler rejects a missing Origin; auth comes from the ryos_auth cookie.
    expect(primary).toContain('forHTTPHeaderField: "Origin"');
    expect(primary).toContain('forHTTPHeaderField: "Cookie"');
    expect(relaySwift).toContain('$0.name == "ryos_auth"');
    expect(relaySwift).toContain("private static let maxRooms = 200");
    expect(
      readFileSync(join(ROOT, "api/_utils/push-relay.ts"), "utf8")
    ).toContain("export const MAX_ROOMS_PER_DEVICE = 200;");
  });
});
