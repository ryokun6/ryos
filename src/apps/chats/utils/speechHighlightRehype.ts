import { defaultRehypePlugins } from "streamdown";
import type { Element, Parent, Root, Text } from "hast";
import type { PluggableList } from "unified";
import { visitParents } from "unist-util-visit-parents";

type StreamdownSanitizeSchema = Record<string, unknown> & {
  tagNames: string[];
  attributes: Record<string, unknown>;
};

/** hast-util-sanitizer uses `className`, not `"class"`, when whitelisting. */
const TTS_MARK_ATTRS = ["className"] as const;

const streamdownSanitizeTuple = defaultRehypePlugins.sanitize as unknown as readonly [
  unknown,
  StreamdownSanitizeSchema,
];

const streamdownSanitizePlugin = streamdownSanitizeTuple[0];
const streamdownSanitizeSchema = streamdownSanitizeTuple[1];

const sanitizeSchemaWithRyosAssistTtsMark: StreamdownSanitizeSchema = {
  ...streamdownSanitizeSchema,
  tagNames: [...streamdownSanitizeSchema.tagNames, "mark"],
  attributes: {
    ...streamdownSanitizeSchema.attributes,
    mark: TTS_MARK_ATTRS,
  },
};

const MARK_CLASS = "ryos-chat-tts-mark";

function ancestorIsPre(ancestors: readonly unknown[]): boolean {
  return ancestors.some(
    (a) =>
      typeof a === "object" &&
      a !== null &&
      (a as Element).type === "element" &&
      (a as Element).tagName === "pre",
  );
}

function markElementHighlightedText(textNode: Text): Element {
  return {
    type: "element",
    tagName: "mark",
    properties: { className: [MARK_CLASS] },
    children: [textNode],
  };
}

type SplitEdit = Readonly<{ parent: Parent; index: number; newNodes: Array<Text | Element> }>;

/**
 * unified freezes attachers via `plugin.apply(processor, ...)` and expects the
 * return value of that call to be the tree transformer (`rehype-raw`,
 * `rehype-sanitize`, etc. all follow `options => (tree,file) => void`).
 */
function createRyosAssistTtsSpeechMarkPlugin(lo: number, hi: number) {
  return function speechMarkAttacher() {
    return function speechMarkTransform(
      tree: Root | null | undefined,
    ): undefined {
      if (!tree || hi <= lo) return;

      const edits: SplitEdit[] = [];

      visitParents(tree, "text", (node, ancestors) => {
        if (node.type !== "text") return;

        const pos = node.position;
        const ts =
          typeof pos?.start?.offset === "number" ? pos.start.offset : undefined;
        const te =
          typeof pos?.end?.offset === "number" ? pos.end.offset : undefined;
        if (ts === undefined || te === undefined) return;
        if (ancestorIsPre(ancestors)) return;

        const parent = ancestors.at(-1) as Parent | undefined;
        const children = parent?.children;
        if (!children) return;

        const idx = children.indexOf(node);
        if (idx < 0) return;

        const segStartInSource = Math.max(lo, ts);
        const segEndInSource = Math.min(hi, te);
        if (segEndInSource <= segStartInSource) return;

        const i0 = segStartInSource - ts;
        const i1 = segEndInSource - ts;
        const v = node.value;
        const before = v.slice(0, i0);
        const mid = v.slice(i0, i1);
        const after = v.slice(i1);

        const replacement: Array<Text | Element> = [];
        if (before.length > 0) replacement.push({ type: "text", value: before });
        replacement.push(markElementHighlightedText({ type: "text", value: mid }));
        if (after.length > 0) replacement.push({ type: "text", value: after });

        edits.push({ parent, index: idx, newNodes: replacement });
      });

      /* Same parent only: splice high indices first */
      edits.sort((a, b) => {
        if (a.parent !== b.parent) return 0;
        return b.index - a.index;
      });

      for (const { parent, index, newNodes } of edits) {
        parent.children.splice(index, 1, ...(newNodes as never[]));
      }
    };
  };
}

/**
 * Mirrors Streamdown’s default rehype stack when `rehypePlugins !== default`:
 * raw → sanitize+harden → mark pass. Animated / math plugins Streamdown adds
 * after this list unchanged.
 *
 * Indices are UTF-16, relative to the markdown string fed to Streamdown for
 * this bubble text part (`getAssistantVisibleText` offsets).
 */
export function buildRyosAssistTtsStreamdownRehypePlugins(
  partRelativeUtf16Start: number,
  partRelativeUtf16EndExclusive: number,
): PluggableList {
  return [
    defaultRehypePlugins.raw,
    [
      streamdownSanitizePlugin,
      sanitizeSchemaWithRyosAssistTtsMark,
    ] as unknown as PluggableList[number],
    defaultRehypePlugins.harden,
    createRyosAssistTtsSpeechMarkPlugin(
      partRelativeUtf16Start,
      partRelativeUtf16EndExclusive,
    ),
  ] as PluggableList;
}

export type AssistTtsHighlightSlice = Readonly<{
  messageId: string;
  start: number;
  end: number;
}>;

/** `rehypePlugins` for assistant Streamdown bubbles when auto/bubble speech is highlighting this part */
export function ryosAssistTtsRehypePluginsForAssistantMarkdownPart(opts: Readonly<{
  highlightSegment: AssistTtsHighlightSlice | null | undefined;
  messageId: string | undefined | null;
  messageRole: string;
  partMarkdownUtf16: string;
  /** Cursor from `getAssistantVisibleText`-space UTF-16 before this part */
  partGlobalUtf16Start: number;
}>): PluggableList | undefined {
  if (
    opts.messageRole !== "assistant" ||
    !opts.messageId ||
    !opts.highlightSegment ||
    opts.highlightSegment.messageId !== opts.messageId
  ) {
    return undefined;
  }

  const gs = opts.partGlobalUtf16Start;
  const ge = gs + opts.partMarkdownUtf16.length;
  const lo = Math.max(opts.highlightSegment.start, gs);
  const hi = Math.min(opts.highlightSegment.end, ge);

  if (lo >= hi) return undefined;

  const highlightedSliceUtf16 = opts.partMarkdownUtf16.slice(lo - gs, hi - gs);
  if (highlightedSliceUtf16.includes("```")) return undefined;

  return buildRyosAssistTtsStreamdownRehypePlugins(lo - gs, hi - gs);
}
