#!/usr/bin/env bun

import { describe, expect, test } from "bun:test";
import { Editor } from "@tiptap/core";
import { Schema, type Node as PMNode } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import {
  buildMergeTransaction,
  computeMergeRange,
  mergeEditorContent,
} from "../src/apps/textedit/utils/mergeEditorContent";

// Minimal schema (doc > paragraph > text) — enough to exercise the diff/merge
// math without needing a DOM or a full TipTap editor.
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      group: "block",
      content: "inline*",
      parseDOM: [{ tag: "p" }],
      toDOM: () => ["p", 0],
    },
    text: { group: "inline" },
  },
  marks: {},
});

function makeDoc(text: string): PMNode {
  return schema.node("doc", null, [
    schema.node("paragraph", null, text ? [schema.text(text)] : []),
  ]);
}

function makeStateWithCaret(text: string, caret: number): EditorState {
  const doc = makeDoc(text);
  const state = EditorState.create({ schema, doc });
  return state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, caret))
  );
}

describe("TextEdit cursor-preserving merge", () => {
  test("identical documents produce no merge transaction", () => {
    const state = makeStateWithCaret("Hello world", 7);
    const tr = buildMergeTransaction(state, makeDoc("Hello world"));
    expect(tr).toBeNull();
    expect(computeMergeRange(state.doc, makeDoc("Hello world"))).toBeNull();
  });

  test("insertion before the caret moves the caret with its text", () => {
    // Caret sits just before "world" (position 7) in "Hello world".
    const state = makeStateWithCaret("Hello world", 7);
    const tr = buildMergeTransaction(state, makeDoc("Say Hello world"));

    expect(tr).not.toBeNull();
    // "Say " (4 chars) inserted before the caret -> caret shifts 7 -> 11.
    expect(tr!.selection.from).toBe(11);
    expect(tr!.doc.textContent).toBe("Say Hello world");
  });

  test("insertion after the caret leaves the caret put", () => {
    const state = makeStateWithCaret("Hello world", 7);
    const tr = buildMergeTransaction(state, makeDoc("Hello world!!!"));

    expect(tr).not.toBeNull();
    // Appended text is after the caret -> caret unchanged at 7.
    expect(tr!.selection.from).toBe(7);
    expect(tr!.doc.textContent).toBe("Hello world!!!");
  });

  test("merge only replaces the minimal changed range", () => {
    const oldDoc = makeDoc("The quick brown fox");
    const newDoc = makeDoc("The slow brown fox");
    const range = computeMergeRange(oldDoc, newDoc);

    expect(range).not.toBeNull();
    // Only "quick" -> "slow" changes; the shared prefix/suffix stay untouched.
    expect(oldDoc.textBetween(range!.start, range!.endA)).toBe("quick");
    expect(newDoc.textBetween(range!.start, range!.endB)).toBe("slow");
  });

  test("merge transaction is flagged external and non-undoable", () => {
    const state = makeStateWithCaret("Hello world", 7);
    const tr = buildMergeTransaction(state, makeDoc("Hello brave world"));

    expect(tr).not.toBeNull();
    expect(tr!.getMeta("external")).toBe(true);
    expect(tr!.getMeta("addToHistory")).toBe(false);
  });

  test("selection preservation can be disabled", () => {
    const state = makeStateWithCaret("Hello world", 7);
    const tr = buildMergeTransaction(state, makeDoc("Say Hello world"), {
      preserveSelection: false,
    });

    expect(tr).not.toBeNull();
    // Without preservation the selection is not explicitly remapped; the caret
    // stays at the raw mapped default rather than being re-anchored by us.
    expect(tr!.doc.textContent).toBe("Say Hello world");
  });

  test("merging into an unmounted editor does not throw (Tiptap 3 view proxy)", () => {
    // With @tiptap/react v3, useEditor creates the editor with `element: null`
    // and mounts the view later; until then editor.view is a proxy that throws
    // on DOM accessors like hasFocus/dom. External syncs (e.g. the AI edit
    // tool or file sync) can fire before the mount, and must still merge.
    const paragraph = (text: string) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    });
    const editor = new Editor({
      element: null,
      extensions: [StarterKit],
      content: { type: "doc", content: [paragraph("Hello")] },
    });

    try {
      const changed = mergeEditorContent(editor, {
        type: "doc",
        content: [paragraph("Hello world")],
      });

      expect(changed).toBe(true);
      expect(editor.state.doc.textContent).toBe("Hello world");
    } finally {
      editor.destroy();
    }
  });
});
