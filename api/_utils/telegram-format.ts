const TELEGRAM_MARKDOWN_CITATION_RE =
  /\s*\(\[[^\]]+?\]\((https?:\/\/[^\s]+?)\)\)/gu;
const TELEGRAM_MARKDOWN_LINK_RE =
  /\[([^\]]+?)\]\((https?:\/\/[^\s]+?)\)/gu;

export function simplifyTelegramCitationDisplay(text: string): string {
  return text
    .replace(TELEGRAM_MARKDOWN_CITATION_RE, "")
    .replace(TELEGRAM_MARKDOWN_LINK_RE, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
