/**
 * Pure HTML→text and metadata extraction helpers for the webFetch tool.
 *
 * These were previously private functions inside executors.ts. They are split
 * into this dependency-free module so they can be unit-tested directly (without
 * pulling executors.ts's heavy server-only imports) and reused without
 * duplicating the logic.
 */

import { decodeHtmlEntitiesOnce } from "../../_utils/html-entities.js";

export const DANGEROUS_URL_SCHEMES = /^(?:javascript|data|vbscript|blob):/i;

/**
 * Repeatedly strip tag patterns until no more matches remain,
 * preventing nested-tag bypass (e.g. `<scr<script>ipt>`).
 */
export function stripTagsLoop(
  html: string,
  pattern: RegExp,
  maxPasses = 10
): string {
  let result = html;
  for (let i = 0; i < maxPasses; i++) {
    const next = result.replace(pattern, "");
    if (next === result) break;
    result = next;
  }
  return result;
}

export function buildSelectorPatterns(selector: string): RegExp[] {
  const patterns: RegExp[] = [];

  if (selector.startsWith("#")) {
    const id = selector.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    patterns.push(
      new RegExp(
        `<[a-z][a-z0-9]*[^>]*\\bid=["']${id}["'][^>]*>[\\s\\S]*?(?=<\\/[a-z])`,
        "i"
      )
    );
  } else if (selector.startsWith(".")) {
    const cls = selector.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    patterns.push(
      new RegExp(
        `<[a-z][a-z0-9]*[^>]*\\bclass=["'][^"']*\\b${cls}\\b[^"']*["'][^>]*>[\\s\\S]*?(?=<\\/[a-z])`,
        "i"
      )
    );
  } else {
    const tag = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    patterns.push(new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"));
  }

  return patterns;
}

export function extractByPatterns(
  html: string,
  patterns: RegExp[]
): string | null {
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[0];
  }
  return null;
}

export function extractMainContent(html: string): string {
  const mainPatterns = [
    /<main[^>]*>([\s\S]*?)<\/main>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<div[^>]*(?:id|class)=["'][^"']*(?:content|article|post|entry|main-body|main_content|page-content|post-content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*role=["']main["'][^>]*>([\s\S]*?)<\/div>/i,
  ];

  for (const pattern of mainPatterns) {
    const match = html.match(pattern);
    if (match) {
      const content = match[1] || match[0];
      if (content.length > 200) return content;
    }
  }

  return html;
}

export function stripHtmlToText(html: string, selector?: string): string {
  let working = html;

  if (selector) {
    const selectorPatterns = buildSelectorPatterns(selector);
    const extracted = extractByPatterns(working, selectorPatterns);
    if (extracted) {
      working = extracted;
    }
  } else {
    working = extractMainContent(working);
  }

  // Strip dangerous/non-content tags in a loop to handle nested obfuscation.
  // Closing-tag regex uses `[^>]*>` to match malformed variants like
  // `</script \t\n bar>` where extra chars appear before `>`.
  working = stripTagsLoop(working, /<script\b[\s\S]*?<\/script[^>]*>/gi);
  working = stripTagsLoop(working, /<style\b[\s\S]*?<\/style[^>]*>/gi);
  working = stripTagsLoop(working, /<noscript\b[\s\S]*?<\/noscript[^>]*>/gi);
  working = stripTagsLoop(working, /<nav\b[\s\S]*?<\/nav[^>]*>/gi);
  working = stripTagsLoop(working, /<footer\b[\s\S]*?<\/footer[^>]*>/gi);
  working = stripTagsLoop(working, /<header\b[\s\S]*?<\/header[^>]*>/gi);
  working = stripTagsLoop(working, /<!--[\s\S]*?-->/g);
  working = stripTagsLoop(working, /<svg\b[\s\S]*?<\/svg[^>]*>/gi);

  working = working.replace(
    /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi,
    (_m, tag, inner) => {
      const level = parseInt(tag.charAt(1), 10);
      return "\n" + "#".repeat(level) + " " + inner.trim() + "\n";
    }
  );

  working = working.replace(/<li[^>]*>/gi, "\n- ");
  working = working.replace(/<\/li>/gi, "");
  working = working.replace(/<br\s*\/?>/gi, "\n");
  working = working.replace(/<\/p>/gi, "\n\n");
  working = working.replace(/<\/div>/gi, "\n");
  working = working.replace(/<\/tr>/gi, "\n");
  working = working.replace(/<td[^>]*>/gi, "\t");

  working = working.replace(
    /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_m, href, text) => {
      const linkText = stripTagsLoop(text, /<[^>]+>/g).trim();
      if (!linkText) return "";
      if (href.startsWith("#") || DANGEROUS_URL_SCHEMES.test(href))
        return linkText;
      return `${linkText} (${href})`;
    }
  );

  // Loop-strip remaining tags to handle any nested fragments
  working = stripTagsLoop(working, /<[^>]+>/g);

  working = decodeHtmlEntitiesOnce(working);

  working = working.replace(/[ \t]+/g, " ");
  working = working.replace(/\n[ \t]+/g, "\n");
  working = working.replace(/\n{3,}/g, "\n\n");
  working = working.trim();

  return working;
}

export function extractMetadata(html: string): {
  title?: string;
  description?: string;
  siteName?: string;
} {
  const result: { title?: string; description?: string; siteName?: string } =
    {};

  const ogTitle = html.match(
    /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["'][^>]*>/i
  );
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  result.title =
    ogTitle?.[1]?.trim() || titleTag?.[1]?.trim().replace(/\s+/g, " ");

  const ogDesc = html.match(
    /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["'][^>]*>/i
  );
  const metaDesc = html.match(
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["'][^>]*>/i
  );
  result.description = ogDesc?.[1]?.trim() || metaDesc?.[1]?.trim();

  const ogSite = html.match(
    /<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["'][^>]*>/i
  );
  result.siteName = ogSite?.[1]?.trim();

  return result;
}
