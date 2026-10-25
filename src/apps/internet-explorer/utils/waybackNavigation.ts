/**
 * Wayback replay URLs vs the original page they capture.
 *
 * Internet Explorer loads archived pages through `/api/iframe-check`, which
 * strips upstream scripts (including archive.org's wombat rewriter) and
 * injects its own click interceptor. Without wombat, link hrefs stay in
 * replay form (`/web/<timestamp>/http://original`) and resolve against the
 * injected `<base href="https://web.archive.org/web/...">`. The interceptor
 * used to post that replay URL, so IE treated web.archive.org as the next
 * page. These helpers turn a click back into the original http(s) URL so the
 * parent can load it through the same year/month proxy flow.
 *
 * The string below is the implementation: it is evaluated here for the parent
 * process and spliced verbatim into the injected interceptor so the two
 * cannot drift.
 */

export const WAYBACK_REPLAY_URL_RE =
  /^https?:\/\/(?:www\.)?(?:web\.)?archive\.org\/web\/(?:\d{1,14}|\*)(?:[a-z]{2}_)*\/(https?:\/\/.+)$/i;

export const ARCHIVED_NAVIGATION_RESOLVER_SOURCE = `
var WAYBACK_REPLAY_URL_RE = ${WAYBACK_REPLAY_URL_RE.toString()};
function unwrapWaybackReplayUrl(absoluteUrl) {
  var current = absoluteUrl;
  var i;
  for (i = 0; i < 3; i++) {
    if (!current || typeof current !== 'string') return current;
    var match = WAYBACK_REPLAY_URL_RE.exec(current);
    if (!match) return current;
    current = match[1];
  }
  return current;
}
function resolveArchivedNavigationUrl(rawHref, baseHref) {
  var originalBase = unwrapWaybackReplayUrl(baseHref);
  var onWaybackBase = originalBase !== baseHref;
  var schemeAbsolute = /^[a-z][a-z0-9+.-]*:/i.test(rawHref) ||
    (rawHref.length >= 2 && rawHref.charAt(0) === '/' && rawHref.charAt(1) === '/');
  var rootRelative = rawHref.charAt(0) === '/' &&
    !(rawHref.length >= 2 && rawHref.charAt(1) === '/');
  // Relative hrefs (about.html, ../mac/, #section) must resolve against the
  // archived page. The URL parser treats the "http://host" inside a replay
  // URL as path segments, so ".." walks off the archived host.
  if (onWaybackBase && !schemeAbsolute && !rootRelative) {
    return new URL(rawHref, originalBase).href;
  }
  var absoluteUrl = new URL(rawHref, baseHref).href;
  var unwrapped = unwrapWaybackReplayUrl(absoluteUrl);
  if (unwrapped !== absoluteUrl) return unwrapped;
  // Root-relative "/about" against a replay base becomes
  // https://web.archive.org/about. Put it back on the archived host.
  if (onWaybackBase && rootRelative) {
    var host = '';
    try { host = new URL(absoluteUrl).hostname; } catch (e) { return absoluteUrl; }
    if (/(^|\\.)archive\\.org$/i.test(host)) {
      return new URL(rawHref, originalBase).href;
    }
  }
  return absoluteUrl;
}
`;

type WaybackNavigationResolver = {
  unwrapWaybackReplayUrl: (url: string) => string;
  resolveArchivedNavigationUrl: (rawHref: string, baseHref: string) => string;
};

const resolver = new Function(
  `${ARCHIVED_NAVIGATION_RESOLVER_SOURCE}
  return {
    unwrapWaybackReplayUrl: unwrapWaybackReplayUrl,
    resolveArchivedNavigationUrl: resolveArchivedNavigationUrl
  };`
)() as WaybackNavigationResolver;

/** Peel nested Wayback replay wrappers down to the captured http(s) URL. */
export const unwrapWaybackReplayUrl = resolver.unwrapWaybackReplayUrl;

/**
 * Resolve a link from a proxied Wayback document to the URL Internet Explorer
 * should navigate to. Non-replay URLs are returned unchanged.
 */
export const resolveArchivedNavigationUrl = resolver.resolveArchivedNavigationUrl;
