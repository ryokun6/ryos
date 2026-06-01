import React from "react";
import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values?.appName ? `${key}:${values.appName}` : key,
  }),
}));

mock.module("@/components/shared/HtmlPreview", () => ({
  default: () => null,
}));

mock.module("@/components/shared/CursorCloudAgentRunsListCard", () => ({
  CursorCloudAgentRunsListCard: () => null,
}));

mock.module("@/components/shared/CursorRepoAgentChatCard", () => ({
  CursorRepoAgentChatCard: () => null,
}));

mock.module("@/components/shared/MapsSearchPlacesCard", () => ({
  MapsSearchPlacesCard: () => null,
}));

mock.module("@/components/ui/activity-indicator", () => ({
  ActivityIndicator: () =>
    React.createElement("span", { "data-testid": "spinner" }),
}));

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

  test("still renders non-app loading tool calls", async () => {
    const ToolInvocationMessage = await loadToolInvocationMessage();
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
