import { answerOnlyHtml, decodeHtmlEntities, extractSoundRefs } from "./template";

/** Pure helpers for showing imported card HTML inside the Dictionary. */

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** `[sound:x.mp3]` → inline play button the card view wires up. */
export function replaceSoundTags(html: string, label: string): string {
  return html.replace(/\[sound:([^\]]+)\]/g, (_, name: string) => {
    const filename = escapeAttribute(name.trim());
    return `<button type="button" class="ryos-sound" data-sound="${filename}" aria-label="${escapeAttribute(label)}" title="${escapeAttribute(label)}"></button>`;
  });
}

/**
 * Notetype CSS runs inside a shadow root, so it can't restyle the app; still
 * drop remote `@import`s and `url()`s so cards never fetch from the network.
 */
export function sanitizeCardCss(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, "")
    .replace(/url\(\s*(['"]?)\s*(?:https?:)?\/\/[^)]*\)/gi, "none")
    .replace(/expression\s*\(/gi, "(")
    .slice(0, 64_000);
}

/** Sounds to play for a card side: the answer side skips the repeated front. */
export function cardSideSounds(html: string, side: "front" | "back"): string[] {
  if (side === "front") return extractSoundRefs(html);
  const answerOnly = extractSoundRefs(answerOnlyHtml(html));
  return answerOnly.length ? answerOnly : extractSoundRefs(html);
}

export function isRelativeMediaSrc(src: string): boolean {
  const trimmed = decodeHtmlEntities(src).trim();
  return !!trimmed && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(trimmed);
}

export function soundSpeakKey(favoriteId: string, filename: string): string {
  return `${favoriteId}:sound:${filename}`;
}
