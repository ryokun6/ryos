import { afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { IsolatingErrorBoundary } from "../../../src/components/errors/ErrorBoundaries";

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

function ThrowOnRender(): React.ReactNode {
  throw new Error("simulated lyrics Motion / WAAPI throw");
}

describe("IsolatingErrorBoundary", () => {
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

  test("contains a render throw and shows the local fallback", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const consoleError = console.error;
    console.error = () => {};
    try {
      await act(async () => {
        root?.render(
          <IsolatingErrorBoundary
            fallback={<div data-testid="isolated-fallback">lyrics unavailable</div>}
          >
            <ThrowOnRender />
          </IsolatingErrorBoundary>,
        );
      });
    } finally {
      console.error = consoleError;
    }

    expect(container.textContent).toContain("lyrics unavailable");
    expect(container.textContent).not.toContain("Desktop quit unexpectedly");
    expect(container.textContent).not.toContain("Reload Desktop");
  });

  test("crash-dialog fallbacks are themselves isolated", () => {
    const source = readSource("src/components/errors/ErrorBoundaries.tsx");
    expect(source).toContain("IsolatingErrorBoundary");
    expect(source).toContain("StaticCrashFallback");
    expect(source.match(/<IsolatingErrorBoundary/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  test("Karaoke window and fullscreen isolate lyrics/visual throws", () => {
    const windowSource = readSource(
      "src/apps/karaoke/components/karaoke-app/KaraokeWindowContent.tsx",
    );
    const fullscreenSource = readSource(
      "src/apps/karaoke/components/karaoke-app/KaraokeFullscreenView.tsx",
    );
    expect(windowSource).toContain("IsolatingErrorBoundary");
    expect(fullscreenSource).toContain("IsolatingErrorBoundary");
  });
});
