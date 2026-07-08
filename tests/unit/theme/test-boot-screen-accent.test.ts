import {
  afterAll,
  beforeAll,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { getAccentCssVars } from "../../../src/themes/accents";
import { darkAquaThemeCss } from "../../helpers/theme-css-fixtures";
import type { OsThemeId } from "../../../src/themes/types";
import { ensureTestLocalStorage } from "../../setup";

// Snapshot the real exports BEFORE mock.module runs: bun mutates the live
// module namespace in place, so restoring from the namespace object itself
// would re-install the mocks for every later test file in this process.
const actualSound = { ...(await import("../../../src/hooks/useSound")) };
const actualReactI18next = { ...(await import("react-i18next")) };
const actualRadixLayoutEffect = {
  ...(await import("@radix-ui/react-use-layout-effect")),
};

beforeAll(() => {
  if (typeof document === "undefined") {
    GlobalRegistrator.register();
  }
});

afterAll(async () => {
  await flushReact();
  if (GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
  ensureTestLocalStorage();
  mock.module("@/hooks/useSound", () => actualSound);
  mock.module("react-i18next", () => actualReactI18next);
  mock.module("@radix-ui/react-use-layout-effect", () => actualRadixLayoutEffect);
});

mock.module("@/hooks/useSound", () => ({
  ...actualSound,
  Sounds: {
    BOOT: "/sounds/boot.mp3",
    WINDOW_CLOSE: "/sounds/window-close.mp3",
    WINDOW_OPEN: "/sounds/window-open.mp3",
  },
  useSound: () => ({ play: () => {} }),
}));

mock.module("react-i18next", () => ({
  ...actualReactI18next,
  useTranslation: () => ({
    t: (key: string) =>
      key === "common.system.systemRestoring" ? "System Restoring..." : key,
  }),
}));

// When this suite runs alone, Radix loads before the DOM registers, so its
// layout-effect shim (`globalThis.document ? useLayoutEffect : noop`) is a
// no-op. When another suite has already registered a DOM, the real layout
// effects run and Radix's dialog ref/presence wiring loops forever under
// happy-dom ("Maximum update depth exceeded"). Pin the shim to the no-op so
// the suite behaves the same regardless of which files ran before it.
mock.module("@radix-ui/react-use-layout-effect", () => ({
  useLayoutEffect: () => {},
}));

const { BootScreen } = await import("../../../src/components/dialogs/BootScreen");
const { useThemeStore } = await import("../../../src/stores/useThemeStore");

const bootScreenSource = readFileSync(
  join(import.meta.dir, "../../../src/components/dialogs/BootScreen.tsx"),
  "utf8"
);

async function flushReact(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function renderBootScreen(theme: OsThemeId): Promise<string[]> {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  const originalError = console.error;
  let root: Root | null = null;
  const host = document.createElement("div");
  document.body.appendChild(host);
  useThemeStore.setState({ current: theme });

  console.warn = (...args: unknown[]) => {
    warnings.push(args.join(" "));
  };
  console.error = (...args: unknown[]) => {
    warnings.push(args.join(" "));
  };

  try {
    root = createRoot(host);
    root.render(
      React.createElement(BootScreen, {
        isOpen: true,
        onOpenChange: () => {},
        debugMode: true,
      })
    );
    await flushReact();
    return warnings;
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
    root?.unmount();
    await flushReact();
    host.remove();
    document.body.innerHTML = "";
  }
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`Invalid hex: ${hex}`);
  const [r, g, b] = [
    parseInt(m[1]!, 16),
    parseInt(m[2]!, 16),
    parseInt(m[3]!, 16),
  ];
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;
  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h = (h * 60 + 360) % 360;
  }
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

function hueDelta(a: number, b: number): number {
  const delta = Math.abs(a - b) % 360;
  return delta > 180 ? 360 - delta : delta;
}

function rgbToHex(value: string): string {
  const match = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(value);
  expect(match).not.toBeNull();
  const [, r, g, b] = match!;
  return `#${[r, g, b]
    .map((n) => parseInt(n, 10).toString(16).padStart(2, "0"))
    .join("")}`;
}

describe("macOS boot screen accent tokens", () => {
  test("default accent emits no boot overrides", () => {
    expect(getAccentCssVars("aqua", "default", false)).toEqual({});
  });

  test("named accent shifts boot backdrop hue while keeping stock lightness", () => {
    const purple = getAccentCssVars("aqua", "purple", false);
    const refHsl = hexToHsl("#4566a0");
    const purpleHex = rgbToHex(purple["--os-accent-boot-bg"]!);
    const purpleHsl = hexToHsl(purpleHex);

    expect(hueDelta(hexToHsl("#8344c4").h, purpleHsl.h)).toBeLessThanOrEqual(12);
    expect(Math.abs(purpleHsl.l - refHsl.l)).toBeLessThan(0.03);
    expect(Math.abs(purpleHsl.s - refHsl.s)).toBeLessThan(0.05);
  });

  test("boot apple filter keeps the washed base and applies accent hue", () => {
    const purple = getAccentCssVars("aqua", "purple", false);
    const filter = purple["--os-accent-boot-apple-filter"]!;

    expect(filter).toStartWith("grayscale(50%) brightness(1.25)");
    expect(filter).toContain("hue-rotate(");
    expect(purple["--os-accent-apple-filter"]).toContain("hue-rotate(");
  });

  test("BootScreen overlay and logo consume boot accent CSS variables", () => {
    expect(bootScreenSource).toContain("var(--os-accent-boot-bg, #4566a0)");
    expect(bootScreenSource).toContain("boot-screen-apple-logo");
    expect(bootScreenSource).not.toContain('filter: "grayscale(50%) brightness(1.25)"');
  });

  test("BootScreen supplies descriptions for each Radix dialog content", () => {
    expect(bootScreenSource).toContain("DialogDescription");
    expect(
      bootScreenSource.match(
        /<DialogDescription>\{dialogDescription\}<\/DialogDescription>/g
      )
    ).toHaveLength(3);
  });

  test("BootScreen renders without Radix missing-description warnings", async () => {
    for (const theme of ["macosx", "system7", "xp", "win98"] as const) {
      const warnings = await renderBootScreen(theme);
      expect(
        warnings.some(
          (warning) =>
            warning.includes("Missing `Description`") ||
            warning.includes("aria-describedby={undefined}")
        )
      ).toBe(false);
    }
  });

  test("debug mode does not start the boot progress interval", async () => {
    const originalSetInterval = window.setInterval;
    const boundSetInterval: typeof window.setInterval =
      originalSetInterval.bind(window);
    let intervalCount = 0;

    window.setInterval = (...args) => {
      intervalCount += 1;
      return boundSetInterval(...args);
    };

    try {
      await renderBootScreen("system7");
      expect(intervalCount).toBe(0);
    } finally {
      window.setInterval = originalSetInterval;
    }
  });

  test("unmounting after progress reaches 100 clears pending completion", async () => {
    let root: Root | null = null;
    const host = document.createElement("div");
    let completeCount = 0;

    document.body.appendChild(host);
    useThemeStore.setState({ current: "system7" });

    try {
      root = createRoot(host);
      root.render(
        React.createElement(BootScreen, {
          isOpen: true,
          onOpenChange: () => {},
          onBootComplete: () => {
            completeCount += 1;
          },
        })
      );
      await flushReact();
      await wait(2100);

      root.unmount();
      root = null;
      await wait(650);

      expect(completeCount).toBe(0);
    } finally {
      root?.unmount();
      host.remove();
      document.body.innerHTML = "";
    }
  });

  test("dark-aqua.css wires boot apple logo filter with stock fallback", () => {
    expect(darkAquaThemeCss).toContain("img.boot-screen-apple-logo");
    expect(darkAquaThemeCss).toContain("--os-accent-boot-apple-filter");
    expect(darkAquaThemeCss).toContain("grayscale(50%) brightness(1.25)");
  });
});
