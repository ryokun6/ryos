/**
 * Optional "live browser" mode for the Internet Explorer app — the long-tail
 * escape hatch for sites that need a fully interactive, JS-executing, logged-in
 * session (video, heavy SPAs, anti-bot walls). Entirely feature-flagged.
 *
 * ryOS does not run the interactive browser itself; instead it embeds a live
 * view served by a Browser-as-a-Service / remote-browser provider (e.g.
 * browserless `/live`, Hyperbeam, Browserbase, a self-hosted neko, etc.). This
 * keeps the heavy infra out of the serverless API.
 *
 * Configure with:
 *   - `IE_LIVE_BROWSER=1`              — enable the capability.
 *   - `IE_LIVE_VIEW_URL_TEMPLATE=...`  — embeddable live-view URL with a
 *      `{url}` (URL-encoded) and/or `{rawUrl}` placeholder for the target.
 *
 * When unset, `mode=live` returns 501 and the client capability flag is false,
 * so nothing changes for the default deployment.
 */

export function isIeLiveBrowserConfigured(): boolean {
  const enabled = process.env.IE_LIVE_BROWSER?.trim().toLowerCase();
  const flagOn = enabled === "1" || enabled === "true";
  return flagOn && Boolean(process.env.IE_LIVE_VIEW_URL_TEMPLATE?.trim());
}

/**
 * Build the embeddable live-view URL for a target, or `null` if not
 * configured. The target is expected to already be validated/normalized by the
 * caller.
 */
export function buildLiveViewUrl(targetUrl: string): string | null {
  if (!isIeLiveBrowserConfigured()) return null;
  const template = process.env.IE_LIVE_VIEW_URL_TEMPLATE!.trim();
  return template
    .replace(/\{url\}/g, encodeURIComponent(targetUrl))
    .replace(/\{rawUrl\}/g, targetUrl);
}
