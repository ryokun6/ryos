/**
 * Wrap a UTF-16 character range inside markdown with a sanitized <mark> tag so
 * Streamdown can visually highlight text that is currently being read aloud.
 *
 * Escapes &, <, > inside the highlighted slice so markdown cannot break out into
 * raw HTML beyond the wrapper. Avoids injecting marks across fenced code spans.
 */
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

  const inner = markdown.slice(rs, re);
  if (inner.includes("```")) {
    return markdown;
  }

  const escaped = inner
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `${markdown.slice(0, rs)}<mark class="ryos-chat-tts-mark">${escaped}</mark>${markdown.slice(re)}`;
}
