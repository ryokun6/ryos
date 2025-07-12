import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const speechHighlightKey = new PluginKey("speechHighlight");

/**
 * A TipTap extension that exposes a plugin allowing callers to highlight an
 * arbitrary range in the editor using ProseMirror decorations.  Because it
 * relies on decorations (not marks) it does **not** mutate the underlying
 * document, so no unsaved-changes events are triggered.
 *
 * Dispatch a transaction with metadata:
 *   { range: { from: number, to: number } }  → highlights that span.
 *   { clear: true }                           → removes all highlights.
 */
export const SpeechHighlight = Extension.create({
  name: "speechHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: speechHighlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            // Map existing decorations through document changes first
            const deco = old.map(tr.mapping, tr.doc);
            const meta = tr.getMeta(speechHighlightKey);
            if (meta?.clear) {
              // Explicit clear request
              return DecorationSet.empty;
            }
            if (meta?.range) {
              const { from, to } = meta.range as { from: number; to: number };
              if (typeof from === "number" && typeof to === "number") {
                // Replace the decoration set with a single highlight decoration
                return DecorationSet.create(tr.doc, [
                  Decoration.inline(from, to, {
                    class: "tts-highlight",
                    style: "background-color: rgba(255,255,0,0.4);",
                  }),
                ]);
              }
            }
            return deco;
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});
