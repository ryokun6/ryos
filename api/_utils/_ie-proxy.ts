/**
 * Security policy for Internet Explorer proxy responses (`/api/iframe-check`).
 *
 * Proxied documents must never run with the ryOS app origin. Every proxy
 * response is served with a CSP `sandbox` (no `allow-same-origin`), so even a
 * top-level navigation to the proxy gets an opaque origin that the
 * `ryos_auth` cookie and same-origin APIs cannot be reached from.
 *
 * Two deployment shapes:
 * - Default: the proxy shares the app origin. Upstream scripts, inline event
 *   handlers and `javascript:` URLs are stripped from every HTML document, a
 *   nonce-only `script-src` blocks anything that slips through, and active
 *   upstream content types are never reflected.
 * - Isolated: `IE_PROXY_ORIGIN` names a separate host (for example
 *   `https://ieproxy.ryo.lu`) that points at the same server. Top-level proxy
 *   navigations are redirected there, upstream scripts are kept, and the
 *   host only serves the proxy route. That host never receives `ryos_auth`
 *   (the cookie is host-only).
 */

import type { ApiRequest } from "./api-types.js";
import { getHeader } from "./request-helpers.js";
import {
  buildFrameAncestorsDirective,
  getIeProxyFrameAncestors,
} from "./_security-headers.js";
import { getIeProxyIsolatedOrigin } from "./runtime-config.js";
import { ARCHIVED_NAVIGATION_RESOLVER_SOURCE } from "../../src/apps/internet-explorer/utils/waybackNavigation.js";

export { getIeProxyIsolatedOrigin };

/** Sandbox tokens for proxied documents; never includes `allow-same-origin`. */
export const IE_PROXY_SANDBOX_TOKENS =
  "allow-scripts allow-forms allow-popups allow-pointer-lock";

const FRAME_TOKEN_RE = /^[A-Za-z0-9_-]{16,64}\.\d{1,16}$/;

export function isIeProxyIsolatedHostHeader(
  hostHeader: string | null | undefined
): boolean {
  const isolated = getIeProxyIsolatedOrigin();
  if (!isolated || !hostHeader) return false;
  return new URL(isolated).host.toLowerCase() === hostHeader.trim().toLowerCase();
}

export function isIeProxyIsolatedRequest(req: ApiRequest): boolean {
  return isIeProxyIsolatedHostHeader(getHeader(req, "host"));
}

/** Paths the isolated proxy host is allowed to serve. */
export function isIeProxyIsolatedPathAllowed(pathname: string): boolean {
  return (
    pathname === "/api/iframe-check" ||
    pathname === "/health" ||
    pathname.startsWith("/fonts/")
  );
}

export function createCspNonce(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

/**
 * The parent passes `ieFrame=<instance token>.<navigation id>`; proxied
 * documents echo it in every postMessage so the parent can drop messages from
 * other frames and from stale navigations.
 */
export function sanitizeFrameToken(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  return FRAME_TOKEN_RE.test(raw) ? raw : null;
}

export function buildIeProxyCsp(options: { scriptNonce?: string | null } = {}): string {
  const directives = [
    `sandbox ${IE_PROXY_SANDBOX_TOKENS}`,
    buildFrameAncestorsDirective(getIeProxyFrameAncestors()),
    "object-src 'none'",
  ];
  if (options.scriptNonce) {
    directives.push(`script-src 'nonce-${options.scriptNonce}'`);
    directives.push("worker-src 'none'");
  }
  return directives.join("; ");
}

const PASSIVE_CONTENT_TYPE_RE =
  /^(image\/(png|jpe?g|pjpeg|gif|webp|avif|apng|bmp|x-icon|vnd\.microsoft\.icon)|audio\/[a-z0-9.+-]+|video\/[a-z0-9.+-]+|font\/[a-z0-9.+-]+|application\/(font-[a-z0-9.+-]+|x-font-[a-z0-9.+-]+|vnd\.ms-fontobject)|text\/css|text\/plain|text\/csv|application\/json|application\/[a-z0-9.+-]+\+json)$/;

const ACTIVE_TEXT_CONTENT_TYPE_RE =
  /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml|application\/[a-z0-9.+-]+\+xml|text\/xsl|application\/xslt\+xml|text\/javascript|application\/javascript|application\/x-javascript|application\/ecmascript|text\/ecmascript|text\/vtt|text\/cache-manifest|multipart\/x-mixed-replace)$/;

export interface ProxiedContentTypeDecision {
  contentType: string;
  /** Present when the body must be downloaded instead of rendered. */
  contentDisposition?: string;
  rewritten: boolean;
}

/**
 * Decide which Content-Type a raw / non-HTML proxied body may be served
 * with on the app origin. Passive types pass through; script-capable types
 * become text/plain; anything else is forced to a download.
 */
export function classifyProxiedContentType(
  upstreamContentType: string | null | undefined
): ProxiedContentTypeDecision {
  const raw = (upstreamContentType || "").trim();
  const essence = raw.split(";")[0]?.trim().toLowerCase() || "";
  if (essence && PASSIVE_CONTENT_TYPE_RE.test(essence)) {
    return { contentType: raw, rewritten: false };
  }
  if (!essence || ACTIVE_TEXT_CONTENT_TYPE_RE.test(essence) || essence.startsWith("text/")) {
    return { contentType: "text/plain; charset=utf-8", rewritten: true };
  }
  return {
    contentType: "application/octet-stream",
    contentDisposition: "attachment",
    rewritten: true,
  };
}

/** JSON for embedding inside an inline `<script>` element. */
export function toInlineScriptJson(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface IeProxyErrorPayload {
  error: true;
  type: string;
  status: number;
  message: string;
  statusText?: string;
  details?: string;
}

/**
 * Error page for iframe navigations. The parent can no longer read the
 * iframe's DOM, so the error is reported over postMessage.
 */
export function buildIeProxyErrorDocument(
  payload: IeProxyErrorPayload,
  options: { nonce: string; frameToken: string | null; parentOrigin: string }
): string {
  const message = toInlineScriptJson({
    type: "iframeProxyError",
    ieFrame: options.frameToken,
    error: payload,
  });
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${escapeHtmlText(payload.message)}</title>
<script nonce="${options.nonce}">
try { window.parent.postMessage(${message}, ${toInlineScriptJson(options.parentOrigin)}); } catch (e) {}
</script>
</head><body style="font-family:sans-serif;padding:16px">
<p>${escapeHtmlText(payload.message)}</p>
</body></html>`;
}

/**
 * Navigation interceptor injected into every proxied HTML document. Reports
 * the page title / blank-SPA state and link navigations to the parent.
 *
 * Upstream scripts stay stripped (wombat included). Wayback replay hrefs are
 * unwrapped here so a click still updates IE instead of following
 * web.archive.org.
 */
export function buildIeNavigationInterceptorScript(options: {
  nonce: string | null;
  frameToken: string | null;
  parentOrigin: string;
}): string {
  const nonceAttr = options.nonce ? ` nonce="${options.nonce}"` : "";
  return `
<script${nonceAttr}>
(function() {
  'use strict';

  // Save real parent reference BEFORE any overrides
  var realParent = window.parent;
  var frameToken = ${toInlineScriptJson(options.frameToken)};
  var parentOrigin = ${toInlineScriptJson(options.parentOrigin)};

  function postToParent(message) {
    try {
      message.ieFrame = frameToken;
      realParent.postMessage(message, parentOrigin);
    } catch (e) {}
  }

  ${ARCHIVED_NAVIGATION_RESOLVER_SOURCE}

  // Helper to resolve and post navigation URL to real parent.
  // Wayback replay links are reported as the captured original URL so the
  // parent reloads that page through the proxy (same year) instead of
  // navigating the iframe to web.archive.org.
  function postNavigation(url, source, openInNewWindow) {
    try {
      if (!url) return false;
      var base = document.baseURI || window.location.href;
      var absoluteUrl = resolveArchivedNavigationUrl(url, base);
      var pageUrl = unwrapWaybackReplayUrl(base);
      if (absoluteUrl.startsWith('javascript:') ||
          absoluteUrl.startsWith('blob:') ||
          absoluteUrl.startsWith('data:') ||
          (absoluteUrl.indexOf('#') !== -1 &&
            (absoluteUrl.split('#')[0] === pageUrl.split('#')[0] ||
             absoluteUrl.split('#')[0] === window.location.href.split('#')[0]))) {
        return false;
      }
      postToParent({
        type: openInNewWindow ? 'iframeOpenWindow' : 'iframeNavigation',
        url: absoluteUrl,
        source: source
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  var SPA_ROOT_IDS = ['root', 'app', '__next'];
  function isBlankClientSpa() {
    try {
      if (!document.body) return false;
      var root = null;
      for (var i = 0; i < SPA_ROOT_IDS.length && !root; i++) {
        root = document.getElementById(SPA_ROOT_IDS[i]);
      }
      if (!root) return false;
      if (root.querySelector('h1, h2, article, main, header.big')) return false;
      var text = (root.textContent || '').replace(/\\s+/g, ' ').trim();
      return text.length <= 80;
    } catch (e) {
      return false;
    }
  }

  function reportLoaded() {
    var title = '';
    try { title = document.title || ''; } catch (e) {}
    if (!title) {
      try {
        var meta = document.querySelector('meta[name="page-title"]');
        if (meta) title = decodeURIComponent(meta.getAttribute('content') || '');
      } catch (e) {}
    }
    postToParent({ type: 'iframeLoaded', title: title, blankSpa: isBlankClientSpa() });
  }
  if (document.readyState === 'complete') {
    setTimeout(reportLoaded, 0);
  } else {
    window.addEventListener('load', reportLoaded);
  }

  // --- Frame-busting neutralization ---
  // Make the page think it is the top-level window so that
  // "if (top !== self) top.location = ..." guards become no-ops.
  try {
    Object.defineProperty(window, 'top', {
      get: function() { return window.self; },
      configurable: true
    });
  } catch(e) {}

  try {
    Object.defineProperty(window, 'parent', {
      get: function() { return window.self; },
      configurable: true
    });
  } catch(e) {}

  try {
    Object.defineProperty(window, 'frameElement', {
      get: function() { return null; },
      configurable: true
    });
  } catch(e) {}

  // --- Block Service Worker registration (prevents SW interference in proxied context) ---
  try {
    var fakeReg = {
      installing: null, waiting: null, active: null, scope: '',
      unregister: function() { return Promise.resolve(true); },
      update: function() { return Promise.resolve(); },
      addEventListener: function() {}, removeEventListener: function() {}
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      get: function() {
        return {
          register: function() { return Promise.resolve(fakeReg); },
          getRegistration: function() { return Promise.resolve(undefined); },
          getRegistrations: function() { return Promise.resolve([]); },
          ready: Promise.resolve(fakeReg),
          controller: null,
          addEventListener: function() {}, removeEventListener: function() {}
        };
      },
      configurable: true
    });
  } catch(e) {}

  // --- Suppress Notification / Push permission requests ---
  try {
    if (window.Notification) {
      window.Notification.requestPermission = function() { return Promise.resolve('denied'); };
    }
  } catch(e) {}

  // --- Click interceptor (capture phase for highest priority) ---
  function handleClick(event) {
    if (event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.button !== 0) return;

    var target = event.target;
    var anchor = null;

    while (target && target !== document.documentElement) {
      if (target.tagName === 'A' && target.href) {
        anchor = target;
        break;
      }
      target = target.parentElement;
    }

    if (anchor && anchor.href) {
      var href = anchor.getAttribute('href');
      var openInNewWindow =
        (anchor.getAttribute('target') || '').toLowerCase() === '_blank';
      if (postNavigation(href, 'click', openInNewWindow)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    }
  }

  // --- Form submission interceptor ---
  function handleSubmit(event) {
    var form = event.target;
    if (form && form.tagName === 'FORM') {
      var action = form.getAttribute('action') || window.location.href;
      var method = (form.getAttribute('method') || 'GET').toUpperCase();

      if (method === 'GET') {
        var formData = new FormData(form);
        var params = new URLSearchParams();
        formData.forEach(function(value, key) {
          params.append(key, value);
        });
        var url = action + (action.indexOf('?') === -1 ? '?' : '&') + params.toString();
        if (postNavigation(url, 'form-get')) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
        }
      }
    }
  }

  // --- Mousedown interceptor for middle-click ---
  function handleMouseDown(event) {
    if (event.button === 1) {
      var target = event.target;
      while (target && target !== document.documentElement) {
        if (target.tagName === 'A' && target.href) {
          var href = target.getAttribute('href');
          if (postNavigation(href, 'middle-click')) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
          }
          break;
        }
        target = target.parentElement;
      }
    }
  }

  document.addEventListener('click', handleClick, true);
  document.addEventListener('submit', handleSubmit, true);
  document.addEventListener('mousedown', handleMouseDown, true);
  window.addEventListener('click', handleClick, true);

  setInterval(function() {
    document.removeEventListener('click', handleClick, true);
    document.addEventListener('click', handleClick, true);
  }, 2000);

  // --- Patch window.location assignments ---
  var locationDescriptor = Object.getOwnPropertyDescriptor(window, 'location');
  if (locationDescriptor && locationDescriptor.configurable !== false) {
    try {
      var originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        get: function() { return originalLocation; },
        set: function(url) {
          if (postNavigation(url, 'location-set')) return;
          originalLocation.href = url;
        },
        configurable: true
      });
    } catch (e) {}
  }

  try {
    var loc = window.location;
    var originalAssign = loc.assign;
    var originalReplace = loc.replace;

    if (originalAssign) {
      loc.assign = function(url) {
        if (!postNavigation(url, 'location-assign')) {
          originalAssign.call(loc, url);
        }
      };
    }

    if (originalReplace) {
      loc.replace = function(url) {
        if (!postNavigation(url, 'location-replace')) {
          originalReplace.call(loc, url);
        }
      };
    }

    var hrefDescriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(loc), 'href');
    if (hrefDescriptor && hrefDescriptor.set) {
      var originalHrefSetter = hrefDescriptor.set;
      Object.defineProperty(loc, 'href', {
        get: function() { return loc.href; },
        set: function(url) {
          if (!postNavigation(url, 'location-href')) {
            originalHrefSetter.call(loc, url);
          }
        },
        configurable: true
      });
    }
  } catch (e) {}

  // --- Patch history API to avoid cross-origin SecurityError ---
  var proxyOrigin = new URL(window.location.href).origin;
  var makeRelative = function(url) {
    try {
      if (!url) return url;
      var parsed = new URL(url, document.baseURI);
      if (parsed.origin !== proxyOrigin) {
        return parsed.pathname + parsed.search + parsed.hash;
      }
    } catch (e) {}
    return url;
  };

  ['pushState', 'replaceState'].forEach(function(fn) {
    var original = history[fn];
    if (typeof original === 'function') {
      history[fn] = function(state, title, url) {
        try {
          return original.call(this, state, title, makeRelative(url));
        } catch (err) {
          return original.call(this, state, title, null);
        }
      };
    }
  });

  // --- Intercept window.open ---
  var originalOpen = window.open;
  window.open = function(url, target, features) {
    var openInNewWindow =
      !target ||
      String(target).toLowerCase() === '_blank' ||
      String(target).toLowerCase() === '_new';
    if (url && postNavigation(url, 'window-open', openInNewWindow)) return null;
    return originalOpen ? originalOpen.call(window, url, target, features) : null;
  };

  // --- Sub-resource proxy: route ALL cross-origin fetch/XHR (any method)
  // through the proxy so CORS, mixed-content, and same-site-different-origin
  // API calls all succeed. Requests already pointing at the proxy origin are
  // left untouched to avoid loops. The 'raw=1' flag tells the proxy to stream
  // the payload back verbatim (no HTML rewriting). The document has an opaque
  // origin, so the proxy origin comes from the URL rather than window.origin.
  function buildRawProxyUrl(href) {
    return proxyOrigin + '/api/iframe-check?raw=1&url=' + encodeURIComponent(href);
  }
  function shouldProxyUrl(resolved) {
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return false;
    return resolved.origin !== proxyOrigin;
  }

  var origFetch = window.fetch;
  window.fetch = function(input, init) {
    try {
      var url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));
      var resolved = new URL(url, document.baseURI);
      if (shouldProxyUrl(resolved)) {
        var proxyUrl = buildRawProxyUrl(resolved.href);
        if (typeof input === 'string' || input instanceof URL) {
          return origFetch.call(window, proxyUrl, init);
        }
        if (input instanceof Request) {
          return origFetch.call(window, new Request(proxyUrl, input), init);
        }
        return origFetch.call(window, proxyUrl, init);
      }
    } catch(e) {}
    return origFetch.call(window, input, init);
  };

  var origXHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function() {
    try {
      var url = arguments[1];
      if (typeof url === 'string') {
        var resolved = new URL(url, document.baseURI);
        if (shouldProxyUrl(resolved)) {
          arguments[1] = buildRawProxyUrl(resolved.href);
        }
      }
    } catch(e) {}
    return origXHROpen.apply(this, arguments);
  };
})();
</script>
`;
}
