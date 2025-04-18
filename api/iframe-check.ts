// No Next.js types needed – omit unused import to keep file framework‑agnostic.

export const config = {
  runtime: "edge",
};

/**
 * Edge function that checks if a remote website allows itself to be embedded in an iframe.
 * We look at two common headers:
 *   1. `X-Frame-Options` – if present with values like `deny` or `sameorigin` we treat it as blocked.
 *   2. `Content-Security-Policy` – if it contains a `frame-ancestors` directive that does **not**
 *      include `*` or our own origin, we treat it as blocked.
 *
 * The function returns a small JSON object:
 *   {
 *     allowed: boolean,
 *     reason?: string
 *   }
 *
 * On network or other unexpected errors we default to `allowed: true` so that navigation is not
 * blocked accidentally (the front‑end still has its own error handling for actual iframe errors).
 */

export default async function handler(req: Request) {
  const { searchParams } = new URL(req.url);
  const urlParam = searchParams.get("url");
  const mode = searchParams.get("mode") || "proxy"; // "check" | "proxy" (default)

  if (!urlParam) {
    return new Response(
      JSON.stringify({ error: "Missing 'url' query parameter" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Ensure the URL starts with a protocol for fetch()
  const normalizedUrl = urlParam.startsWith("http")
    ? urlParam
    : `https://${urlParam}`;

  // -------------------------------
  // Helper: perform header‑only check
  // -------------------------------
  const checkSiteEmbeddingAllowed = async () => {
    try {
      let res = await fetch(normalizedUrl, {
        method: "GET",
        redirect: "follow",
      });

      if (!res.ok) {
          throw new Error(`Upstream fetch failed with status ${res.status}`);
      }

      const xFrameOptions = res.headers.get("x-frame-options") || "";
      const headerCsp = res.headers.get("content-security-policy") || "";

      // Check meta tags only for HTML content
      let metaCsp = "";
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
          const html = await res.text();
          const metaTagMatch = html.match(
              /<meta\s+http-equiv=['\"]Content-Security-Policy['\"]\s+content=['\"]([^\'\"]*)['\"][^>]*>/i
          );
          if (metaTagMatch && metaTagMatch[1]) {
              metaCsp = metaTagMatch[1];
          }
      }

      // Helper to check frame-ancestors directive
      const checkFrameAncestors = (cspString: string): boolean => {
          if (!cspString) return false; // No policy = no restriction
          const directiveMatch = cspString
              .toLowerCase()
              .split(";")
              .map((d) => d.trim())
              .find((d) => d.startsWith("frame-ancestors"));
          if (!directiveMatch) return false; // No frame-ancestors = no restriction from this policy

          const directiveValue = directiveMatch.replace("frame-ancestors", "").trim();
          // If the value is exactly 'none', it's definitely blocked.
          if (directiveValue === "'none'") return true; // Blocked

          // Simplified: if it doesn't contain '*', assume it blocks cross-origin.
          return !directiveValue.includes("*");
      };

      const isBlockedByCsp = (() => {
        // Blocked if *either* header OR meta tag CSP restricts frame-ancestors
        return checkFrameAncestors(headerCsp) || checkFrameAncestors(metaCsp);
      })();

      const isBlockedByXfo = (() => {
        if (!xFrameOptions) return false;
        const value = xFrameOptions.toLowerCase();
        return value.includes("deny") || value.includes("sameorigin");
      })();

      const allowed = !(isBlockedByXfo || isBlockedByCsp);
      // Add meta CSP to reason if relevant
      const finalReason = !allowed
        ? isBlockedByXfo
            ? `X-Frame-Options: ${xFrameOptions}`
            : metaCsp && checkFrameAncestors(metaCsp)
                ? `Content-Security-Policy (meta): ${metaCsp}`
                : `Content-Security-Policy (header): ${headerCsp}`
        : undefined;

      return { allowed, reason: finalReason };

    } catch (error) {
        // If fetching upstream headers failed, assume embedding is blocked
        console.error(`[iframe-check] Failed to fetch upstream headers for ${normalizedUrl}:`, error);
        return { allowed: false, reason: `Proxy check failed: ${(error as Error).message}` }; // Renamed reason
    }
  };

  try {
    // 1. Pure header‑check mode
    if (mode === "check") {
      const result = await checkSiteEmbeddingAllowed();
      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Proxy mode – stream the upstream resource, removing blocking headers
    const upstreamRes = await fetch(normalizedUrl, { method: "GET", redirect: "follow" });

    // If the upstream fetch failed (e.g., 403 Forbidden, 404 Not Found), return an error page
    if (!upstreamRes.ok) {
        // Basic styled error page resembling ryOS components
        const errorHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Proxy Error ${upstreamRes.status}</title>
  <link rel="stylesheet" href="https://os.ryo.lu/fonts/fonts.css"> 
  <style>
    /* Apply base font to all elements */
    * {
      box-sizing: border-box;
    }
    html, body {
      font-family: "Geneva-12", "ArkPixel", system-ui, sans-serif;
      font-size: 12px; /* typical system font size */
      margin: 0;
      padding: 0;
      height: 100%;
    }
    body {
      background-color: #ffffff; /* White background */
      color: #000000; /* Black text */
      padding: 30px 40px; /* Padding similar to IE pages */
      /* Remove flex centering */
      /* display: flex; */
      /* flex-direction: column; */
      /* align-items: center; */
      /* justify-content: center; */
      /* min-height: 100vh; */
      text-align: left; /* Left align text */
    }
    h1 {
      font-size: 1.4em; /* Slightly larger heading */
      color: #000000; /* Black heading */
      margin-bottom: 20px;
      font-weight: normal; /* Less bold */
      border-bottom: 1px solid #cccccc; /* Separator line */
      padding-bottom: 10px;
    }
    p {
      margin: 10px 0;
      line-height: 1.4;
    }
    a {
      color: #0033cc; /* Standard IE blue */
      text-decoration: underline;
    }
    a:hover {
      color: #cc0000; /* Red hover, common in older UIs */
    }
    code {
      font-family: "Geneva-12", "ArkPixel", monospace; /* Ensure monospace fallback */
      /* Remove distinct background */
      background-color: transparent;
      padding: 0;
      border-radius: 0;
      font-size: 1em;
      color: #555;
    }
  </style>
</head>
<body>
  <h1>Cannot display this page</h1> <!-- More IE-like title -->
  <p>Could not load the requested URL:</p>
  <p><code><a href="${normalizedUrl}" target="_blank" rel="noopener noreferrer">${normalizedUrl}</a></code></p>
  <p>Reason: ${upstreamRes.statusText || "(No reason provided)"} (Status Code: ${upstreamRes.status})</p>
  <hr style="border: none; border-top: 1px solid #cccccc; margin-top: 20px;">
  <p style="font-size: 0.9em; color: #666;">Please check the address and try again, or contact the system administrator.</p>
</body>
</html>`;

        return new Response(errorHtml, {
            status: upstreamRes.status, // Return the original error status
            headers: { 
                "Content-Type": "text/html",
                // Add permissive headers even for the error page
                "Access-Control-Allow-Origin": "*",
                "Content-Security-Policy": "frame-ancestors *; sandbox allow-scripts allow-forms allow-same-origin allow-popups"
            }
        });
    }

    // Clone headers so we can edit them
    const headers = new Headers(upstreamRes.headers);
    const contentType = headers.get("content-type") || "";

    headers.delete("x-frame-options");
    headers.delete("content-security-policy");
    headers.set(
      "content-security-policy",
      "frame-ancestors *; sandbox allow-scripts allow-forms allow-same-origin allow-popups"
    );
    headers.set("access-control-allow-origin", "*");

    // If it's HTML, inject the <base> tag and click interceptor script
    if (contentType.includes("text/html")) {
        let html = await upstreamRes.text();
        const baseTag = `<base href="${normalizedUrl}">`;
        const clickInterceptorScript = `
<script>
  document.addEventListener('click', function(event) {
    var targetElement = event.target.closest('a');
    if (targetElement && targetElement.href) {
      event.preventDefault();
      event.stopPropagation();
      try {
        const absoluteUrl = new URL(targetElement.getAttribute('href'), document.baseURI || window.location.href).href;
        window.parent.postMessage({ type: 'iframeNavigation', url: absoluteUrl }, '*');
      } catch (e) { console.error("Error resolving/posting URL:", e); }
    }
  }, true);
</script>
`;

        // Inject <base> tag right after <head> (case‑insensitive)
        const headIndex = html.search(/<head[^>]*>/i);
        if (headIndex !== -1) {
            const insertPos = headIndex + html.match(/<head[^>]*>/i)![0].length;
            html = html.slice(0, insertPos) + baseTag + html.slice(insertPos);
        } else {
            // Fallback: Prepend <base> if no <head>
            html = baseTag + html;
        }

        // Inject script right before </body> (case‑insensitive)
        const bodyEndIndex = html.search(/<\/body>/i);
        if (bodyEndIndex !== -1) {
          html = html.slice(0, bodyEndIndex) + clickInterceptorScript + html.slice(bodyEndIndex);
        } else {
          // Fallback: Append script if no </body>
          html += clickInterceptorScript;
        }

        return new Response(html, {
            status: upstreamRes.status,
            headers,
        });
    } else {
        // For non‑HTML content, stream the body directly
        return new Response(upstreamRes.body, {
            status: upstreamRes.status,
            headers,
        });
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
} 