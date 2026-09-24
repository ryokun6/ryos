import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StaticCrashFallback } from "../../../src/components/errors/ErrorBoundaries";
import {
  formatCrashDiagnosticDump,
  truncateCrashUserAgent,
} from "../../../src/utils/errorReporting";

if (typeof document === "undefined") {
  GlobalRegistrator.register();
}

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  writable: true,
  value: true,
});

const readSource = (relativePath: string): string =>
  readFileSync(resolve(process.cwd(), relativePath), "utf-8");

describe("crash diagnostics", () => {
  test("formats name, message, stack, componentStack, and truncated UA", () => {
    const error = new Error("Karaoke open exploded");
    error.name = "TypeError";
    error.stack = "TypeError: Karaoke open exploded\n    at LyricsDisplay";
    const dump = formatCrashDiagnosticDump({
      error,
      componentStack: "\n    in LyricsDisplay\n    in Desktop",
      appId: "karaoke",
      userAgent: `Mozilla/5.0 ${"x".repeat(200)}`,
      timestamp: "2026-09-24T05:57:00.000Z",
      boundary: "DesktopErrorBoundary",
    });

    expect(dump).toContain("TypeError: Karaoke open exploded");
    expect(dump).toContain("appId: karaoke");
    expect(dump).toContain("time: 2026-09-24T05:57:00.000Z");
    expect(dump).toContain("stack:\nTypeError: Karaoke open exploded");
    expect(dump).toContain("componentStack:\nin LyricsDisplay");
    expect(dump).toContain("ua: Mozilla/5.0 ");
    expect(dump).toContain("…");
    expect(dump.length).toBeLessThan(error.stack.length + 500);
    expect(truncateCrashUserAgent("short-ua")).toBe("short-ua");
  });

  test("iOS Desktop fallback still receives the caught error", () => {
    const source = readSource("src/components/errors/ErrorBoundaries.tsx");
    expect(source).toContain("fallback={(error, componentStack) => {");
    expect(source).toMatch(
      /<StaticCrashFallback[\s\S]*error=\{error\}[\s\S]*componentStack=\{componentStack\}[\s\S]*if \(isIosWebKit\(\)\) \{\s*return staticFallback;/,
    );
  });
});

describe("StaticCrashFallback", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
  });

  test("renders the actual exception, stack, and componentStack", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const error = new Error("simulated iOS Desktop crash");
    error.name = "TypeError";
    error.stack =
      "TypeError: simulated iOS Desktop crash\n    at KaraokeWindowContent";

    await act(async () => {
      root?.render(
        <StaticCrashFallback
          heading="Desktop quit unexpectedly."
          description="Reload ryOS to restore the Dock, Desktop, and menu bar."
          primaryActionLabel="Reload Desktop"
          onPrimaryAction={() => {}}
          error={error}
          componentStack={"    in KaraokeWindowContent\n    in AppManager"}
          appId="karaoke"
          timestamp="2026-09-24T05:57:00.000Z"
          userAgent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"
        />,
      );
    });

    expect(container.textContent).toContain("Desktop quit unexpectedly.");
    expect(container.textContent).toContain("TypeError: simulated iOS Desktop crash");
    expect(container.textContent).toContain("at KaraokeWindowContent");
    expect(container.textContent).toContain("in KaraokeWindowContent");
    expect(container.textContent).toContain("appId: karaoke");
    expect(container.textContent).toContain("iPhone");
    expect(container.textContent).toContain("Reload Desktop");
    expect(container.querySelector("pre")?.className).toContain("select-text");
  });
});
