import { beforeEach, describe, expect, test } from "bun:test";
import type { ToolContext, ToolOutputPayload } from "../src/apps/chats/tools/types";
import { handleStickiesControl } from "../src/apps/chats/tools/stickiesHandler";
import { initializeI18n } from "../src/lib/i18n";
import { useAppStore } from "../src/stores/useAppStore";
import { useCloudSyncStore } from "../src/stores/useCloudSyncStore";
import { useStickiesStore } from "../src/stores/useStickiesStore";
import type { StickiesControlOutput } from "../src/shared/tools/stickies";

function createToolContext(outputs: ToolOutputPayload[], launches: string[]): ToolContext {
  return {
    launchApp: (appId) => {
      launches.push(appId);
      return `${appId}-instance`;
    },
    addToolOutput: (result) => {
      outputs.push(result);
    },
  };
}

function getStickiesOutput(payload: ToolOutputPayload): StickiesControlOutput {
  expect(payload.state).not.toBe("output-error");
  const output = payload.output;
  expect(output).toBeDefined();
  expect(typeof output).toBe("object");
  expect(output).not.toBeNull();

  const record = output as Record<string, unknown>;
  expect(record.success).toBe(true);
  expect(typeof record.message).toBe("string");
  return output as StickiesControlOutput;
}

beforeEach(async () => {
  await initializeI18n();
  useStickiesStore.setState({ notes: [] });
  useAppStore.setState({
    instances: {},
    instanceOrder: [],
    foregroundInstanceId: null,
    nextInstanceId: 1,
  });
  useCloudSyncStore.setState((state) => ({
    deletionMarkers: {
      ...state.deletionMarkers,
      stickyNoteIds: {},
    },
  }));
});

describe("stickies client tool handler", () => {
  test("lists structured notes and updates through short ids", () => {
    useStickiesStore.setState({
      notes: [
        {
          id: "note-a",
          content: "alpha",
          color: "yellow",
          position: { x: 1, y: 2 },
          size: { width: 220, height: 240 },
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "note-b",
          content: "beta",
          color: "blue",
          position: { x: 3, y: 4 },
          size: { width: 220, height: 240 },
          createdAt: 2,
          updatedAt: 2,
        },
      ],
    });

    const outputs: ToolOutputPayload[] = [];
    const launches: string[] = [];
    const context = createToolContext(outputs, launches);

    handleStickiesControl({ action: "list" }, "tool-list", context);
    const listed = getStickiesOutput(outputs[0]);
    expect(listed.message).toBe("Found 2 stickies");
    expect(listed.notes?.map((note) => note.id)).toEqual(["s1", "s2"]);

    handleStickiesControl(
      { action: "update", id: "s2", content: "updated", color: "green" },
      "tool-update",
      context
    );
    const updated = getStickiesOutput(outputs[1]);
    expect(updated.message).toBe("Sticky updated");

    const noteB = useStickiesStore
      .getState()
      .notes.find((note) => note.id === "note-b");
    expect(noteB?.content).toBe("updated");
    expect(noteB?.color).toBe("green");
    expect(launches).toEqual([]);
  });

  test("creates notes through the reducer while opening Stickies", () => {
    const outputs: ToolOutputPayload[] = [];
    const launches: string[] = [];
    const context = createToolContext(outputs, launches);

    handleStickiesControl(
      {
        action: "create",
        content: "new note",
        color: "pink",
        position: { x: 12, y: 34 },
        size: { width: 260, height: 180 },
      },
      "tool-create",
      context
    );

    const created = getStickiesOutput(outputs[0]);
    expect(created.message).toBe("Created Pink sticky");
    expect(created.note).toMatchObject({
      content: "new note",
      color: "pink",
      position: { x: 12, y: 34 },
      size: { width: 260, height: 180 },
    });
    expect(useStickiesStore.getState().notes).toHaveLength(1);
    expect(launches).toEqual(["stickies"]);
  });

  test("deletes resolved short ids and records sync tombstones", () => {
    useStickiesStore.setState({
      notes: [
        {
          id: "note-a",
          content: "alpha",
          color: "yellow",
          position: { x: 1, y: 2 },
          size: { width: 220, height: 240 },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    });

    const outputs: ToolOutputPayload[] = [];
    const launches: string[] = [];
    const context = createToolContext(outputs, launches);

    handleStickiesControl({ action: "list" }, "tool-list", context);
    handleStickiesControl({ action: "delete", id: "s1" }, "tool-delete", context);

    const deleted = getStickiesOutput(outputs[1]);
    expect(deleted.message).toBe("Sticky deleted");
    expect(useStickiesStore.getState().notes).toEqual([]);
    expect(
      useCloudSyncStore.getState().deletionMarkers.stickyNoteIds["note-a"]
    ).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
