export type ChatMarkdownToken = {
  type: "text" | "bold" | "italic" | "link";
  content: string;
  url?: string;
};

const PARENTHESIZED_MARKDOWN_LINK_RE =
  /^\(\[([^\]]+?)\]\((https?:\/\/[^\s]+?)\)\)/u;
const MARKDOWN_LINK_RE = /^\[([^\]]+?)\]\((https?:\/\/[^\s]+?)\)/u;
const BOLD_RE = /^\*\*(.+?)\*\*/u;
const ITALIC_RE = /^\*(.+?)\*/u;
const PLAIN_URL_RE = /^https?:\/\/[^\s]+/u;
const EMOJI_RE = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;
const CJK_RE =
  /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const WORD_RE = /^[a-zA-Z0-9]+/u;
const SPACE_RE = /^[^\S\n]+/u;
const PUNCTUATION_RE =
  /^[^a-zA-Z0-9\s\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}*]+/u;

function splitTrailingUrlPunctuation(rawUrl: string): {
  url: string;
  trailing: string;
} {
  let url = rawUrl;
  let trailing = "";

  while (url.length > 0) {
    const lastChar = url.at(-1);
    if (!lastChar) {
      break;
    }

    if (/[.,!?;:]/.test(lastChar)) {
      trailing = `${lastChar}${trailing}`;
      url = url.slice(0, -1);
      continue;
    }

    if (lastChar === ")") {
      const openCount = (url.match(/\(/g) || []).length;
      const closeCount = (url.match(/\)/g) || []).length;
      if (closeCount > openCount) {
        trailing = `)${trailing}`;
        url = url.slice(0, -1);
        continue;
      }
    }

    break;
  }

  return { url, trailing };
}

export function parseChatMarkdownInline(text: string): ChatMarkdownToken[] {
  const tokens: ChatMarkdownToken[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    const parenthesizedLinkMatch = remaining.match(
      PARENTHESIZED_MARKDOWN_LINK_RE
    );
    if (parenthesizedLinkMatch) {
      tokens.push({ type: "text", content: "(" });
      tokens.push({
        type: "link",
        content: parenthesizedLinkMatch[1],
        url: parenthesizedLinkMatch[2],
      });
      tokens.push({ type: "text", content: ")" });
      remaining = remaining.slice(parenthesizedLinkMatch[0].length);
      continue;
    }

    const markdownLinkMatch = remaining.match(MARKDOWN_LINK_RE);
    if (markdownLinkMatch) {
      tokens.push({
        type: "link",
        content: markdownLinkMatch[1],
        url: markdownLinkMatch[2],
      });
      remaining = remaining.slice(markdownLinkMatch[0].length);
      continue;
    }

    const boldMatch = remaining.match(BOLD_RE);
    if (boldMatch) {
      tokens.push({ type: "bold", content: boldMatch[1] });
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    const italicMatch = remaining.match(ITALIC_RE);
    if (italicMatch) {
      tokens.push({ type: "italic", content: italicMatch[1] });
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    const plainUrlMatch = remaining.match(PLAIN_URL_RE);
    if (plainUrlMatch) {
      const { url, trailing } = splitTrailingUrlPunctuation(plainUrlMatch[0]);
      tokens.push({
        type: "link",
        content: url,
        url,
      });
      if (trailing) {
        tokens.push({ type: "text", content: trailing });
      }
      remaining = remaining.slice(plainUrlMatch[0].length);
      continue;
    }

    const matchers = [EMOJI_RE, CJK_RE, WORD_RE, SPACE_RE, PUNCTUATION_RE];
    const nextMatch = matchers
      .map((regex) => remaining.match(regex))
      .find((match): match is RegExpMatchArray => !!match);

    if (nextMatch) {
      tokens.push({ type: "text", content: nextMatch[0] });
      remaining = remaining.slice(nextMatch[0].length);
      continue;
    }

    tokens.push({ type: "text", content: remaining[0] });
    remaining = remaining.slice(1);
  }

  return tokens;
}

export function segmentChatMarkdownText(text: string): ChatMarkdownToken[] {
  return text.split(/(\n)/).flatMap((segment) => {
    if (segment === "\n") {
      return [{ type: "text", content: "\n" }];
    }

    return parseChatMarkdownInline(segment);
  });
}
