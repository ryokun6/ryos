const TELEGRAM_MARKDOWN_CITATION_RE =
  /\s*\(\[[^\]]+?\]\((https?:\/\/[^\s]+?)\)\)/gu;
const TELEGRAM_MARKDOWN_LINK_RE =
  /\[([^\]]+?)\]\((https?:\/\/[^\s]+?)\)/gu;
const TELEGRAM_MARKDOWN_IMAGE_RE =
  /!\[([^\]]*)\]\((https?:\/\/[^\s]+?)\)/gu;
const TELEGRAM_FENCED_CODE_RE =
  /```(?:[^\n`]*)\n?([\s\S]*?)```/gu;
const TELEGRAM_INLINE_CODE_RE = /`([^`]+)`/gu;
const TELEGRAM_STRIKETHROUGH_RE = /~~([^~]+)~~/gu;
const TELEGRAM_BOLD_STAR_RE = /\*\*([^*\n]+)\*\*/gu;
const TELEGRAM_BOLD_UNDERSCORE_RE = /__([^_\n]+)__/gu;
const TELEGRAM_ITALIC_STAR_RE = /(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?;:]|$)/gmu;
const TELEGRAM_ITALIC_UNDERSCORE_RE = /(^|[\s(])_([^_\n]+)_(?=[\s).,!?;:]|$)/gmu;
const TELEGRAM_HR_RE = /^\s*(?:[-*_]\s*){3,}$/gmu;

function stripTelegramInlineMarkdown(text: string): string {
  return text
    .replace(TELEGRAM_MARKDOWN_CITATION_RE, "")
    .replace(TELEGRAM_MARKDOWN_IMAGE_RE, "$1")
    .replace(TELEGRAM_MARKDOWN_LINK_RE, "$1")
    .replace(TELEGRAM_FENCED_CODE_RE, (_match, code: string) => code.trim())
    .replace(TELEGRAM_INLINE_CODE_RE, "$1")
    .replace(TELEGRAM_STRIKETHROUGH_RE, "$1")
    .replace(TELEGRAM_BOLD_STAR_RE, "$1")
    .replace(TELEGRAM_BOLD_UNDERSCORE_RE, "$1")
    .replace(TELEGRAM_ITALIC_STAR_RE, "$1$2")
    .replace(TELEGRAM_ITALIC_UNDERSCORE_RE, "$1$2")
    .replace(TELEGRAM_HR_RE, "");
}

function normalizeTelegramMarkdownLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) {
    return "";
  }

  const taskMatch = trimmed.match(/^[-*+]\s+\[([ xX])\]\s+(.+)$/u);
  if (taskMatch) {
    const checked = taskMatch[1].toLowerCase() === "x" ? "x" : " ";
    return `• [${checked}] ${taskMatch[2]}`;
  }

  const bulletMatch = trimmed.match(/^[-*+]\s+(.+)$/u);
  if (bulletMatch) {
    return `• ${bulletMatch[1]}`;
  }

  const orderedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/u);
  if (orderedMatch) {
    return `${orderedMatch[1]}) ${orderedMatch[2]}`;
  }

  return trimmed
    .replace(/^#{1,6}\s+/u, "")
    .replace(/^>\s?/u, "");
}

export function simplifyTelegramCitationDisplay(text: string): string {
  return stripTelegramInlineMarkdown(text)
    .split("\n")
    .map(normalizeTelegramMarkdownLine)
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
