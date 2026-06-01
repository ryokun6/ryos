import React from "react";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ToolInvocationMessage } from "../src/components/shared/ToolInvocationMessage";

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
  test("renders nothing for pending app launch tool calls", () => {
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

  test("still renders non-app loading tool calls", () => {
    const markup = renderToStaticMarkup(
      <ToolInvocationMessage
        {...defaultProps}
        part={{
          type: "tool-read",
          toolCallId: "call-2",
          state: "input-available",
          input: { path: "/Documents/Notes.txt" },
        }}
      />
    );

    expect(markup).toContain("apps.chats.toolCalls.readingFile");
  });
});
