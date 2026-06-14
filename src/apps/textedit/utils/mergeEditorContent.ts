import type { Editor, JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { DOMParser as ProseMirrorDOMParser } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { TextSelection } from "@tiptap/pm/state";

/**
 * Content that can be merged into a TextEdit editor. Either a TipTap/ProseMirror
 * document JSON object, or an HTML string (parsed with the editor's own schema).
 */
export type MergeableContent = JSONContent | string;

interface MergeOptions {
  /**
   * When true (default) the user's selection, focus and scroll position are
   * preserved across the merge. Set to false to behave like a plain replace.
   */
  preserveSelection?: boolean;
}

/**
 * Minimal contiguous range that differs between two documents.
 *  - `start`  position where the documents start to differ
 *  - `endA`   end of the changed range in the *old* document
 *  - `endB`   end of the changed range in the *new* document
 */
export interface MergeRange {
  start: number;
  endA: number;
  endB: number;
}

function clampPos(pos: number, doc: ProseMirrorNode): number {
  return Math.max(0, Math.min(pos, doc.content.size));
}

/**
 * Compute the minimal contiguous range that differs between two ProseMirror
 * documents using `findDiffStart` / `findDiffEnd`. Returns `null` when the
 * document contents are identical (nothing to merge).
 *
 * This is the core of the cursor-preserving merge: by replacing only the
 * changed range (instead of the whole document) we can map the user's caret
 * through the resulting transaction so it follows its surrounding text.
 */
export function computeMergeRange(
  oldDoc: ProseMirrorNode,
  newDoc: ProseMirrorNode
): MergeRange | null {
  const start = oldDoc.content.findDiffStart(newDoc.content);
  if (start == null) {
    return null;
  }

  const diffEnd = oldDoc.content.findDiffEnd(newDoc.content);
  let endA = diffEnd ? diffEnd.a : oldDoc.content.size;
  let endB = diffEnd ? diffEnd.b : newDoc.content.size;

  // findDiffStart / findDiffEnd can yield overlapping ranges (e.g. when the
  // same text is inserted next to identical text); widen the end bounds so the
  // replaced range stays valid.
  const overlap = start - Math.min(endA, endB);
  if (overlap > 0) {
    endA += overlap;
    endB += overlap;
  }

  return { start, endA, endB };
}

/**
 * Build a transaction that incrementally replaces only the changed range of the
 * document with the corresponding content from `newDoc`, mapping the current
 * selection through the change so the caret is preserved.
 *
 * Returns `null` when the documents already have identical content.
 */
export function buildMergeTransaction(
  state: EditorState,
  newDoc: ProseMirrorNode,
  options: MergeOptions = {}
): Transaction | null {
  const { preserveSelection = true } = options;
  const range = computeMergeRange(state.doc, newDoc);
  if (!range) {
    return null;
  }

  const { start, endA, endB } = range;
  const slice = newDoc.slice(start, endB);
  const tr = state.tr.replace(start, endA, slice);

  if (preserveSelection) {
    const { from, to } = state.selection;
    const mappedFrom = clampPos(tr.mapping.map(from, 1), tr.doc);
    const mappedTo = clampPos(tr.mapping.map(to, 1), tr.doc);
    try {
      tr.setSelection(TextSelection.create(tr.doc, mappedFrom, mappedTo));
    } catch {
      /* selection mapping is best-effort */
    }
  }

  // Keep external updates out of the user's undo history and let listeners
  // recognise them as programmatic (non-dirtying) updates.
  tr.setMeta("addToHistory", false);
  tr.setMeta("external", true);
  return tr;
}

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el?.parentElement ?? null;
  while (node) {
    const style = window.getComputedStyle(node);
    const overflowY = style.overflowY;
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Build a ProseMirror document node from arbitrary mergeable content using the
 * editor's live schema (so it matches the installed extensions exactly).
 */
function buildDocNode(
  editor: Editor,
  content: MergeableContent
): ProseMirrorNode | null {
  const { schema } = editor.state;
  try {
    if (typeof content === "string") {
      const template = document.createElement("div");
      template.innerHTML = content;
      return ProseMirrorDOMParser.fromSchema(schema).parse(template);
    }
    return schema.nodeFromJSON(content);
  } catch (error) {
    console.warn("[TextEdit] mergeEditorContent: failed to build doc node", error);
    return null;
  }
}

function restoreFocusAndScroll(
  editor: Editor,
  scrollParent: HTMLElement | null,
  previousScrollTop: number
): void {
  // Re-focusing can scroll the caret into view; restore the prior scroll
  // position afterwards so the viewport doesn't jump around the user.
  editor.view.focus();
  if (scrollParent) {
    scrollParent.scrollTop = previousScrollTop;
  }
}

/**
 * Reactively merge externally-sourced content into a live TipTap editor while
 * preserving the user's caret, selection, focus and scroll position.
 *
 * Instead of rebuilding the whole document (which would reset the caret to the
 * top and lose the user's place), this computes the minimal changed range
 * between the current document and the incoming one and replaces only that
 * range in a single transaction. The user's selection is then mapped through
 * that transaction so the caret follows its surrounding text when edits happen
 * before it, and stays put when edits happen after it.
 *
 * @returns `true` if the document was changed, `false` if it was already
 * up to date (or the content could not be parsed).
 */
export function mergeEditorContent(
  editor: Editor,
  content: MergeableContent,
  options: MergeOptions = {}
): boolean {
  const { preserveSelection = true } = options;
  const { state, view } = editor;
  const oldDoc = state.doc;

  const newDoc = buildDocNode(editor, content);
  if (!newDoc) return false;

  // Nothing to do if the documents are already identical.
  if (oldDoc.eq(newDoc)) return false;

  const wasFocused = view.hasFocus();
  const scrollParent = findScrollParent(view.dom as HTMLElement);
  const previousScrollTop = scrollParent?.scrollTop ?? 0;

  const dispatchFullReplace = () => {
    // Fallback: rebuild the document but keep the caret near its old offset.
    const { from, to } = state.selection;
    editor.commands.setContent(content, false);
    if (preserveSelection) {
      try {
        const nextDoc = editor.state.doc;
        editor.commands.setTextSelection({
          from: clampPos(from, nextDoc),
          to: clampPos(to, nextDoc),
        });
      } catch {
        /* selection restore is best-effort */
      }
    }
  };

  try {
    const tr = buildMergeTransaction(state, newDoc, { preserveSelection });
    if (tr) {
      view.dispatch(tr);
    } else {
      // Content fragments are identical but the documents differ (e.g. doc-level
      // attrs); fall back to a full replace.
      dispatchFullReplace();
    }
  } catch (error) {
    console.warn(
      "[TextEdit] mergeEditorContent: incremental merge failed, replacing",
      error
    );
    dispatchFullReplace();
  }

  if (wasFocused) {
    restoreFocusAndScroll(editor, scrollParent, previousScrollTop);
  }

  return true;
}
