export type ChatMarkdownToken = {
  type: "text" | "bold" | "italic" | "link" | "citation";
  content: string;
  url?: string;
};

const TOKEN_CACHE_LIMIT = 500;
const inlineTokenCache = new Map<string, ChatMarkdownToken[]>();
const segmentedTokenCache = new Map<string, ChatMarkdownToken[]>();

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

function setCachedTokens(
  cache: Map<string, ChatMarkdownToken[]>,
  key: string,
  value: ChatMarkdownToken[]
): ChatMarkdownToken[] {
  cache.set(key, value);
  if (cache.size > TOKEN_CACHE_LIMIT) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) {
      cache.delete(oldestKey);
    }
  }
  return value;
}

function parseChatMarkdownInlineUncached(text: string): ChatMarkdownToken[] {
  const tokens: ChatMarkdownToken[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    const parenthesizedLinkMatch = remaining.match(
      PARENTHESIZED_MARKDOWN_LINK_RE
    );
    if (parenthesizedLinkMatch) {
      tokens.push({
        type: "citation",
        content: parenthesizedLinkMatch[1],
        url: parenthesizedLinkMatch[2],
      });
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

export function parseChatMarkdownInline(text: string): ChatMarkdownToken[] {
  const cached = inlineTokenCache.get(text);
  if (cached) {
    return cached;
  }

  return setCachedTokens(inlineTokenCache, text, parseChatMarkdownInlineUncached(text));
}

function segmentChatMarkdownTextUncached(text: string): ChatMarkdownToken[] {
  return text.split(/(\n)/).flatMap((segment) => {
    if (segment === "\n") {
      return [{ type: "text", content: "\n" }];
    }

    return parseChatMarkdownInline(segment);
  });
}

export function segmentChatMarkdownText(text: string): ChatMarkdownToken[] {
  const cached = segmentedTokenCache.get(text);
  if (cached) {
    return cached;
  }

  return setCachedTokens(segmentedTokenCache, text, segmentChatMarkdownTextUncached(text));
}

export function coalesceChatMarkdownTokens(
  tokens: ChatMarkdownToken[]
): ChatMarkdownToken[] {
  const merged: ChatMarkdownToken[] = [];

  for (const token of tokens) {
    const previous = merged.at(-1);
    const canMerge =
      previous &&
      previous.type === token.type &&
      previous.type !== "link" &&
      previous.type !== "citation";

    if (canMerge) {
      previous.content += token.content;
      continue;
    }

    merged.push({ ...token });
  }

  return merged;
}
