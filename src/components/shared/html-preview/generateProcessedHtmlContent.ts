import { APPLET_AUTH_BRIDGE_SCRIPT } from "@/utils/appletAuthBridge";

export interface GenerateProcessedHtmlOptions {
  htmlContent: string;
  contentTimestamp: number;
  normalizedBaseUrl: string | null;
  isMacOsXTheme: boolean;
  isTrustedApplet: boolean;
  useFallbackFonts: boolean;
}

export function generateProcessedHtmlContent(options: GenerateProcessedHtmlOptions): string {
const timestamp = `<!-- ts=${options.contentTimestamp} -->`;
const baseTag = options.normalizedBaseUrl
  ? `<base href="${options.normalizedBaseUrl}">`
  : "";

// Determine which fonts to use: always use fallback fonts when saving, otherwise use theme-based fonts
const shouldUseMacFonts = !options.useFallbackFonts && options.isMacOsXTheme;

// Define the script tags and styles that should be added ONLY after streaming
// Font link MUST be first for potentially faster loading/application
// Only trusted (ryo-authored) HTML receives the auth bridge.
// For untrusted previews, the iframe also runs without
// `allow-same-origin`, so even if a malicious script tried to
// postMessage the parent, it cannot read the response.
const authBridge = options.isTrustedApplet ? APPLET_AUTH_BRIDGE_SCRIPT : "";

const postStreamHeadContent = `
<link rel="stylesheet" href="/fonts/fonts.css">
${timestamp} 
${baseTag}
${authBridge}
<script type="module" src="https://cdnjs.cloudflare.com/ajax/libs/three.js/0.174.0/three.module.min.js"></script>
<script src="https://cdn.tailwindcss.com/3.4.16"></script>
<script>
tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        sans: [${
          shouldUseMacFonts
            ? '"LucidaGrande", "Lucida Grande", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Helvetica", "Arial", "Apple Color Emoji", "Noto Color Emoji", "sans-serif"'
            : '"Geneva-12", "ArkPixel", "SerenityOS-Emoji", "sans-serif"'
        }],
        mono: [${
          shouldUseMacFonts
            ? '"ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "Liberation Mono", "Courier New", "monospace"'
            : '"Monaco", "ArkPixel", "SerenityOS-Emoji", "ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "Liberation Mono", "Courier New", "monospace"'
        }],
        serif: [${
          shouldUseMacFonts
            ? '"Georgia", "Times New Roman", "Times", "serif"'
            : '"Mondwest", "Yu Mincho", "Hiragino Mincho Pro", "Georgia", "Palatino", "SerenityOS-Emoji", "serif"'
        }],
        emoji: [${
          shouldUseMacFonts
            ? '"Apple Color Emoji", "Noto Color Emoji"'
            : '"SerenityOS-Emoji", "AppleColorEmoji", "AppleColorEmojiFallback"'
        }],
        'geneva': [${
          shouldUseMacFonts
            ? '"LucidaGrande", "Lucida Grande", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Helvetica", "Arial", "Apple Color Emoji", "Noto Color Emoji", "sans-serif"'
            : '"Geneva-12", "ArkPixel", "SerenityOS-Emoji", "system-ui", "-apple-system", "sans-serif"'
        }],
        'mondwest': ["Mondwest", "Yu Mincho", "Hiragino Mincho Pro", "Georgia", "Palatino", "Yu Mincho", "Hiragino Mincho Pro", "serif"],
        'neuebit': [${
          shouldUseMacFonts
            ? '"Helvetica", "Arial", "Hiragino Sans", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"'
            : '"NeueBit", "ArkPixel", "SerenityOS-Emoji", "Helvetica", "Arial", "Hiragino Sans", "sans-serif"'
        }],
        'monaco': [${
          shouldUseMacFonts
            ? '"ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "Liberation Mono", "Courier New", "monospace"'
            : '"Monaco", "ArkPixel", "SerenityOS-Emoji", "monospace"'
        }],
        'jacquard': ["Jacquard", "Yu Mincho", "Hiragino Mincho Pro", "Georgia", "Palatino", "serif"]
      }
    }
  }
}
</script>
<style>
* {
  box-sizing: border-box;
  ${shouldUseMacFonts ? "font-family: inherit !important;" : ""}
}
html, body {
  margin: 0;
  overflow-x: auto; /* Allow horizontal scroll if content overflows */
  width: 100%;
  height: 100%;
  max-width: 100%; /* Prevent body from exceeding viewport width */
  ${
    shouldUseMacFonts
      ? 'font-family: "LucidaGrande", "Lucida Grande", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Noto Color Emoji", sans-serif !important;'
      : ""
  }
}
${
  shouldUseMacFonts
    ? `
/* Ensure headings and common text elements use Lucida Grande */
h1,h2,h3,h4,h5,h6,p,div,span,a,li,ul,ol,button,input,select,textarea,label,code,pre,blockquote,small,strong,em,table,th,td {
  font-family: "LucidaGrande", "Lucida Grande", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Noto Color Emoji", sans-serif !important;
}
`
    : ""
}
/* Ensure pre doesn't break layout */
pre {
  white-space: pre-wrap; /* Allow wrapping */
  word-break: break-all; /* Break long words */
}
</style>

<!-- Move click interceptor script to head for earlier execution -->
<script>
document.addEventListener('DOMContentLoaded', function() {
  document.addEventListener('click', function(event) {
    var targetElement = event.target.closest('a');
    // Only intercept if it's a valid link and NOT inside the draggable toolbar
    if (targetElement && targetElement.href && !targetElement.closest('[data-drag-controls]')) {
      event.preventDefault();
      event.stopPropagation();
      try {
        // Resolve relative URLs against the document's base URI (if set) or window location
        const absoluteUrl = new URL(targetElement.getAttribute('href'), document.baseURI || window.location.href).href;
        // Use a specific message type for AI HTML navigation
        window.parent.postMessage({ type: 'aiHtmlNavigation', url: absoluteUrl }, window.location.origin);
      } catch (e) { console.error("Error resolving/posting URL:", e); }
    }
  }, true); // Use capture phase to intercept early
});

// Also add immediate execution version for documents that load quickly
// This helps ensure we don't miss any clicks during initial page load
(function() {
  document.addEventListener('click', function(event) {
    var targetElement = event.target.closest('a');
    // Only intercept if it's a valid link and NOT inside the draggable toolbar
    if (targetElement && targetElement.href && !targetElement.closest('[data-drag-controls]')) {
      event.preventDefault();
      event.stopPropagation();
      try {
        // Resolve relative URLs against the document's base URI (if set) or window location
        const absoluteUrl = new URL(targetElement.getAttribute('href'), document.baseURI || window.location.href).href;
        // Use a specific message type for AI HTML navigation
        window.parent.postMessage({ type: 'aiHtmlNavigation', url: absoluteUrl }, window.location.origin);
      } catch (e) { console.error("Error resolving/posting URL:", e); }
    }
  }, true); // Use capture phase to intercept early
})();
</script>
`;

// --- Start modification: Extract core HTML content ---
const trimmedHtmlContent = options.htmlContent.trim();
let coreHtmlContent = trimmedHtmlContent; // Default to use trimmed content

// NEW: First, strip potential markdown code block fence
if (coreHtmlContent.startsWith("```html")) {
  coreHtmlContent = coreHtmlContent.substring("```html".length).trim();
} else if (coreHtmlContent.startsWith("```")) {
  coreHtmlContent = coreHtmlContent.substring("```".length).trim();
}

// Remove trailing ``` if present
if (coreHtmlContent.endsWith("```")) {
  coreHtmlContent = coreHtmlContent
    .substring(0, coreHtmlContent.length - "```".length)
    .trim();
}

// NEW: Strip leading text before the first tag '<'
const firstTagIndex = coreHtmlContent.indexOf("<");
if (firstTagIndex > 0) {
  // If '<' is found and it's not the first character, strip the leading text
  coreHtmlContent = coreHtmlContent.substring(firstTagIndex);
} else if (firstTagIndex === -1) {
  // If no '<' is found at all, the content is likely just text, clear it or handle as needed
  // For now, let's assume we want to render nothing if there's no HTML tag.
  coreHtmlContent = "";
}
// If firstTagIndex is 0, it already starts with a tag, no stripping needed.

// Now, check for and extract content within <html> tags
const htmlStartIndex = coreHtmlContent.toLowerCase().indexOf("<html");
const htmlEndIndex = coreHtmlContent.toLowerCase().lastIndexOf("</html>");

if (htmlStartIndex !== -1) {
  // Found <html> tag
  if (htmlEndIndex > htmlStartIndex) {
    // Found both <html> and </html>, extract the content between them (inclusive)
    coreHtmlContent = coreHtmlContent.substring(
      htmlStartIndex,
      htmlEndIndex + "</html>".length
    );
  } else {
    // Found <html> but no </html> after it, take content from <html> to the end
    coreHtmlContent = coreHtmlContent.substring(htmlStartIndex);
  }
}
// If no <html> tag, coreHtmlContent remains the original trimmedHtmlContent (fragment)
// --- End modification ---

// Use coreHtmlContent for subsequent checks and processing
const isFullHtmlDoc =
  /<!DOCTYPE html>/i.test(coreHtmlContent) ||
  /<html[\s>]/i.test(coreHtmlContent);

if (isFullHtmlDoc) {
  let modifiedContent = coreHtmlContent; // Start with the potentially extracted content

  // Attempt to inject into <head>
  const headEndMatch = /<\/head>/i.exec(modifiedContent);
  if (headEndMatch) {
    // Inject just before closing </head> tag
    modifiedContent =
      modifiedContent.slice(0, headEndMatch.index) +
      postStreamHeadContent +
      modifiedContent.slice(headEndMatch.index);
  } else {
    // No </head>, try injecting after <head> or <html>, or prepend a new head
    const headStartMatch = /<head[^>]*>/i.exec(modifiedContent);
    if (headStartMatch) {
      modifiedContent =
        modifiedContent.slice(
          0,
          headStartMatch.index + headStartMatch[0].length
        ) +
        postStreamHeadContent +
        modifiedContent.slice(
          headStartMatch.index + headStartMatch[0].length
        );
    } else {
      const htmlStartMatch = /<html[^>]*>/i.exec(modifiedContent);
      if (htmlStartMatch) {
        // Inject head after opening <html> tag
        modifiedContent =
          modifiedContent.slice(
            0,
            htmlStartMatch.index + htmlStartMatch[0].length
          ) +
          `<head>${postStreamHeadContent}</head>` +
          modifiedContent.slice(
            htmlStartMatch.index + htmlStartMatch[0].length
          );
      } else {
        // Prepend head if no <html> tag found (very unlikely, might be invalid HTML)
        modifiedContent =
          `<head>${postStreamHeadContent}</head>` + modifiedContent;
      }
    }
  }

  // We no longer need to inject the click interceptor script since it's already in the head
  // Just return the modified content
  return modifiedContent;
} else {
  // Construct the document for partial HTML fragments
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
${postStreamHeadContent} 
</head>
<body>
${coreHtmlContent}
</body>
</html>`;
}
}
