/**
 * HTML → markdown and metadata helpers for the webFetch tool.
 *
 * Readability picks the main article when a page has one. A DOM walk is the
 * fallback (and the path for fragments, selectors, and feed item HTML) so
 * headings, lists, links, and code survive. Script/style stripping stays in
 * front of the parser so nested-tag obfuscation never becomes text.
 */

import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { decodeHtmlEntitiesOnce } from "../../_utils/html-entities.js";

export const DANGEROUS_URL_SCHEMES = /^(?:javascript|data|vbscript|blob):/i;

const SKIP_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "svg",
  "nav",
  "footer",
  "header",
  "head",
  "iframe",
  "template",
  "button",
  "input",
  "textarea",
  "select",
  "aside",
]);

interface HtmlNode {
  nodeType: number;
  textContent: string | null;
  childNodes: ArrayLike<HtmlNode>;
  tagName?: string;
  getAttribute?(name: string): string | null;
}

interface HtmlDocument {
  body: HtmlNode | null;
  documentElement: HtmlNode | null;
  title?: string;
  querySelector(selector: string): HtmlNode | null;
  querySelectorAll(selector: string): ArrayLike<HtmlNode>;
}

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
    pattern.lastIndex = 0;
    const next = result.replace(pattern, "");
    if (next === result) break;
    result = next;
  }
  return result;
}

/**
 * Remove HTML tags until the string stops changing.
 * One pass of `<[^>]+>` turns `<scr<script>ipt>` back into `<script>`.
 * Repeat until the string stops changing so a nested tag cannot reassemble.
 */
export function stripTagsUntilStable(value: string): string {
  let current = value;
  let previous: string;
  do {
    previous = current;
    current = current.replace(/<[^>]+>/g, "");
  } while (current !== previous);
  return current;
}

function stripActiveContent(html: string): string {
  let working = html;
  const patterns = [
    /<script\b[\s\S]*?<\/script[^>]*>/gi,
    /<style\b[\s\S]*?<\/style[^>]*>/gi,
    /<noscript\b[\s\S]*?<\/noscript[^>]*>/gi,
    /<svg\b[\s\S]*?<\/svg[^>]*>/gi,
    /<!--[\s\S]*?-->/g,
  ];
  for (const pattern of patterns) {
    working = stripTagsLoop(working, pattern);
  }
  return working;
}

function parseDocument(html: string): HtmlDocument {
  // linkedom drops fragment nodes that are not inside <html>/<body>.
  let source = html;
  if (!/<html\b/i.test(source)) {
    source = /<body\b/i.test(source)
      ? `<!doctype html><html>${source}</html>`
      : `<!doctype html><html><body>${source}</body></html>`;
  }
  const { document } = parseHTML(source);
  return document as unknown as HtmlDocument;
}

function collapseInline(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function finalizeMarkdown(text: string): string {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeHref(href: string, baseUrl?: string): string | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("#") || DANGEROUS_URL_SCHEMES.test(trimmed)) {
    return null;
  }
  try {
    const absolute = new URL(trimmed, baseUrl);
    if (absolute.protocol === "http:" || absolute.protocol === "https:") {
      let hrefText = absolute.toString();
      if (
        !trimmed.endsWith("/") &&
        absolute.pathname === "/" &&
        !absolute.search &&
        !absolute.hash
      ) {
        hrefText = hrefText.replace(/\/$/, "");
      }
      return hrefText;
    }
    if (absolute.protocol === "mailto:") return absolute.toString();
  } catch {
    // Relative href with no base, or a malformed URL.
  }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return null;
}

function codeLanguage(node: HtmlNode): string {
  const own = node.getAttribute?.("class") || "";
  const ownMatch = own.match(/(?:language|lang)-([\w-]+)/i);
  if (ownMatch) return ownMatch[1];
  const children = node.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if ((child.tagName || "").toLowerCase() !== "code") continue;
    const childMatch = (child.getAttribute?.("class") || "").match(
      /(?:language|lang)-([\w-]+)/i
    );
    if (childMatch) return childMatch[1];
  }
  return "";
}

function renderChildren(node: HtmlNode, baseUrl: string | undefined, depth: number): string {
  const parts: string[] = [];
  const children = node.childNodes;
  for (let i = 0; i < children.length; i++) {
    parts.push(renderNode(children[i], baseUrl, depth + 1));
  }
  return parts.join("");
}

function renderNode(node: HtmlNode, baseUrl: string | undefined, depth: number): string {
  if (depth > 60) return node.textContent || "";
  if (node.nodeType === 3 || node.nodeType === 4) {
    return (node.textContent || "").replace(/\u00a0/g, " ");
  }
  if (node.nodeType !== 1) return "";

  const tag = (node.tagName || "").toLowerCase();
  if (!tag || SKIP_TAGS.has(tag)) return "";
  if (tag === "br") return "\n";
  if (tag === "hr") return "\n\n---\n\n";

  if (/^h[1-6]$/.test(tag)) {
    const text = collapseInline(renderChildren(node, baseUrl, depth));
    if (!text) return "";
    const level = Number(tag.charAt(1));
    return `\n${"#".repeat(level)} ${text}\n`;
  }

  if (tag === "pre") {
    const code = (node.textContent || "").replace(/\n$/, "");
    if (!code.trim()) return "";
    const lang = codeLanguage(node);
    const fence = code.includes("```") ? "````" : "```";
    return `\n${fence}${lang}\n${code}\n${fence}\n`;
  }

  if (tag === "code") {
    const text = (node.textContent || "").replace(/`/g, "'");
    if (!text) return "";
    return `\`${text}\``;
  }

  if (tag === "a") {
    const href = safeHref(node.getAttribute?.("href") || "", baseUrl);
    const text = collapseInline(renderChildren(node, baseUrl, depth));
    if (!text) return href || "";
    if (!href || text === href) return text;
    const label = text.replaceAll("[", "").replaceAll("]", "");
    if (!label) return text;
    return `[${label}](${href})`;
  }

  if (tag === "img") {
    const alt = node.getAttribute?.("alt")?.trim();
    return alt ? `\n${alt}\n` : "";
  }

  if (tag === "li") {
    const inner = renderChildren(node, baseUrl, depth).trim();
    if (!inner) return "";
    const [first, ...rest] = inner.split("\n");
    const continuation = rest
      .map((line) => (line.trim() ? `  ${line.trim()}` : ""))
      .join("\n");
    return `\n- ${first}${continuation ? `\n${continuation}` : ""}\n`;
  }

  if (tag === "blockquote") {
    const inner = renderChildren(node, baseUrl, depth).trim();
    if (!inner) return "";
    return `\n${inner
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n")}\n`;
  }

  if (tag === "td" || tag === "th") {
    // Layout tables (essays, old news pages) put the whole article in one cell.
    // Keep the inner breaks instead of flattening the cell into one line.
    const text = renderChildren(node, baseUrl, depth).trim();
    if (!text) return "";
    return `\n${text}\n`;
  }

  const inner = renderChildren(node, baseUrl, depth);
  if (
    tag === "p" ||
    tag === "div" ||
    tag === "section" ||
    tag === "article" ||
    tag === "main" ||
    tag === "figure" ||
    tag === "figcaption" ||
    tag === "tr" ||
    tag === "ul" ||
    tag === "ol" ||
    tag === "table" ||
    tag === "dd" ||
    tag === "dt"
  ) {
    const trimmed = inner.trim();
    if (!trimmed) return "";
    return `\n${trimmed}\n`;
  }

  return inner;
}

/** Convert an HTML fragment to markdown. Does not run Readability. */
export function htmlFragmentToMarkdown(html: string, baseUrl?: string): string {
  const safe = stripActiveContent(html);
  try {
    const document = parseDocument(safe);
    const root = document.body || document.documentElement;
    if (!root) return finalizeMarkdown(safe.replace(/<[^>]+>/g, " "));
    return finalizeMarkdown(renderNode(root, baseUrl, 0));
  } catch {
    return regexHtmlToText(safe);
  }
}

/**
 * Plain text stays plain. Markup becomes markdown.
 * Feed descriptions are often one or the other.
 */
export function htmlOrTextToMarkdown(value: string, baseUrl?: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!/<\/?[a-z!][^>]*>/i.test(trimmed)) {
    return decodeHtmlEntitiesOnce(trimmed);
  }
  return htmlFragmentToMarkdown(trimmed, baseUrl);
}

function textLengthOf(node: HtmlNode | null): number {
  return (node?.textContent || "").replace(/\s+/g, " ").trim().length;
}

function pickContentRoot(document: HtmlDocument): HtmlNode | null {
  const body = document.body || document.documentElement;
  const candidates = document.querySelectorAll("main, article, [role='main']");
  let best: HtmlNode | null = null;
  let bestLength = 0;
  for (let i = 0; i < candidates.length; i++) {
    const length = textLengthOf(candidates[i]);
    if (length > bestLength) {
      best = candidates[i];
      bestLength = length;
    }
  }
  const bodyLength = textLengthOf(body);
  if (
    best &&
    bestLength >= 200 &&
    (bestLength >= bodyLength * 0.4 || bestLength >= 800)
  ) {
    return best;
  }
  return body;
}

function markdownFromDocument(html: string, baseUrl?: string): string {
  const document = parseDocument(html);
  const root = pickContentRoot(document);
  if (!root) return "";
  return finalizeMarkdown(renderNode(root, baseUrl, 0));
}

function tryReadabilityMarkdown(html: string, baseUrl?: string): string | null {
  try {
    const document = parseDocument(html);
    const article = new Readability(document as never, {
      charThreshold: 500,
      maxElemsToParse: 200_000,
      // Keep language-* classes so code fences stay labeled.
      keepClasses: true,
    }).parse();
    const content = article?.content;
    if (!content || typeof content !== "string") return null;
    const markdown = htmlFragmentToMarkdown(content, baseUrl);
    return markdown.trim() ? markdown : null;
  } catch {
    return null;
  }
}

function chooseContent(readable: string | null, fallback: string): string {
  const primary = readable?.trim() ?? "";
  const secondary = fallback.trim();
  if (!primary) return secondary;
  if (!secondary) return primary;
  // A real article is worth keeping even when the raw body is longer
  // (related links, comment chrome). A short extract against a much longer
  // body means Readability missed the text.
  if (primary.length >= 800) return primary;
  if (primary.length >= secondary.length * 0.5) return primary;
  if (secondary.length > primary.length + 400) return secondary;
  return primary;
}

function regexHtmlToText(html: string): string {
  let working = stripActiveContent(html);
  working = stripTagsLoop(working, /<head\b[\s\S]*?<\/head[^>]*>/gi);
  working = stripTagsLoop(working, /<nav\b[\s\S]*?<\/nav[^>]*>/gi);
  working = stripTagsLoop(working, /<footer\b[\s\S]*?<\/footer[^>]*>/gi);
  working = stripTagsLoop(working, /<header\b[\s\S]*?<\/header[^>]*>/gi);
  working = working.replace(
    /<(h[1-6])[^>]*>([\s\S]*?)<\/\1>/gi,
    (_match, tag: string, inner: string) => {
      const level = Number(tag.charAt(1));
      const text = stripTagsUntilStable(inner).trim();
      return `\n${"#".repeat(level)} ${text}\n`;
    }
  );
  working = working.replace(/<li\b[^>]*>/gi, "\n- ");
  working = working.replace(/<\/li>/gi, "");
  working = working.replace(/<br\s*\/?>/gi, "\n");
  working = working.replace(/<\/p>/gi, "\n\n");
  working = working.replace(
    /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_match, href: string, text: string) => {
      const linkText = stripTagsUntilStable(text).trim();
      if (!linkText) return "";
      const safe = safeHref(href);
      if (!safe || linkText === safe) return linkText;
      return `[${linkText}](${safe})`;
    }
  );
  working = stripTagsLoop(working, /<[^>]+>/g);
  working = decodeHtmlEntitiesOnce(working);
  return finalizeMarkdown(working);
}

function selectMarkdown(html: string, selector: string, baseUrl?: string): string | null {
  try {
    const document = parseDocument(html);
    const element = document.querySelector(selector);
    if (!element) return null;
    return finalizeMarkdown(renderNode(element, baseUrl, 0));
  } catch {
    return null;
  }
}

export function stripHtmlToText(
  html: string,
  selector?: string,
  baseUrl?: string
): string {
  const safe = stripActiveContent(html);
  const trimmedSelector = selector?.trim();
  try {
    if (trimmedSelector) {
      const selected = selectMarkdown(safe, trimmedSelector, baseUrl);
      if (selected != null) return selected;
    }
    const readable = trimmedSelector ? null : tryReadabilityMarkdown(safe, baseUrl);
    const fallback = markdownFromDocument(safe, baseUrl);
    return chooseContent(readable, fallback);
  } catch {
    return regexHtmlToText(safe);
  }
}

export function visibleTextLength(text: string): number {
  const matches = text.match(/[\p{L}\p{N}]/gu);
  return matches ? matches.length : 0;
}

function readAttr(tag: string, name: string): string | undefined {
  const match = tag.match(
    new RegExp(
      `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`,
      "i"
    )
  );
  const value = match?.[1] ?? match?.[2] ?? match?.[3];
  if (!value) return undefined;
  const decoded = decodeHtmlEntitiesOnce(value).trim();
  return decoded || undefined;
}

function sameSiteHost(left: string, right: string): boolean {
  const normalize = (host: string) =>
    host.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  const a = normalize(left);
  const b = normalize(right);
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

function isFeedLinkType(type: string): boolean {
  return (
    type.includes("rss") ||
    type.includes("atom") ||
    type.includes("rdf+xml") ||
    type.includes("feed+json") ||
    type === "application/feed+xml"
  );
}

/**
 * Same-site RSS/Atom alternate advertised by a page. Used when the HTML
 * body is a script shell (ryo.lu journal posts) and the feed holds the text.
 * Cross-site feed URLs are ignored so a page cannot aim the fetcher at an
 * unrelated host. The caller still has to pass the URL through SSRF checks.
 */
export function findAlternateFeedUrl(html: string, pageUrl: string): string | undefined {
  let page: URL;
  try {
    page = new URL(pageUrl);
  } catch {
    return undefined;
  }
  if (page.protocol !== "http:" && page.protocol !== "https:") return undefined;

  const docLang = html.match(/<html\b[^>]*\blang=["']([^"']+)["']/i)?.[1]?.toLowerCase();
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  let bestUrl: string | undefined;
  let bestScore = -1;

  for (const tag of tags) {
    const rel = readAttr(tag, "rel") || "";
    if (!/\balternate\b/i.test(rel)) continue;
    const type = (readAttr(tag, "type") || "").toLowerCase();
    if (!isFeedLinkType(type)) continue;
    const href = readAttr(tag, "href");
    if (!href || DANGEROUS_URL_SCHEMES.test(href)) continue;

    let absolute: URL;
    try {
      absolute = new URL(href, page);
    } catch {
      continue;
    }
    if (absolute.protocol !== "http:" && absolute.protocol !== "https:") continue;
    if (!sameSiteHost(page.hostname, absolute.hostname)) continue;

    const pageDir = page.pathname.replace(/[^/]*$/, "");
    const feedDir = absolute.pathname.replace(/[^/]*$/, "");
    let score = 0;
    if (feedDir === pageDir) score += 5;
    else if (page.pathname.startsWith(feedDir)) score += 3;

    const hreflang = (readAttr(tag, "hreflang") || "").toLowerCase();
    if (hreflang && docLang && hreflang.slice(0, 2) === docLang.slice(0, 2)) {
      score += 4;
    } else if (hreflang === "en" && (!docLang || docLang.startsWith("en"))) {
      score += 1;
    }
    score -= absolute.pathname.length / 1000;

    if (score > bestScore) {
      bestScore = score;
      bestUrl = absolute.toString();
    }
  }

  return bestUrl;
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

  if (result.title) result.title = decodeHtmlEntitiesOnce(result.title);
  if (result.description) {
    result.description = decodeHtmlEntitiesOnce(result.description);
  }
  if (result.siteName) result.siteName = decodeHtmlEntitiesOnce(result.siteName);

  return result;
}
