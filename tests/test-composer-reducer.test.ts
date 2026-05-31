import { describe, expect, test } from "bun:test";
import {
  composerInitialState,
  composerReducer,
} from "../src/apps/chats/components/chat-input/composerState";

describe("composerReducer — referential bail-out", () => {
  test("setHistoryIndex with the same value returns the same state reference", () => {
    // The chat input fires an input-change effect that re-asserts
    // historyIndex: -1 on every keystroke. setInputAndResetHistory already
    // reset it, so this dispatch must be a no-op to let useReducer skip a
    // second wasted render of the composer.
    const state = { ...composerInitialState, historyIndex: -1 };
    const next = composerReducer(state, { type: "setHistoryIndex", value: -1 });
    expect(next).toBe(state);
  });

  test("setHistoryIndex with a different value returns a new state", () => {
    const state = { ...composerInitialState, historyIndex: -1 };
    const next = composerReducer(state, { type: "setHistoryIndex", value: 2 });
    expect(next).not.toBe(state);
    expect(next.historyIndex).toBe(2);
  });

  test("setInput with the same value returns the same state reference", () => {
    const state = { ...composerInitialState, input: "hello" };
    const next = composerReducer(state, { type: "setInput", value: "hello" });
    expect(next).toBe(state);
  });

  test("setSelectedImage with the same value returns the same state reference", () => {
    const state = { ...composerInitialState, selectedImage: null };
    const next = composerReducer(state, {
      type: "setSelectedImage",
      value: null,
    });
    expect(next).toBe(state);
  });

  test("setInputAndResetHistory updates input and resets history in one step", () => {
    const state = { ...composerInitialState, input: "", historyIndex: 3 };
    const next = composerReducer(state, {
      type: "setInputAndResetHistory",
      value: "h",
    });
    expect(next.input).toBe("h");
    expect(next.historyIndex).toBe(-1);
  });
});
