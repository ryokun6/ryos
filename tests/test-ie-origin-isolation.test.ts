import { describe, expect, test } from "bun:test";
import {
  getTrustedIeNavigationMessage,
  parseIeNavigationMessage,
} from "../src/apps/internet-explorer/utils/navigationBridge";

function messageEvent(data: unknown, source: Window): MessageEvent {
  const event = new MessageEvent("message", {
    data,
    origin: "null",
  });
  Object.defineProperty(event, "source", { value: source });
  return event;
}

describe("IE navigation bridge", () => {
  const proxyWindow = {} as Window;
  const aiWindow = {} as Window;
  const attackerWindow = {} as Window;

  test("validates navigation message shapes", () => {
    expect(
      parseIeNavigationMessage({
        type: "iframeNavigation",
        url: "https://example.com/",
      })
    ).toEqual({
      type: "iframeNavigation",
      url: "https://example.com/",
    });
    expect(parseIeNavigationMessage({ type: "iframeNavigation" })).toBeNull();
    expect(parseIeNavigationMessage({ type: "goBack", url: 42 })).toBeNull();
    expect(parseIeNavigationMessage({ type: "unknown" })).toBeNull();
  });

  test("accepts opaque-origin messages from the active proxy iframe", () => {
    const event = messageEvent(
      { type: "iframeNavigation", url: "https://example.com/next" },
      proxyWindow
    );
    expect(
      getTrustedIeNavigationMessage({
        event,
        activeProxyWindow: proxyWindow,
        aiPreviewWindows: new Set(),
      })
    ).toEqual({
      type: "iframeNavigation",
      url: "https://example.com/next",
    });
  });

  test("rejects proxy navigation from any other window", () => {
    const event = messageEvent(
      { type: "iframeNavigation", url: "https://example.com/next" },
      attackerWindow
    );
    expect(
      getTrustedIeNavigationMessage({
        event,
        activeProxyWindow: proxyWindow,
        aiPreviewWindows: new Set([aiWindow]),
      })
    ).toBeNull();
  });

  test("accepts navigation from a registered Time Machine proxy iframe", () => {
    const event = messageEvent(
      { type: "iframeNavigation", url: "https://example.com/archive" },
      aiWindow
    );
    expect(
      getTrustedIeNavigationMessage({
        event,
        activeProxyWindow: proxyWindow,
        proxyPreviewWindows: new Set([aiWindow]),
        aiPreviewWindows: new Set(),
      })
    ).not.toBeNull();
  });

  test("accepts AI navigation only from a registered preview iframe", () => {
    const validEvent = messageEvent(
      { type: "aiHtmlNavigation", url: "https://example.com/next" },
      aiWindow
    );
    const forgedEvent = messageEvent(
      { type: "aiHtmlNavigation", url: "https://attacker.example/" },
      attackerWindow
    );
    const options = {
      activeProxyWindow: proxyWindow,
      aiPreviewWindows: new Set([aiWindow]),
    };

    expect(
      getTrustedIeNavigationMessage({ event: validEvent, ...options })
    ).not.toBeNull();
    expect(
      getTrustedIeNavigationMessage({ event: forgedEvent, ...options })
    ).toBeNull();
  });
});

describe("IE iframe sandbox wiring", () => {
  test("proxied iframe components omit allow-same-origin", async () => {
    const contentPane = await Bun.file(
      new URL(
        "../src/apps/internet-explorer/components/internet-explorer-app/InternetExplorerContentPane.tsx",
        import.meta.url
      )
    ).text();
    const timeMachine = await Bun.file(
      new URL(
        "../src/apps/internet-explorer/components/time-machine-view/TimeMachineViewPortal.tsx",
        import.meta.url
      )
    ).text();

    expect(contentPane).not.toContain("allow-same-origin");
    expect(timeMachine).not.toContain("allow-same-origin");
    expect(timeMachine).toContain("registerProxyPreviewWindow");
    expect(contentPane).toContain(
      "onIframeWindowChange={registerAiPreviewWindow}"
    );
  });
});
