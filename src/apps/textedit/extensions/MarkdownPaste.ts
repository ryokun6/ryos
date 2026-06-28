import { Extension } from "@tiptap/core";
import {
  DOMParser as ProseMirrorDOMParser,
  Slice,
} from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import {
  getMarkdownTextForPaste,
  markdownToSafeHtml,
} from "../utils/markdownPaste";

export function handleMarkdownPaste(
  view: EditorView,
  event: ClipboardEvent
): boolean {
  const clipboardData = event.clipboardData;
  if (!clipboardData) {
    return false;
  }

  const markdown = getMarkdownTextForPaste(clipboardData);
  if (markdown === null) {
    return false;
  }

  const container = document.createElement("div");
  container.innerHTML = markdownToSafeHtml(markdown);
  const parser = ProseMirrorDOMParser.fromSchema(view.state.schema);
  const parsedDocument = parser.parse(container);
  const isSingleParagraph =
    parsedDocument.childCount === 1 &&
    parsedDocument.firstChild?.type.name === "paragraph";
  const slice = isSingleParagraph
    ? parser.parseSlice(container)
    : new Slice(parsedDocument.content, 0, 0);

  event.preventDefault();
  view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
  return true;
}

export const MarkdownPaste = Extension.create({
  name: "markdownPaste",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handlePaste: handleMarkdownPaste,
        },
      }),
    ];
  },
});
