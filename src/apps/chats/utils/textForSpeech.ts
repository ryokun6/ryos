// Helpers that prepare assistant chat text for the TTS queue.
//
// Notes:
// - Markdown links of the form `[text](url)` collapse to just `text` so the
//   visible label is still spoken.
// - Bare http(s)/www/email/markdown-image URLs are dropped entirely – speaking
//   them out loud is noisy and uninformative.
// - Code blocks and HTML are stripped so they aren't read aloud.

const MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\([^)]*\)/g;
const MARKDOWN_LINK_RE = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const ANGLE_AUTOLINK_RE = /<((?:https?:\/\/|www\.|mailto:)[^>\s]+)>/gi;
const BARE_URL_RE = /\bhttps?:\/\/[^\s<>()]+/gi;
const BARE_WWW_RE = /\bwww\.[^\s<>()]+/gi;
const BARE_EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gi;

export function stripUrlsForSpeech(text: string): string {
  return text
    .replace(MARKDOWN_IMAGE_RE, "")
    .replace(MARKDOWN_LINK_RE, "$1")
    .replace(ANGLE_AUTOLINK_RE, "")
    .replace(BARE_URL_RE, "")
    .replace(BARE_WWW_RE, "")
    .replace(BARE_EMAIL_RE, "")
    .replace(/[ \t]{2,}/g, " ");
}

export function cleanTextForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<[^>]*>/g, "")
    .replace(/^!+\s*/, "")
    .replace(/^[\s.!?。，！？；：]+/, "")
    .replace(MARKDOWN_IMAGE_RE, "")
    .replace(MARKDOWN_LINK_RE, "$1")
    .replace(ANGLE_AUTOLINK_RE, "")
    .replace(BARE_URL_RE, "")
    .replace(BARE_WWW_RE, "")
    .replace(BARE_EMAIL_RE, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
