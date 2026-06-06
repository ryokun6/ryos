import type { ToolInvocationPart } from "@/components/shared/ToolInvocationMessage";
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

/** Matches Cursor Cloud agent dashboard URLs (https://cursor.com/agents/…). */
export function isCursorAgentDashboardUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return (
      parsed.hostname === "cursor.com" &&
      parsed.pathname.startsWith("/agents/") &&
      parsed.pathname.length > "/agents/".length
    );
  } catch {
    return /^https?:\/\/cursor\.com\/agents\/[^/?#\s]+/i.test(trimmed);
  }
}

/** True when the message renders {@link CursorRepoAgentChatCard} for cursorCloudAgent. */
export function messageHasCursorCloudAgentCard(
  parts: Array<ToolInvocationPart | { type: string }> | undefined
): boolean {
  if (!parts) return false;
  return parts.some((part) => {
    if (part.type !== "tool-cursorCloudAgent") return false;
    const toolPart = part as ToolInvocationPart;
    if (toolPart.state !== "output-available") return false;
    const output = toolPart.output;
    return (
      output &&
      typeof output === "object" &&
      "async" in output &&
      (output as { async?: boolean }).async === true &&
      typeof (output as { runId?: string }).runId === "string"
    );
  });
}

export function filterLinkPreviewUrls(
  urls: string[],
  options: { suppressCursorAgentDashboard: boolean }
): string[] {
  if (!options.suppressCursorAgentDashboard) return urls;
  return urls.filter((url) => !isCursorAgentDashboardUrl(url));
}
