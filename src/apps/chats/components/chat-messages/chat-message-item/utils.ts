import { segmentChatMarkdownText } from "@/lib/chatMarkdown";

export function isTouchDevice(): boolean {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

export function extractUrlsFromContent(content: string): string[] {
  const urls = new Set<string>();
  segmentChatMarkdownText(content).forEach((token) => {
    if (token.type === "link" && token.url) urls.add(token.url);
  });
  return Array.from(urls);
}
