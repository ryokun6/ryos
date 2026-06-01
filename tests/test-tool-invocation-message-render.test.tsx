import React from "react";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const storage = new Map<string, string>();

Object.defineProperty(globalThis, "navigator", {
  value: { hardwareConcurrency: 4, userAgent: "Bun" },
  configurable: true,
});

Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  },
  configurable: true,
});

async function loadToolInvocationMessage() {
  const mod = await import("../src/components/shared/ToolInvocationMessage");
  return mod.ToolInvocationMessage;
}

const defaultProps = {
  partKey: "part-1",
  isLoading: true,
  getAppName: (id?: string) => id || "app",
  formatToolName: (name: string) => name,
  setIsInteractingWithPreview: () => {},
  playElevatorMusic: () => {},
  stopElevatorMusic: () => {},
  playDingSound: () => {},
};

describe("ToolInvocationMessage rendering", () => {
  test("renders nothing for pending app launch tool calls", async () => {
    const ToolInvocationMessage = await loadToolInvocationMessage();
    const markup = renderToStaticMarkup(
      <ToolInvocationMessage
        {...defaultProps}
        part={{
          type: "tool-launchApp",
          toolCallId: "call-1",
          state: "input-available",
          input: { id: "textedit" },
        }}
      />
    );

    expect(markup).toBe("");
  });

});
