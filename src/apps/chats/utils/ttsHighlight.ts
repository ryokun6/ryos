// Apply a TTS "currently spoken" highlight without altering the DOM produced
// by the markdown renderer.
//
// We previously sliced the assistant's markdown source into three pieces and
// rendered each through its own <Streamdown> instance to wrap the spoken
// fragment in a highlighted <span>. That broke markdown rendering whenever a
// chunk boundary fell inside a structure that needed surrounding context
// (paragraphs joined by single newlines, lists, code blocks, bold/italic, …).
//
// The approach below renders the markdown once and uses the CSS Custom
// Highlight API (Highlight + CSS.highlights + ::highlight()) to paint the
// spoken span over the existing text nodes. When the API is missing, no
// highlight is applied.

const HIGHLIGHT_NAME = "ryos-chat-tts";

// Opaque token returned by `applyTtsHighlight` and accepted by
// `clearTtsHighlight` so callers can scope a clear to "only if I'm still the
// active highlight". Without this, sibling React effects can race: when the
// highlight moves between message bubbles, the previous bubble's cleanup may
// run AFTER the next bubble's setup, wiping out the freshly-applied highlight
// from the global registry. Ownership tracking turns those races into no-ops.
export type TtsHighlightOwner = symbol;

let currentOwner: TtsHighlightOwner | null = null;

interface HighlightCtor {
  new (...ranges: AbstractRange[]): unknown;
}

interface HighlightsRegistry {
  set: (name: string, highlight: unknown) => void;
  delete: (name: string) => void;
  has?: (name: string) => boolean;
}

function getHighlightsRegistry(): HighlightsRegistry | null {
  if (typeof CSS === "undefined") return null;
  const reg = (CSS as unknown as { highlights?: HighlightsRegistry }).highlights;
  return reg ?? null;
}

function getHighlightCtor(): HighlightCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as unknown as { Highlight?: HighlightCtor }).Highlight;
  return ctor ?? null;
}

export function isTtsHighlightSupported(): boolean {
  return getHighlightsRegistry() !== null && getHighlightCtor() !== null;
}

// Clear the registered highlight. If `owner` is supplied, only clears when
// that token still owns the active highlight — this is what consumer effect
// cleanups should pass to avoid stomping on a sibling's freshly-applied
// highlight. Pass nothing (or null/undefined) to force-clear, e.g. when
// speech is stopped globally.
export function clearTtsHighlight(owner?: TtsHighlightOwner | null): void {
  const reg = getHighlightsRegistry();
  if (!reg) return;
  if (owner != null && owner !== currentOwner) {
    return;
  }
  try {
    reg.delete(HIGHLIGHT_NAME);
  } catch {
    // ignore
  }
  currentOwner = null;
}

// Strip markdown formatting so the resulting text approximates what ends up
// as visible text in the rendered DOM. This is intentionally conservative:
// when a transformation is ambiguous we leave content alone, since false
// negatives (no highlight) are preferable to false positives that highlight
// the wrong stretch of text.
export function stripMarkdownForMatching(input: string): string {
  if (!input) return "";
  let out = input;

  // Fenced code blocks are rendered inside <pre><code>, but the source
  // markers and language tag aren't visible — drop the entire block from
  // the matching surface so we never try to anchor a highlight inside one.
  out = out.replace(/```[\s\S]*?```/g, " ");

  // Inline code: `foo` → foo (the visible text is the inner string).
  out = out.replace(/`([^`\n]+)`/g, "$1");

  // Markdown image: ![alt](url) → "" (rendered as <img>, no text).
  out = out.replace(/!\[[^\]]*\]\([^)]*\)/g, "");

  // Markdown link: [label](url "title") → label.
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, "$1");

  // Angle autolink: <https://x> → https://x.
  out = out.replace(/<((?:https?:\/\/|www\.|mailto:)[^>\s]+)>/gi, "$1");

  // Strip raw HTML tags. The replacement runs until stable so nested or
  // overlapping constructs like `<scr<script>ipt>` can't reform into a fresh
  // tag after a single pass. This output is only ever used as an argument to
  // `String.prototype.indexOf` against pre-rendered text nodes — it is never
  // injected into the DOM — but we keep the loop so the helper stays safe to
  // reuse in other contexts.
  const tagPattern = /<\/?[a-zA-Z][^>]*>/g;
  let prev: string;
  do {
    prev = out;
    out = out.replace(tagPattern, "");
  } while (out !== prev);

  // Bold / italic / strike emphasis. The CommonMark-ish guards around the
  // inner text (require non-whitespace at both ends) prevent us from
  // unwrapping stray asterisks like "a * b * c" or `snake_case` identifiers.
  out = out.replace(/(\*\*|__)(?=\S)([^*_\n]+?)(?<=\S)\1/g, "$2");
  out = out.replace(/(?<![A-Za-z0-9])(\*|_)(?=\S)([^*_\n]+?)(?<=\S)\1(?![A-Za-z0-9])/g, "$2");
  out = out.replace(/~~([^~\n]+?)~~/g, "$1");

  // Block-level markers at line starts: headings, list markers, blockquotes.
  out = out.replace(/^[ \t]*#{1,6}[ \t]+/gm, "");
  out = out.replace(/^[ \t]*[-*+][ \t]+/gm, "");
  out = out.replace(/^[ \t]*\d+[.)][ \t]+/gm, "");
  out = out.replace(/^[ \t]*>[ \t]?/gm, "");

  return out;
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

interface NodeMap {
  flat: string;
  // For each character in `flat`, the (text node, offset within node) it came
  // from. Length matches `flat.length`.
  positions: Array<{ node: Text; offset: number }>;
}

function isTextNodeVisible(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent) return false;
  if (parent.tagName === "SCRIPT" || parent.tagName === "STYLE") return false;
  return true;
}

function buildNodeMap(container: HTMLElement): NodeMap {
  const positions: NodeMap["positions"] = [];
  let flat = "";
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    if (isTextNodeVisible(textNode)) {
      const text = textNode.data;
      for (let i = 0; i < text.length; i++) {
        positions.push({ node: textNode, offset: i });
      }
      flat += text;
    }
    node = walker.nextNode();
  }
  return { flat, positions };
}

interface NormalizedFlat {
  text: string;
  // For each character in `text`, the index in the un-normalized `flat`.
  origIndex: number[];
}

function normalizeFlat(flat: string): NormalizedFlat {
  const text: string[] = [];
  const origIndex: number[] = [];
  let lastWasSpace = true; // suppresses leading whitespace
  for (let i = 0; i < flat.length; i++) {
    const ch = flat[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f" || ch === "\v") {
      if (lastWasSpace) continue;
      text.push(" ");
      origIndex.push(i);
      lastWasSpace = true;
    } else {
      text.push(ch);
      origIndex.push(i);
      lastWasSpace = false;
    }
  }
  // Trim trailing space.
  while (text.length && text[text.length - 1] === " ") {
    text.pop();
    origIndex.pop();
  }
  return { text: text.join(""), origIndex };
}

function buildRange(
  container: HTMLElement,
  highlightSource: string,
  prefixSource: string
): Range | null {
  const map = buildNodeMap(container);
  if (!map.flat) return null;

  const target = normalizeWhitespace(stripMarkdownForMatching(highlightSource));
  if (!target) return null;

  const norm = normalizeFlat(map.flat);
  if (!norm.text) return null;

  const hint = normalizeWhitespace(stripMarkdownForMatching(prefixSource));
  const searchStart = Math.min(hint.length, norm.text.length);

  let foundNorm = norm.text.indexOf(target, searchStart);
  if (foundNorm === -1) {
    // Fallback: try near-but-not-after-hint matches, then anywhere.
    foundNorm = norm.text.indexOf(target);
  }
  if (foundNorm === -1) return null;

  const lastNormIdx = foundNorm + target.length - 1;
  if (lastNormIdx >= norm.origIndex.length) return null;

  const startOrig = norm.origIndex[foundNorm];
  const endOrigInclusive = norm.origIndex[lastNormIdx];
  if (
    startOrig == null ||
    endOrigInclusive == null ||
    startOrig >= map.positions.length ||
    endOrigInclusive >= map.positions.length
  ) {
    return null;
  }

  const startPos = map.positions[startOrig];
  const endPos = map.positions[endOrigInclusive];

  try {
    const range = document.createRange();
    range.setStart(startPos.node, startPos.offset);
    range.setEnd(endPos.node, endPos.offset + 1);
    return range;
  } catch {
    return null;
  }
}

// Returns an opaque owner token on success so the caller can pass it back to
// `clearTtsHighlight` for a scoped clear. Returns null when the API is not
// supported, the container is missing, or the range cannot be built — in those
// cases the registry is also force-cleared so no stale highlight lingers.
export function applyTtsHighlight(
  container: HTMLElement | null,
  highlightSource: string,
  prefixSource: string
): TtsHighlightOwner | null {
  const reg = getHighlightsRegistry();
  const Highlight = getHighlightCtor();
  if (!reg || !Highlight) return null;

  if (!container) {
    clearTtsHighlight();
    return null;
  }

  const range = buildRange(container, highlightSource, prefixSource);
  if (!range) {
    clearTtsHighlight();
    return null;
  }

  try {
    const highlight = new Highlight(range);
    reg.set(HIGHLIGHT_NAME, highlight);
    const owner: TtsHighlightOwner = Symbol("ryos-chat-tts");
    currentOwner = owner;
    return owner;
  } catch {
    clearTtsHighlight();
    return null;
  }
}
