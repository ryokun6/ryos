import { defaultRehypePlugins } from "streamdown";
import type { Element, Parent, Root, Text } from "hast";
import type { PluggableList } from "unified";
import { visitParents } from "unist-util-visit-parents";

/** Streamdown + hast-util-sanitizer use `className`, not HTML `class`, for whitelist entries. */
const RYOS_TTS_MARK: ["className"] = ["className"];

const streamdownSanitizePair = defaultRehypePlugins.sanitize as unknown as readonly [
  unknown,
  Record<string, unknown> & {
    tagNames: string[];
    attributes: Record<string, unknown>;
  },
];

const [, streamdownSanitizeSchema] = streamdownSanitizePair;

/**
 * Matches Streamdown’s own `allowedTags` merge (`mark` whitelist for TTS highlighting).
 * Used because a custom `rehypePlugins` array bypasses Streamdown's `allowedTags===default`
 * sanitization merge.
 */
export const RYOS_CHAT_STREAMDOWN_SANITIZE_WITH_TTS_MARK = {
  ...streamdownSanitizeSchema,
  tagNames: [...streamdownSanitizeSchema.tagNames, "mark"],
  attributes: {
    ...streamdownSanitizeSchema.attributes,
    mark: RYOS_TTS_MARK,
  },
} as typeof streamdownSanitizeSchema;

const TTS_MARK_CLASS = "ryos-chat-tts-mark";

function isUnderPre(ancestors: unknown[]): boolean {
  return ancestors.some(
    (a) =>
      a &&
      typeof a === "object" &&
      (a as Element).type === "element" &&
      (a as Element).tagName === "pre",
  );
}

function makeMarkElement(text: Text): Element {
  return {
    type: "element",
    tagName: "mark",
    properties: { className: [TTS_MARK_CLASS] },
    children: [text],
  };
}

/** Inserts sanitized `<mark>` in the HAST after markdown parses so inner emphasis/lists stay semantic. */
function rehypeRyosAssistSpeechHighlightPlugin(
  rangeStart: number,
  rangeEndExclusive: number,
): () => (tree: Root, file?: unknown) => undefined {
  const lo = rangeStart;
  const hi = rangeEndExclusive;

  /** unified calls this attacher once at freeze (`attacher.apply(processor)`) → must return transformer. */
  return function attacher(): (tree: Root, file?: unknown) => undefined {
    return function transformer(
      tree: Root | null | undefined,
      _file?: unknown,
    ): undefined {
      if (!tree || typeof tree !== "object") return;
      if (hi <= lo) return;

      const edits: {
        parent: Parent;
        index: number;
        newNodes: Array<Text | Element>;
      }[] = [];

      visitParents(tree, "text", (node, ancestors) => {
        if (node.type !== "text") return;
        const tnode = node as Text;

        const pos = tnode.position;
        const ts =
          typeof pos?.start?.offset === "number" ? pos.start.offset : undefined;
        const te =
          typeof pos?.end?.offset === "number" ? pos.end.offset : undefined;
        if (ts === undefined || te === undefined) return;
        if (isUnderPre(ancestors)) return;

        const parent = ancestors[ancestors.length - 1] as Parent | undefined;
        if (!parent?.children) return;

        const idx = parent.children.indexOf(tnode);
        if (idx < 0) return;

        const a = Math.max(lo, ts);
        const b = Math.min(hi, te);
        if (b <= a) return;

        const rel0 = a - ts;
        const rel1 = b - ts;
        const value = tnode.value;
        const prefix = value.slice(0, rel0);
        const mid = value.slice(rel0, rel1);
        const suffix = value.slice(rel1);

        const newNodes: Array<Text | Element> = [];
        if (prefix.length > 0) {
          newNodes.push({ type: "text", value: prefix });
        }
        newNodes.push(makeMarkElement({ type: "text", value: mid }));
        if (suffix.length > 0) {
          newNodes.push({ type: "text", value: suffix });
        }

        edits.push({
          parent,
          index: idx,
          newNodes,
        });
      });

      edits.sort((x, y) => {
        if (x.parent === y.parent) return y.index - x.index;
        return 0;
      });

      for (const edit of edits) {
        edit.parent.children.splice(
          edit.index,
          1,
          ...(edit.newNodes as never[]),
        );
      }
    };
  };
}

/**
 * Full Streamdown rehype prelude (raw → sanitize+harden → TTS mark) minus animate/math,
 * matching how Streamdown composes defaults when overriding `rehypePlugins`.
 */
export function buildRyosAssistTtsStreamdownRehypePlugins(
  utf16RangeStartInPartMarkdown: number,
  utf16RangeEndExclusiveInPartMarkdown: number,
): PluggableList {
  const [sanitizePlugin] = streamdownSanitizePair;
  return [
    defaultRehypePlugins.raw,
    [
      sanitizePlugin,
      RYOS_CHAT_STREAMDOWN_SANITIZE_WITH_TTS_MARK,
    ] as unknown as PluggableList[number],
    defaultRehypePlugins.harden,
    rehypeRyosAssistSpeechHighlightPlugin(
      utf16RangeStartInPartMarkdown,
      utf16RangeEndExclusiveInPartMarkdown,
    ),
  ] as PluggableList;
}
