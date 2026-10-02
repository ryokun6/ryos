import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  getDesktopCapabilities,
  hasDesktopWindowChrome,
  isDesktop,
  isIosShell,
  resolveDesktopCapabilities,
} from "../../../src/utils/platform";
import { getMenubarWindowChromeLayout } from "../../../src/components/layout/menu-bar/menubarWindowChrome";
import { getShortcutPlatform } from "../../../src/utils/shortcuts";
import { getSupportedDesktopDownloadTarget } from "../../../src/utils/desktopDownload";

const ELECTRON_MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ryOS/1.0.5 Chrome/140.0.0.0 Electron/42.5.2 Safari/537.36";
const IOS_WKWEBVIEW_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";

describe("resolveDesktopCapabilities", () => {
  test("no bridge means no shell features", () => {
    expect(resolveDesktopCapabilities(undefined, ELECTRON_MAC_UA)).toEqual({
      windowChrome: false,
      windowShortcuts: false,
      selfUpdate: false,
    });
  });

  test("explicit Electron capabilities are honored", () => {
    expect(
      resolveDesktopCapabilities(
        {
          capabilities: {
            windowChrome: true,
            windowShortcuts: true,
            selfUpdate: true,
          },
        },
        IOS_WKWEBVIEW_UA
      )
    ).toEqual({ windowChrome: true, windowShortcuts: true, selfUpdate: true });
  });

  test("omitted capability keys default to false", () => {
    expect(
      resolveDesktopCapabilities({ capabilities: {} }, ELECTRON_MAC_UA)
    ).toEqual({ windowChrome: false, windowShortcuts: false, selfUpdate: false });
  });

  test("legacy Electron bridges without capabilities keep desktop behavior", () => {
    expect(resolveDesktopCapabilities({}, ELECTRON_MAC_UA)).toEqual({
      windowChrome: true,
      windowShortcuts: true,
      selfUpdate: true,
    });
  });

  test("a non-Electron bridge without capabilities (iOS wrapper) gets none", () => {
    expect(resolveDesktopCapabilities({}, IOS_WKWEBVIEW_UA)).toEqual({
      windowChrome: false,
      windowShortcuts: false,
      selfUpdate: false,
    });
  });
});

describe("menubar window chrome layout", () => {
  const electronMac = {
    hasWindowChrome: true,
    isPhone: false,
    isWindowsPlatform: false,
    isMacTheme: true,
    isFullscreen: false,
  };

  test("Electron macOS keeps the drag spacer and traffic-light clearance", () => {
    expect(getMenubarWindowChromeLayout(electronMac)).toEqual({
      showWindowDragRegion: true,
      needsTrafficLightClearance: true,
    });
  });

  test("Electron fullscreen and Windows keep the drag spacer without clearance", () => {
    expect(
      getMenubarWindowChromeLayout({ ...electronMac, isFullscreen: true })
    ).toEqual({ showWindowDragRegion: true, needsTrafficLightClearance: false });
    expect(
      getMenubarWindowChromeLayout({ ...electronMac, isWindowsPlatform: true })
    ).toEqual({ showWindowDragRegion: true, needsTrafficLightClearance: false });
  });

  test("a phone-width touch viewport never gets the flex-1 drag spacer", () => {
    expect(
      getMenubarWindowChromeLayout({ ...electronMac, isPhone: true })
        .showWindowDragRegion
    ).toBe(false);
  });

  test("mobile wrapper (bridge without window chrome) gets neither", () => {
    for (const isPhone of [true, false]) {
      expect(
        getMenubarWindowChromeLayout({
          ...electronMac,
          hasWindowChrome: false,
          isPhone,
        })
      ).toEqual({ showWindowDragRegion: false, needsTrafficLightClearance: false });
    }
  });

  test("plain browsers at any width get neither", () => {
    expect(
      getMenubarWindowChromeLayout({
        ...electronMac,
        hasWindowChrome: false,
      })
    ).toEqual({ showWindowDragRegion: false, needsTrafficLightClearance: false });
  });
});

describe("runtime bridge consumers", () => {
  const g = globalThis as Record<string, unknown>;
  let hadWindow = false;
  let originalWindow: unknown;
  let originalBridge: unknown;
  let hadBridge = false;
  let originalNavigatorDescriptor: PropertyDescriptor | undefined;

  function setUserAgent(userAgent: string, platform: string, maxTouchPoints: number) {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      writable: true,
      value: { userAgent, platform, maxTouchPoints },
    });
  }

  function setBridge(bridge: unknown) {
    (g.window as Record<string, unknown>).ryosDesktop = bridge;
  }

  beforeEach(() => {
    hadWindow = "window" in g && g.window !== undefined;
    originalWindow = g.window;
    if (!hadWindow) {
      g.window = {};
    }
    const win = g.window as Record<string, unknown>;
    hadBridge = "ryosDesktop" in win;
    originalBridge = win.ryosDesktop;
    originalNavigatorDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "navigator"
    );
  });

  afterEach(() => {
    const win = g.window as Record<string, unknown>;
    if (hadBridge) {
      win.ryosDesktop = originalBridge;
    } else {
      delete win.ryosDesktop;
    }
    if (!hadWindow) {
      if (originalWindow === undefined) {
        delete g.window;
      } else {
        g.window = originalWindow;
      }
    }
    if (originalNavigatorDescriptor) {
      Object.defineProperty(globalThis, "navigator", originalNavigatorDescriptor);
    } else {
      delete g.navigator;
    }
  });

  test("iOS wrapper bridge is detected but exposes no desktop window features", () => {
    setUserAgent(IOS_WKWEBVIEW_UA, "iPhone", 5);
    setBridge({ platform: "ios" });

    expect(isDesktop()).toBe(true);
    expect(isIosShell()).toBe(true);
    expect(hasDesktopWindowChrome()).toBe(false);
    expect(getDesktopCapabilities().windowShortcuts).toBe(false);
    expect(getDesktopCapabilities().selfUpdate).toBe(false);
  });

  test("iOS wrapper uses navigator hints for shortcut labels, not the bridge platform", () => {
    setUserAgent(IOS_WKWEBVIEW_UA, "iPhone", 5);
    setBridge({ platform: "ios" });

    expect(getShortcutPlatform()).toBe("mac");
  });

  test("iOS wrapper is never offered a desktop download", () => {
    setUserAgent(IOS_WKWEBVIEW_UA, "iPhone", 5);
    setBridge({ platform: "darwin" });

    expect(isIosShell()).toBe(false);
    expect(getSupportedDesktopDownloadTarget()).toBeNull();
  });

  test("Electron on Windows still reports its own platform", () => {
    setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Electron/42.5.2 Safari/537.36",
      "Win32",
      0
    );
    setBridge({ platform: "win32" });

    expect(isIosShell()).toBe(false);
    expect(hasDesktopWindowChrome()).toBe(true);
    expect(getShortcutPlatform()).toBe("other");
    expect(getSupportedDesktopDownloadTarget()?.platform).toBe("windows");
  });
});
