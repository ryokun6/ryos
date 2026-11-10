/**
 * Linear (O(n)) HTML scanners for untrusted markup.
 *
 * Avoid lazy / negated-class regexes like `[\s\S]*?` and `[^>]*` over large
 * attacker-controlled bodies — those are O(n²) when openers never close.
 */

/** Case-insensitive `indexOf` over a UTF-16 string. */
export function indexOfCi(
  haystack: string,
  needle: string,
  fromIndex = 0
): number {
  if (!needle) return Math.max(0, fromIndex);
  const start = Math.max(0, fromIndex);
  if (start >= haystack.length) return -1;
  return haystack.toLowerCase().indexOf(needle.toLowerCase(), start);
}

function isNameBoundary(ch: string | undefined): boolean {
  if (ch == null || ch === "") return true;
  return !/[a-zA-Z0-9:-]/.test(ch);
}

/**
 * Find the next opening tag named `tagName` at or after `fromIndex`.
 * Returns the full tag slice `[start, endExclusive)` including `<` / `>`,
 * or null when no complete open tag remains.
 */
export function findOpenTag(
  html: string,
  tagName: string,
  fromIndex = 0
): { start: number; end: number; tag: string } | null {
  const needle = `<${tagName}`;
  let pos = Math.max(0, fromIndex);
  while (pos < html.length) {
    const start = indexOfCi(html, needle, pos);
    if (start < 0) return null;
    const afterName = start + needle.length;
    if (!isNameBoundary(html[afterName])) {
      pos = afterName;
      continue;
    }
    const end = html.indexOf(">", afterName);
    if (end < 0) return null;
    // Skip closing tags that share the same prefix (`</title`).
    if (html[start + 1] === "/") {
      pos = end + 1;
      continue;
    }
    return { start, end: end + 1, tag: html.slice(start, end + 1) };
  }
  return null;
}

/**
 * Find a closing tag `</tagName...>` at or after `fromIndex`.
 */
export function findCloseTag(
  html: string,
  tagName: string,
  fromIndex = 0
): { start: number; end: number } | null {
  const needle = `</${tagName}`;
  let pos = Math.max(0, fromIndex);
  while (pos < html.length) {
    const start = indexOfCi(html, needle, pos);
    if (start < 0) return null;
    const afterName = start + needle.length;
    if (!isNameBoundary(html[afterName])) {
      pos = afterName;
      continue;
    }
    const end = html.indexOf(">", afterName);
    if (end < 0) return null;
    return { start, end: end + 1 };
  }
  return null;
}

/**
 * One left-to-right pass that removes non-overlapping enclosed blocks
 * (`<script…>…</script>`, comments, etc.). Incomplete openers are left as-is
 * so a later pass / caller can decide; we never rescan from every opener.
 */
export function stripEnclosedBlocksOnce(
  html: string,
  openMarker: string,
  closeMarker: string,
  options: { requireNameBoundary?: boolean } = {}
): string {
  const requireBoundary = options.requireNameBoundary === true;
  let pos = 0;
  let out = "";
  while (pos < html.length) {
    const start = indexOfCi(html, openMarker, pos);
    if (start < 0) {
      out += html.slice(pos);
      break;
    }
    if (requireBoundary) {
      const after = start + openMarker.length;
      if (!isNameBoundary(html[after])) {
        out += html.slice(pos, after);
        pos = after;
        continue;
      }
    }
    const closeAt = indexOfCi(
      html,
      closeMarker,
      start + openMarker.length
    );
    if (closeAt < 0) {
      // Unclosed — keep the remainder verbatim and stop (linear).
      out += html.slice(pos);
      break;
    }
    // For tag closers like `</script`, consume through the following `>`.
    let closeEnd = closeAt + closeMarker.length;
    if (closeMarker.startsWith("</")) {
      const gt = html.indexOf(">", closeEnd);
      if (gt < 0) {
        out += html.slice(pos);
        break;
      }
      closeEnd = gt + 1;
    }
    out += html.slice(pos, start);
    pos = closeEnd;
  }
  return out;
}

/**
 * Repeatedly strip enclosed blocks until stable (handles nested-tag
 * obfuscation like `<scr<script></script>ipt>`).
 */
export function stripEnclosedBlocks(
  html: string,
  openMarker: string,
  closeMarker: string,
  options: { requireNameBoundary?: boolean; maxPasses?: number } = {}
): string {
  const maxPasses = options.maxPasses ?? 10;
  let result = html;
  for (let i = 0; i < maxPasses; i++) {
    const next = stripEnclosedBlocksOnce(result, openMarker, closeMarker, options);
    if (next === result) break;
    result = next;
  }
  return result;
}

/** Strip HTML comments with a linear scan. */
export function stripHtmlComments(html: string): string {
  return stripEnclosedBlocksOnce(html, "<!--", "-->");
}

/**
 * Remove every well-formed tag (`<…>`) in linear time. Unclosed `<` tails are
 * kept so we do not walk them repeatedly.
 */
export function stripTagsLinear(value: string): string {
  let pos = 0;
  let out = "";
  while (pos < value.length) {
    const lt = value.indexOf("<", pos);
    if (lt < 0) {
      out += value.slice(pos);
      break;
    }
    out += value.slice(pos, lt);
    const gt = value.indexOf(">", lt + 1);
    if (gt < 0) {
      out += value.slice(lt);
      break;
    }
    pos = gt + 1;
  }
  return out;
}

/**
 * Read a quoted/unquoted attribute from a single tag string (already bounded).
 */
export function readTagAttr(
  tag: string,
  name: string
): string | undefined {
  const lower = tag.toLowerCase();
  const attr = name.toLowerCase();
  let search = 0;
  while (search < lower.length) {
    const idx = lower.indexOf(attr, search);
    if (idx < 0) return undefined;
    const before = lower[idx - 1];
    if (before && /[a-z0-9:_-]/.test(before)) {
      search = idx + attr.length;
      continue;
    }
    let cursor = idx + attr.length;
    while (cursor < tag.length && /\s/.test(tag[cursor]!)) cursor++;
    if (tag[cursor] !== "=") {
      search = idx + attr.length;
      continue;
    }
    cursor++;
    while (cursor < tag.length && /\s/.test(tag[cursor]!)) cursor++;
    const quote = tag[cursor];
    if (quote === '"' || quote === "'") {
      const end = tag.indexOf(quote, cursor + 1);
      if (end < 0) return undefined;
      return tag.slice(cursor + 1, end);
    }
    let end = cursor;
    while (end < tag.length && !/[\s>]/.test(tag[end]!)) end++;
    return tag.slice(cursor, end) || undefined;
  }
  return undefined;
}

/** Extract `<title>…</title>` text with a linear scan. */
export function extractTitleText(
  html: string,
  maxScan = html.length
): string | undefined {
  const window = maxScan < html.length ? html.slice(0, maxScan) : html;
  const open = findOpenTag(window, "title", 0);
  if (!open) return undefined;
  const close = findCloseTag(window, "title", open.end);
  if (!close) return undefined;
  return window.slice(open.end, close.start);
}

export interface MetaExtraction {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

/**
 * Pull common OG / Twitter / description metadata from a bounded HTML prefix
 * using linear tag scans. Attribute parsing runs only on each short tag.
 */
export function extractLinkMetadataLinear(
  html: string,
  maxScan = 256_000
): MetaExtraction {
  const window = maxScan < html.length ? html.slice(0, maxScan) : html;
  const result: MetaExtraction = {};

  const titleInner = extractTitleText(window);
  if (titleInner) {
    result.title = titleInner.replace(/\s+/g, " ").trim();
  }

  let pos = 0;
  let guard = 0;
  while (guard++ < 2_000) {
    const open = findOpenTag(window, "meta", pos);
    if (!open) break;
    pos = open.end;
    const tag = open.tag;
    const property = (readTagAttr(tag, "property") || "").toLowerCase();
    const name = (readTagAttr(tag, "name") || "").toLowerCase();
    const content = readTagAttr(tag, "content");
    if (!content) continue;

    if (property === "og:title" || name === "twitter:title") {
      if (property === "og:title" || !result.title) result.title = content.trim();
    } else if (
      property === "og:description" ||
      name === "twitter:description" ||
      name === "description"
    ) {
      if (property === "og:description" || !result.description) {
        result.description = content.trim();
      }
    } else if (
      property === "og:image" ||
      property === "og:image:url" ||
      name === "twitter:image"
    ) {
      if (property.startsWith("og:image") || !result.image) {
        result.image = content.trim();
      }
    } else if (property === "og:site_name") {
      result.siteName = content.trim();
    }
  }

  return result;
}

/**
 * Collect complete tags named `tagName` from a bounded window.
 */
export function collectTagsLinear(
  html: string,
  tagName: string,
  maxScan = html.length,
  maxTags = 500
): string[] {
  const window = maxScan < html.length ? html.slice(0, maxScan) : html;
  const tags: string[] = [];
  let pos = 0;
  while (tags.length < maxTags) {
    const open = findOpenTag(window, tagName, pos);
    if (!open) break;
    tags.push(open.tag);
    pos = open.end;
  }
  return tags;
}
