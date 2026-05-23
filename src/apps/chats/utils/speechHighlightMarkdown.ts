/**
 * Wrap UTF-16 character ranges inside markdown with sanitized <mark> tags so
 * Streamdown can highlight text being read aloud without breaking list/quotes/etc.
 *
 * Escapes &, <, > inside each highlighted slice. Avoids fenced code spans.
 * Skips structural line prefixes (-, *, 1., >, #, task checkboxes) so <mark>
 * only wraps readable content.
 */

const MARK_OPEN = `<mark class="ryos-chat-tts-mark">`;
const MARK_CLOSE = `</mark>`;

/** Max leading spaces counted toward list/blockquote indentation (CommonMark-ish). */
const MAX_INDENT = 3;

/**
 * Relative index inside a single markdown line slice: skip blockquote prefixes,
 * then list/heading prefixes so returned offset points at textual content.
 */
export function skipMarkdownLineStructuralPrefix(
  lineSlice: string,
  relativeLineStart = 0,
): number {
  let i = relativeLineStart;

  while (true) {
    let j = i;
    while (j < lineSlice.length && j - i < MAX_INDENT && lineSlice[j] === " ")
      j++;
    if (
      j < lineSlice.length &&
      lineSlice[j] === ">" &&
      (!lineSlice[j + 1] ||
        lineSlice[j + 1] === " " ||
        lineSlice[j + 1] === "\t")
    ) {
      j++;
      if (j < lineSlice.length && (lineSlice[j] === " " || lineSlice[j] === "\t"))
        j++;
      i = j;
      continue;
    }
    break;
  }

  let j = i;
  while (j < lineSlice.length && j - i < MAX_INDENT && lineSlice[j] === " ")
    j++;
  i = j;

  if (lineSlice[i] === "#") {
    let hashes = 0;
    let k = i;
    while (k < lineSlice.length && lineSlice[k] === "#" && hashes < 6) {
      hashes++;
      k++;
    }
    if (
      hashes > 0 &&
      (k >= lineSlice.length ||
        lineSlice[k] === " " ||
        lineSlice[k] === "\t")
    ) {
      i = k;
      while (i < lineSlice.length && (lineSlice[i] === " " || lineSlice[i] === "\t"))
        i++;
      return i;
    }
    i = j;
  }

  const ch = lineSlice[i];
  if (
    (ch === "-" || ch === "*" || ch === "+") &&
    i + 1 < lineSlice.length &&
    (lineSlice[i + 1] === " " || lineSlice[i + 1] === "\t")
  ) {
    i += 2;
    if (
      lineSlice[i] === "[" &&
      i + 2 < lineSlice.length &&
      (lineSlice[i + 1] === " " ||
        lineSlice[i + 1] === "x" ||
        lineSlice[i + 1] === "X") &&
      lineSlice[i + 2] === "]"
    ) {
      i += 3;
      while (i < lineSlice.length && (lineSlice[i] === " " || lineSlice[i] === "\t"))
        i++;
    }
    return i;
  }

  if (i < lineSlice.length && lineSlice[i] >= "0" && lineSlice[i] <= "9") {
    let k = i;
    while (k < lineSlice.length && lineSlice[k] >= "0" && lineSlice[k] <= "9")
      k++;
    if (
      k > i &&
      k < lineSlice.length &&
      lineSlice[k] === "." &&
      k + 1 < lineSlice.length &&
      (lineSlice[k + 1] === " " || lineSlice[k + 1] === "\t")
    ) {
      i = k + 2;
      while (i < lineSlice.length && (lineSlice[i] === " " || lineSlice[i] === "\t"))
        i++;
      return i;
    }
  }

  return j;
}

function collectContentSegments(
  markdown: string,
  rangeStart: number,
  rangeEndExclusive: number,
): Array<{ start: number; endExclusive: number }> {
  const len = markdown.length;
  const re = Math.max(0, Math.min(rangeEndExclusive, len));
  const rs = Math.max(0, Math.min(rangeStart, len));
  if (re <= rs) return [];

  const segments: Array<{ start: number; endExclusive: number }> = [];
  let pos = rs;
  while (pos < re) {
    const lineStart = markdown.lastIndexOf("\n", pos - 1) + 1;
    let lineEndExclusive = markdown.indexOf("\n", lineStart);
    if (lineEndExclusive === -1) lineEndExclusive = len;

    const lineSlice = markdown.slice(lineStart, lineEndExclusive);
    const contentAbs = lineStart + skipMarkdownLineStructuralPrefix(lineSlice);

    const segStart = Math.max(pos, contentAbs);
    const segEnd = Math.min(re, lineEndExclusive);
    if (segStart < segEnd) {
      segments.push({ start: segStart, endExclusive: segEnd });
    }

    if (lineEndExclusive >= re) break;
    pos = lineEndExclusive + 1;
  }
  return segments;
}

function escapeForMark(inner: string): string {
  return inner
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function wrapMarkdownRangeWithSpeechMark(
  markdown: string,
  rangeStart: number,
  rangeEndExclusive: number,
): string {
  const len = markdown.length;
  const rs = Math.max(0, Math.min(rangeStart, len));
  const re = Math.max(rs, Math.min(rangeEndExclusive, len));
  if (re <= rs) {
    return markdown;
  }

  if (markdown.slice(rs, re).includes("```")) {
    return markdown;
  }

  const segments = collectContentSegments(markdown, rs, re);
  if (segments.length === 0) {
    return markdown;
  }

  let out = "";
  let prev = 0;
  for (const { start, endExclusive } of segments) {
    const slice = markdown.slice(start, endExclusive);
    if (slice.includes("```")) {
      return markdown;
    }
    out += markdown.slice(prev, start);
    out += `${MARK_OPEN}${escapeForMark(slice)}${MARK_CLOSE}`;
    prev = endExclusive;
  }
  out += markdown.slice(prev);
  return out;
}
