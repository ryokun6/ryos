const TELEGRAM_MARKDOWN_CITATION_RE =
  /\s*\(\[[^\]]+?\]\((https?:\/\/[^\s)]+)\)\)/gu;
const TELEGRAM_MARKDOWN_LINK_RE =
  /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/gu;
const TELEGRAM_MARKDOWN_IMAGE_RE =
  /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/gu;
/** Angle-bracket autolinks (CommonMark); keep URL as plain text */
const TELEGRAM_ANGLE_LINK_RE = /<(https?:\/\/[^\s>]+)>/gu;
const TELEGRAM_FENCED_CODE_RE =
  /```(?:[^\n`]*)\n?([\s\S]*?)```/gu;
const TELEGRAM_INLINE_CODE_RE = /`([^`]+)`/gu;
const TELEGRAM_STRIKETHROUGH_RE = /~~([^~]+)~~/gu;
const TELEGRAM_BOLD_STAR_RE = /\*\*([^*\n]+)\*\*/gu;
const TELEGRAM_BOLD_UNDERSCORE_RE = /__([^_\n]+)__/gu;
const TELEGRAM_ITALIC_STAR_RE =
  /(^|[\s([{'"])\*([^*\n]+)\*(?=[\s).,!?;:}\]'"]|$)/gmu;
const TELEGRAM_ITALIC_UNDERSCORE_RE =
  /(^|[\s([{'"])_([^_\n]+)_(?=[\s).,!?;:}\]'"]|$)/gmu;
const TELEGRAM_HR_RE = /^\s*(?:[-*_]\s*){3,}\s*$/gmu;
/** Decorative bullets / emphasis markers used for pseudo-lists */
const TELEGRAM_UNICODE_BULLET_LINE_RE = /^\s*[•·▪▸►‣⁃]\s*/u;
/** Minimal HTML tags models sometimes emit */
const TELEGRAM_SIMPLE_HTML_TAG_RE = /<\/?(?:br|p|div|span|b|i|strong|em)\b[^>]*>/gi;

function stripRepeatedBoldUnderscore(text: string): string {
  let prev = "";
  let cur = text;
  while (cur !== prev) {
    prev = cur;
    cur = cur
      .replace(TELEGRAM_BOLD_STAR_RE, "$1")
      .replace(TELEGRAM_BOLD_UNDERSCORE_RE, "$1");
  }
  return cur;
}

function markdownLinkReplacement(label: string, url: string): string {
  const cleanLabel = label.trim();
  const cleanUrl = url.trim();
  if (!cleanUrl) {
    return cleanLabel;
  }
  if (!cleanLabel || cleanLabel === cleanUrl) {
    return cleanUrl;
  }
  return `${cleanLabel} ${cleanUrl}`;
}

function markdownImageReplacement(alt: string, url: string): string {
  const a = alt.trim();
  const u = url.trim();
  if (a && u) {
    return `${a} ${u}`;
  }
  return u || a;
}

function stripTelegramInlineMarkdown(text: string): string {
  let out = text
    .replace(TELEGRAM_SIMPLE_HTML_TAG_RE, "")
    .replace(TELEGRAM_ANGLE_LINK_RE, "$1")
    .replace(TELEGRAM_MARKDOWN_CITATION_RE, "")
    .replace(TELEGRAM_MARKDOWN_IMAGE_RE, (_m, alt: string, url: string) =>
      markdownImageReplacement(alt, url)
    )
    .replace(TELEGRAM_MARKDOWN_LINK_RE, (_m, lab: string, url: string) =>
      markdownLinkReplacement(lab, url)
    )
    .replace(TELEGRAM_FENCED_CODE_RE, (_match, code: string) => code.trim())
    .replace(TELEGRAM_INLINE_CODE_RE, "$1")
    .replace(TELEGRAM_STRIKETHROUGH_RE, "$1");

  out = stripRepeatedBoldUnderscore(out);

  let italicPass = out;
  let prevItalic = "";
  while (italicPass !== prevItalic) {
    prevItalic = italicPass;
    italicPass = italicPass
      .replace(TELEGRAM_ITALIC_STAR_RE, "$1$2")
      .replace(TELEGRAM_ITALIC_UNDERSCORE_RE, "$1$2");
  }
  out = italicPass;

  return out.replace(TELEGRAM_HR_RE, "");
}

function normalizeTelegramMarkdownLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) {
    return "";
  }

  const taskMatch = trimmed.match(/^[-*+]\s+\[([ xX])\]\s+(.+)$/u);
  if (taskMatch) {
    return taskMatch[2].trim();
  }

  const bulletMatch = trimmed.match(/^[-*+]\s+(.+)$/u);
  if (bulletMatch) {
    return bulletMatch[1].trim();
  }

  const orderedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/u);
  if (orderedMatch) {
    return `${orderedMatch[1]}) ${orderedMatch[2].trim()}`;
  }

  const deBullet = trimmed.replace(TELEGRAM_UNICODE_BULLET_LINE_RE, "");

  return deBullet
    .replace(/^#{1,6}\s+/u, "")
    .replace(/^>\s?/u, "")
    .trim();
}

/**
 * Converts model/markdown-heavy text into plain text suitable for Telegram
 * (no markdown emphasis, fenced blocks, or link syntax). URLs from markdown
 * links are kept as trailing plain URLs.
 */
export function simplifyTelegramCitationDisplay(text: string): string {
  return stripTelegramInlineMarkdown(text)
    .split("\n")
    .map(normalizeTelegramMarkdownLine)
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\\([\\`*_#[\]()>])/g, "$1")
    .trim();
}

/**
 * Sanitize Cursor Cloud Agent completion bodies for Telegram DM delivery.
 * Applies {@link simplifyTelegramCitationDisplay} to free-form summary/error text
 * while keeping fixed headline lines unchanged for scanability.
 */
export function stripMarkdownForTelegramCursorAgentCompletion(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return "";
  }

  const parts = normalized.split("\n\n");
  if (parts.length <= 1) {
    return simplifyTelegramCitationDisplay(normalized);
  }

  const headline = parts[0].trim();
  const body = parts.slice(1).join("\n\n").trim();
  if (!body) {
    return headline;
  }

  return `${headline}\n\n${simplifyTelegramCitationDisplay(body)}`.trim();
}
