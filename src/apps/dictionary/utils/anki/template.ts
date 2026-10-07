/**
 * Anki card template renderer (the subset of Anki's mustache dialect that
 * shows up in real decks): field replacements, `{{FrontSide}}`, `#`/`^`
 * conditional sections, and the common filters — text, cloze, type, hint,
 * furigana/kana/kanji, tts, edit.
 */

export interface AnkiRenderContext {
  fields: Record<string, string>;
  /** 0-based card ordinal; cloze number is `ord + 1`. */
  ord: number;
  tags?: string[];
  deckName?: string;
  notetypeName?: string;
  cardName?: string;
}

type Node =
  | { kind: "text"; text: string }
  | { kind: "field"; name: string; filters: string[] }
  | { kind: "section"; name: string; inverted: boolean; children: Node[] };

const TAG_RE = /\{\{([\s\S]*?)\}\}/g;

function parseTemplate(template: string): Node[] {
  const root: Node[] = [];
  const stack: { name: string; children: Node[] }[] = [{ name: "", children: root }];
  let last = 0;
  for (const match of template.matchAll(TAG_RE)) {
    const index = match.index ?? 0;
    const top = stack[stack.length - 1];
    if (index > last) top.children.push({ kind: "text", text: template.slice(last, index) });
    last = index + match[0].length;
    const tag = match[1].trim();
    if (tag.startsWith("#") || tag.startsWith("^")) {
      const node: Node = {
        kind: "section",
        name: tag.slice(1).trim(),
        inverted: tag.startsWith("^"),
        children: [],
      };
      top.children.push(node);
      stack.push({ name: node.name, children: node.children });
    } else if (tag.startsWith("/")) {
      const name = tag.slice(1).trim();
      // Tolerate mismatched closers by unwinding to the matching opener.
      const at = stack.map((entry) => entry.name).lastIndexOf(name);
      if (at > 0) stack.length = at;
    } else if (tag.startsWith("!")) {
      // Comment.
    } else {
      const parts = tag.split(":");
      const name = parts.pop()!.trim();
      top.children.push({ kind: "field", name, filters: parts.map((p) => p.trim()) });
    }
  }
  if (last < template.length) {
    stack[stack.length - 1].children.push({ kind: "text", text: template.slice(last) });
  }
  return root;
}

export function stripAnkiHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(div|p|li|tr|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\[sound:[^\]]*\]/g, "")
  )
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
};

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

const CLOZE_RE = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;

export function renderCloze(text: string, clozeNumber: number, side: "question" | "answer"): string {
  return text.replace(CLOZE_RE, (_, n: string, content: string, hint?: string) => {
    if (Number(n) !== clozeNumber) return content;
    if (side === "answer") return `<span class="cloze">${content}</span>`;
    return `<span class="cloze">[${hint ? hint : "..."}]</span>`;
  });
}

/** Cloze numbers used in a field ("{{c1::…}} {{c3::…}}" → [1, 3]). */
export function clozeNumbers(text: string): number[] {
  const numbers = new Set<number>();
  for (const match of text.matchAll(CLOZE_RE)) numbers.add(Number(match[1]));
  return Array.from(numbers).sort((a, b) => a - b);
}

const FURIGANA_RE = / ?([^ >[\]]+?)\[([^\]]*)\]/g;

function applyFurigana(text: string, mode: "furigana" | "kana" | "kanji"): string {
  return text.replace(FURIGANA_RE, (_, base: string, reading: string) => {
    if (mode === "kana") return reading;
    if (mode === "kanji") return base;
    return `<ruby><rb>${base}</rb><rt>${reading}</rt></ruby>`;
  });
}

function applyFilter(
  value: string,
  filter: string,
  name: string,
  ctx: AnkiRenderContext,
  side: "question" | "answer"
): string {
  const lower = filter.toLowerCase();
  if (lower === "text") return stripAnkiHtml(value);
  if (lower === "cloze" || lower === "cloze-only") return renderCloze(value, ctx.ord + 1, side);
  if (lower === "type" || lower.startsWith("type")) return side === "answer" ? value : "";
  if (lower === "hint") {
    return value
      ? `<details class="hint"><summary>${name}</summary>${value}</details>`
      : "";
  }
  if (lower === "furigana" || lower === "kana" || lower === "kanji") {
    return applyFurigana(value, lower);
  }
  if (lower.startsWith("tts")) return stripAnkiHtml(value);
  return value;
}

function specialField(name: string, ctx: AnkiRenderContext): string | undefined {
  switch (name) {
    case "Tags":
      return (ctx.tags ?? []).join(" ");
    case "Deck":
      return ctx.deckName ?? "";
    case "Subdeck":
      return ctx.deckName?.split("::").pop() ?? "";
    case "Type":
      return ctx.notetypeName ?? "";
    case "Card":
      return ctx.cardName ?? "";
    case "CardFlag":
      return "";
    default:
      return undefined;
  }
}

function hasField(ctx: AnkiRenderContext, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(ctx.fields, name);
}

function isFieldNonEmpty(value: string | undefined): boolean {
  if (!value) return false;
  return stripAnkiHtml(value).length > 0 || /<img\b|\[sound:/i.test(value);
}

function renderNodes(
  nodes: Node[],
  ctx: AnkiRenderContext,
  side: "question" | "answer",
  frontSide: string
): string {
  let out = "";
  for (const node of nodes) {
    if (node.kind === "text") out += node.text;
    else if (node.kind === "section") {
      const nonEmpty =
        hasField(ctx, node.name)
          ? isFieldNonEmpty(ctx.fields[node.name])
          : !!specialField(node.name, ctx);
      if (nonEmpty !== node.inverted) out += renderNodes(node.children, ctx, side, frontSide);
    } else if (node.name === "FrontSide") {
      out += side === "answer" ? frontSide : "";
    } else {
      let value = hasField(ctx, node.name)
        ? ctx.fields[node.name]
        : specialField(node.name, ctx) ?? "";
      for (const filter of [...node.filters].reverse()) {
        value = applyFilter(value, filter, node.name, ctx, side);
      }
      out += value;
    }
  }
  return out;
}

export function renderAnkiTemplate(
  template: string,
  ctx: AnkiRenderContext,
  side: "question" | "answer",
  frontSide = ""
): string {
  return renderNodes(parseTemplate(template), ctx, side, frontSide);
}

/** Render both faces of a card the way Anki does. */
export function renderAnkiCard(
  qfmt: string,
  afmt: string,
  ctx: AnkiRenderContext
): { question: string; answer: string } {
  const question = renderAnkiTemplate(qfmt, ctx, "question");
  const answer = renderAnkiTemplate(afmt, ctx, "answer", question);
  return { question, answer };
}

const SOUND_RE = /\[sound:([^\]]+)\]/g;

export function extractSoundRefs(html: string): string[] {
  return Array.from(html.matchAll(SOUND_RE), (match) => match[1].trim());
}

const IMG_SRC_RE = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

/** Local media filenames referenced by `[sound:]` tags and `<img src>`. */
export function extractMediaRefs(html: string): string[] {
  const refs = new Set(extractSoundRefs(html));
  for (const match of html.matchAll(IMG_SRC_RE)) {
    const src = decodeHtmlEntities(match[1] ?? match[2] ?? match[3] ?? "").trim();
    if (src && !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src)) refs.add(src);
  }
  return Array.from(refs);
}

/** Answer side minus the repeated question (`<hr id=answer>` convention). */
export function answerOnlyHtml(answer: string): string {
  const match = /<hr[^>]*\bid\s*=\s*["']?answer["']?[^>]*>/i.exec(answer);
  return match ? answer.slice(match.index + match[0].length) : answer;
}
