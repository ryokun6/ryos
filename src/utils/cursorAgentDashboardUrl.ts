const CURSOR_AGENT_DASHBOARD_HOSTS = new Set(["cursor.com", "www.cursor.com"]);

/**
 * True when `url` is a Cursor Cloud agent dashboard link (e.g.
 * https://cursor.com/agents/bc_…), matching shapes produced by
 * `cursorCloudAgentDashboardUrl` / `listCursorCloudAgentRuns`.
 */
export function isCursorAgentDashboardUrl(
  url: string | undefined | null
): boolean {
  if (!url?.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.toLowerCase();
    if (!CURSOR_AGENT_DASHBOARD_HOSTS.has(host)) return false;
    const segments = parsed.pathname.split("/").filter(Boolean);
    return segments.length >= 2 && segments[0] === "agents" && segments[1].length > 0;
  } catch {
    return false;
  }
}

/** Omit Cursor agent dashboard URLs from chat link-preview cards. */
export function filterUrlsForChatLinkPreviews(urls: Iterable<string>): string[] {
  return Array.from(urls).filter((u) => !isCursorAgentDashboardUrl(u));
}
