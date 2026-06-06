import { describe, expect, test } from "bun:test";
import {
  composerInitialState,
  composerReducer,
} from "../src/apps/chats/components/chat-input/composerState";

describe("chat input composer reducer", () => {
  test("keeps history index while navigating message history", () => {
    const state = composerReducer(composerInitialState, {
      type: "setHistoryNavigation",
      value: { index: 1, input: "previous message" },
    });

    expect(state).toEqual({
      input: "previous message",
      historyIndex: 1,
      selectedImage: null,
    });
  });

  test("resets history index when input is replaced outside history navigation", () => {
    const state = composerReducer(
      { input: "previous message", historyIndex: 1, selectedImage: null },
      { type: "setInputAndResetHistory", value: "new message" }
    );

    expect(state).toEqual({
      input: "new message",
      historyIndex: -1,
      selectedImage: null,
    });
  });

  test("resets history index when composer is cleared", () => {
    const state = composerReducer(
      {
        input: "previous message",
        historyIndex: 1,
        selectedImage: "data:image/png;base64,image",
      },
      { type: "clearComposer" }
    );

    expect(state).toEqual({
      input: "",
      historyIndex: -1,
      selectedImage: null,
    });
  });
});
