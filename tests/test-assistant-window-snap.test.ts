import { describe, expect, test } from "bun:test";
import { resolveAssistantSnapPoint } from "../src/components/assistant/assistantSnap";
import { createToolOpenResultTracker } from "../src/apps/chats/tools/toolOpenResult";
import type { ToolOutputPayload } from "../src/apps/chats/tools/types";

const viewport = {
  width: 1440,
  height: 900,
  topInset: 24,
  bottomInset: 80,
};
const assistantSize = { width: 124, height: 93 };

describe("assistant window snap point", () => {
  test("prefers the right side of the bottom-right corner when it fits", () => {
    expect(
      resolveAssistantSnapPoint({
        currentPosition: { x: 1300, y: 700 },
        assistantSize,
        viewport,
        targetBounds: { x: 100, y: 80, width: 600, height: 500 },
      })
    ).toEqual({ x: 708, y: 487 });
  });

  test("uses an upper edge when the bottom edge has no room", () => {
    expect(
      resolveAssistantSnapPoint({
        currentPosition: { x: 1200, y: 700 },
        assistantSize,
        viewport,
        targetBounds: { x: 100, y: 400, width: 600, height: 400 },
      })
    ).toEqual({ x: 576, y: 299 });
  });

  test("moves to the left when the target is against the right edge", () => {
    expect(
      resolveAssistantSnapPoint({
        currentPosition: { x: 1200, y: 500 },
        assistantSize,
        viewport,
        targetBounds: { x: 1000, y: 100, width: 400, height: 500 },
      })
    ).toEqual({ x: 868, y: 507 });
  });

  test("does not cover a window with no available outside point", () => {
    expect(
      resolveAssistantSnapPoint({
        currentPosition: { x: 1200, y: 700 },
        assistantSize,
        viewport,
        targetBounds: { x: 0, y: 24, width: 1440, height: 796 },
      })
    ).toBeNull();
  });

  test("falls back to the nearest viewport edge without window bounds", () => {
    expect(
      resolveAssistantSnapPoint({
        currentPosition: { x: 700, y: 400 },
        assistantSize,
        viewport,
        targetBounds: null,
      })
    ).toEqual({ x: 700, y: 719 });
  });
});

describe("assistant open-result success gating", () => {
  test("returns the launched instance after a successful tool output", () => {
    const outputs: ToolOutputPayload[] = [];
    const attempts: string[] = [];
    const tracker = createToolOpenResultTracker({
      toolName: "launchApp",
      toolCallId: "tool-1",
      context: {
        launchApp: () => "instance-7",
        addToolOutput: (output) => outputs.push(output),
      },
      onOpenAttempt: (instanceId) => attempts.push(instanceId),
    });

    tracker.context.launchApp("textedit");
    tracker.context.addToolOutput({
      tool: "launchApp",
      toolCallId: "tool-1",
      output: "Launched TextEdit",
    });

    expect(tracker.getResult()).toEqual({
      kind: "opened-app",
      toolName: "launchApp",
      toolCallId: "tool-1",
      instanceId: "instance-7",
    });
    expect(attempts).toEqual(["instance-7"]);
    expect(outputs).toHaveLength(1);
  });

  test("suppresses relocation when a tool reports failure after launching", () => {
    const tracker = createToolOpenResultTracker({
      toolName: "open",
      toolCallId: "tool-2",
      context: {
        launchApp: () => "instance-8",
        addToolOutput: () => {},
      },
    });

    tracker.context.launchApp("preview");
    tracker.context.addToolOutput({
      tool: "open",
      toolCallId: "tool-2",
      state: "output-error",
      errorText: "Could not open file",
    });

    expect(tracker.getResult()).toEqual({ kind: "none" });
  });

  test("supports successful foregrounding without a new launch", () => {
    const tracker = createToolOpenResultTracker({
      toolName: "open",
      toolCallId: "tool-3",
      context: {
        launchApp: () => "",
        addToolOutput: () => {},
      },
    });

    tracker.recordOpenedInstance("existing-textedit");

    expect(tracker.getResult()).toEqual({
      kind: "opened-app",
      toolName: "open",
      toolCallId: "tool-3",
      instanceId: "existing-textedit",
    });
  });
});
