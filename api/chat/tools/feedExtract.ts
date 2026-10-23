/**
 * RSS 2.0, Atom, JSON Feed, and generic XML → readable text for webFetch.
 *
 * fast-xml-parser does not resolve external entities (SYSTEM / parameter
 * entities throw), so a feed cannot turn parsing into another HTTP fetch.
 * Custom internal entities stay inside the parser's expansion caps.
 */

import { XMLParser } from "fast-xml-parser";
import { htmlOrTextToMarkdown } from "./htmlExtract.js";
import { capContent } from "./webContentLimits.js";

export interface FeedItem {
  title: string;
  link: string;
  date?: string;
  author?: string;
  content: string;
  guid?: string;
}

export interface ParsedFeed {
  title: string;
  link: string;
  description?: string;
  items: FeedItem[];
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  removeNSPrefix: false,
  trimValues: true,
  parseTagValue: false,
  htmlEntities: true,
  processEntities: {
    enabled: true,
    maxEntitySize: 5_000,
    maxExpansionDepth: 8,
    maxTotalExpansions: 10_000,
    maxExpandedLength: 2_000_000,
    maxEntityCount: 200,
  },
});

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function localName(key: string): string {
  const bare = key.includes(":") ? key.slice(key.lastIndexOf(":") + 1) : key;
  return bare;
}

function field(obj: Record<string, unknown>, name: string): unknown {
  if (name in obj) return obj[name];
  const suffix = `:${name}`;
  for (const key of Object.keys(obj)) {
    if (key.endsWith(suffix)) return obj[key];
  }
  return undefined;
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    let best = "";
    for (const entry of value) {
      const text = textOf(entry);
      if (text.length > best.length) best = text;
    }
    return best;
  }
  const record = asRecord(value);
  if (!record) return "";
  if (typeof record["#text"] === "string" || typeof record["#text"] === "number") {
    return String(record["#text"]).trim();
  }
  return "";
}

function cleanAuthor(raw: string): string {
  const trimmed = raw.trim();
  const paren = trimmed.match(/\(([^)]+)\)\s*$/);
  if (paren?.[1]?.trim()) return paren[1].trim();
  return trimmed;
}

function authorsOf(value: unknown): string {
  const names: string[] = [];
  for (const entry of asArray(value)) {
    if (typeof entry === "string" || typeof entry === "number") {
      const cleaned = cleanAuthor(String(entry));
      if (cleaned) names.push(cleaned);
      continue;
    }
    const record = asRecord(entry);
    if (!record) continue;
    const name = textOf(record.name);
    const email = textOf(record.email);
    if (name) names.push(name);
    else if (email) names.push(email);
  }
  return names.join(", ");
}

function linksOf(value: unknown): { href: string; rel?: string }[] {
  const links: { href: string; rel?: string }[] = [];
  for (const entry of asArray(value)) {
    if (typeof entry === "string") {
      const href = entry.trim();
      if (href) links.push({ href });
      continue;
    }
    const record = asRecord(entry);
    if (!record) continue;
    const href = textOf(record["@_href"]) || textOf(record["#text"]);
    const rel = textOf(record["@_rel"]);
    if (href) links.push({ href, rel: rel || undefined });
  }
  return links;
}

function bestHref(links: { href: string; rel?: string }[]): string {
  const alternate = links.find((link) => !link.rel || link.rel === "alternate");
  if (alternate) return alternate.href;
  const other = links.find((link) => link.rel !== "self");
  return (other || links[0])?.href || "";
}

export function formatFeedDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return trimmed;
  const iso = new Date(parsed).toISOString();
  if (iso.endsWith("T00:00:00.000Z")) return iso.slice(0, 10);
  return `${iso.slice(0, 16).replace("T", " ")} UTC`;
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = textOf(value);
    if (text) return text;
  }
  return "";
}

function parseItem(value: unknown): FeedItem | null {
  const record = asRecord(value);
  if (!record) return null;
  const link = bestHref(linksOf(field(record, "link")));
  const guid = textOf(field(record, "guid")) || textOf(field(record, "id"));
  const rawBody = firstText(
    field(record, "encoded"),
    field(record, "content"),
    field(record, "description"),
    field(record, "summary")
  );
  const content = rawBody ? htmlOrTextToMarkdown(rawBody, link || undefined) : "";
  const author =
    authorsOf(field(record, "creator")) ||
    authorsOf(field(record, "author"));
  const date = formatFeedDate(
    firstText(
      field(record, "pubDate"),
      field(record, "published"),
      field(record, "updated"),
      field(record, "date")
    ) || undefined
  );
  const title = textOf(field(record, "title"));
  if (!title && !content && !link) return null;
  return {
    title,
    link: link || (guid.startsWith("http") ? guid : ""),
    date,
    author: author || undefined,
    content,
    guid: guid || undefined,
  };
}

function parseChannel(channel: Record<string, unknown>, itemValue: unknown): ParsedFeed {
  const items = asArray(itemValue)
    .map(parseItem)
    .filter((item): item is FeedItem => item != null);
  const description = textOf(field(channel, "description")) || textOf(field(channel, "subtitle"));
  return {
    title: textOf(field(channel, "title")),
    link: bestHref(linksOf(field(channel, "link"))),
    description: description ? htmlOrTextToMarkdown(description) : undefined,
    items,
  };
}

function feedFromParsed(parsed: unknown): ParsedFeed | null {
  const root = asRecord(parsed);
  if (!root) return null;

  const rss = asRecord(root.rss);
  if (rss) {
    const channel = asRecord(asArray(field(rss, "channel"))[0]);
    if (!channel) return null;
    const feed = parseChannel(channel, field(channel, "item"));
    if (feed.title || feed.items.length > 0) return feed;
  }

  const rdf = asRecord(root["rdf:RDF"] || root.RDF);
  if (rdf) {
    const channel = asRecord(asArray(field(rdf, "channel"))[0]) || {};
    const feed = parseChannel(channel, field(rdf, "item"));
    if (feed.title || feed.items.length > 0) return feed;
  }

  const atom = asRecord(root.feed);
  if (atom) {
    const xmlns = textOf(atom["@_xmlns"]);
    const hasEntries = field(atom, "entry") != null;
    if (xmlns.includes("Atom") || hasEntries) {
      const feed = parseChannel(atom, field(atom, "entry"));
      if (feed.title || feed.items.length > 0) return feed;
    }
  }

  return null;
}

export function parseFeedXml(xml: string): ParsedFeed | null {
  try {
    return feedFromParsed(xmlParser.parse(xml));
  } catch {
    return null;
  }
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseJsonFeed(value: unknown): ParsedFeed | null {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.items)) return null;
  const items: FeedItem[] = [];
  for (const entry of record.items) {
    const item = asRecord(entry);
    if (!item) continue;
    const link = stringField(item.url) || stringField(item.external_url);
    const id = stringField(item.id);
    const html = stringField(item.content_html);
    const text = stringField(item.content_text);
    const summary = stringField(item.summary);
    const raw = html || text || summary;
    const authorRecord = asRecord(item.author);
    const authors = Array.isArray(item.authors) ? item.authors : authorRecord ? [authorRecord] : [];
    const author = authorsOf(authors);
    items.push({
      title: stringField(item.title),
      link: link || (id.startsWith("http") ? id : ""),
      date: formatFeedDate(stringField(item.date_published) || stringField(item.date_modified)),
      author: author || undefined,
      content: raw ? htmlOrTextToMarkdown(raw, link || undefined) : "",
      guid: id || undefined,
    });
  }
  const home = stringField(record.home_page_url) || stringField(record.feed_url);
  return {
    title: stringField(record.title),
    link: home,
    description: stringField(record.description) || undefined,
    items: items.filter((item) => item.title || item.content || item.link),
  };
}

/** Official JSON Feed version URLs. Compared as a parsed URL, not a substring. */
function isOfficialJsonFeedVersion(version: string): boolean {
  let url: URL;
  try {
    url = new URL(version.trim());
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  if (url.hostname !== "jsonfeed.org") return false;
  const path = url.pathname.replace(/\/+$/, "") || "/";
  return path === "/version/1" || path === "/version/1.1";
}

export function isJsonFeedDocument(value: unknown, force: boolean): boolean {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.items)) return false;
  if (force) return true;
  return isOfficialJsonFeedVersion(stringField(record.version));
}

function renderFeedHeader(feed: ParsedFeed): string {
  const lines: string[] = [];
  if (feed.title) lines.push(`# ${feed.title}`);
  if (feed.link) lines.push(feed.link);
  if (feed.description) lines.push(feed.description);
  return lines.join("\n");
}

function renderItemBlock(item: FeedItem): string {
  const lines: string[] = [`## ${item.title || "untitled"}`];
  if (item.link) lines.push(item.link);
  const meta = [item.date, item.author].filter(Boolean).join(" – ");
  if (meta) lines.push(meta);
  if (item.content) {
    lines.push("");
    lines.push(item.content);
  }
  return lines.join("\n");
}

function joinFeed(header: string, blocks: string[]): string {
  const body = blocks.join("\n\n---\n\n");
  if (header && body) return `${header}\n\n${body}`;
  return header || body;
}

export interface RenderedFeed {
  header: string;
  blocks: string[];
  text: string;
  truncated: boolean;
  shown: number;
  contentLength: number;
}

/** Join whole items until maxChars. The paging layer adds the truncation note. */
export function renderFeed(feed: ParsedFeed, maxChars: number): RenderedFeed {
  const header = renderFeedHeader(feed);
  const blocks = feed.items.map(renderItemBlock);
  const full = joinFeed(header, blocks);
  if (full.length <= maxChars) {
    return {
      header,
      blocks,
      text: full,
      truncated: false,
      shown: blocks.length,
      contentLength: full.length,
    };
  }

  const kept: string[] = [];
  for (const block of blocks) {
    const candidate = joinFeed(header, [...kept, block]);
    if (candidate.length > maxChars) break;
    kept.push(block);
  }

  if (kept.length === 0 && blocks.length > 0) {
    const room = Math.max(0, maxChars - (header ? header.length + 2 : 0));
    const sliced = blocks[0].slice(0, room).trimEnd();
    const text = joinFeed(header, sliced ? [sliced] : []);
    return {
      header,
      blocks: sliced ? [sliced] : [],
      text,
      truncated: true,
      shown: sliced ? 1 : 0,
      contentLength: full.length,
    };
  }

  return {
    header,
    blocks: kept,
    text: joinFeed(header, kept),
    truncated: true,
    shown: kept.length,
    contentLength: full.length,
  };
}

export function renderMatchedFeedItem(feed: ParsedFeed, item: FeedItem): string {
  const lines: string[] = [`# ${item.title || feed.title || "untitled"}`];
  if (item.link) lines.push(item.link);
  const meta = [item.date, item.author].filter(Boolean).join(" – ");
  if (meta) lines.push(meta);
  if (feed.title && feed.title !== item.title) lines.push(feed.title);
  if (item.content) {
    lines.push("");
    lines.push(item.content);
  }
  return lines.join("\n").trim();
}

export function normalizeUrlForMatch(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    return `${host}${path}`;
  } catch {
    return trimmed.replace(/\/+$/, "").toLowerCase();
  }
}

export function findFeedItem(feed: ParsedFeed, pageUrl: string): FeedItem | undefined {
  const want = normalizeUrlForMatch(pageUrl);
  if (!want) return undefined;
  return (
    feed.items.find((item) => item.link && normalizeUrlForMatch(item.link) === want) ||
    feed.items.find((item) => item.guid && normalizeUrlForMatch(item.guid) === want)
  );
}

function renderGenericXml(node: unknown, key?: string, depth = 0): string {
  if (depth > 40 || node == null) return "";
  if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
    const text = String(node).replace(/[ \t]+/g, " ").trim();
    if (!text) return "";
    const label = key ? localName(key) : "";
    if (!label || label === "#text" || label.startsWith("@")) return text;
    return `${label}: ${text}`;
  }
  if (Array.isArray(node)) {
    return node
      .map((entry) => renderGenericXml(entry, key, depth + 1))
      .filter(Boolean)
      .join("\n");
  }
  const record = asRecord(node);
  if (!record) return "";
  const lines: string[] = [];
  for (const [childKey, childValue] of Object.entries(record)) {
    if (childKey.startsWith("?")) continue;
    if (childKey.startsWith("@_")) {
      const attr = childKey.slice(2);
      if (attr === "href" || attr === "url" || attr === "id") {
        const rendered = renderGenericXml(childValue, attr, depth + 1);
        if (rendered) lines.push(rendered);
      }
      continue;
    }
    const rendered = renderGenericXml(childValue, childKey, depth + 1);
    if (rendered) lines.push(rendered);
  }
  return lines.join("\n");
}

function regexXmlText(xml: string): string {
  const withoutDoctype = xml.replace(/<!DOCTYPE\b[^>[]*(?:\[[\s\S]*?\]\s*)?>/gi, "");
  const withoutCdata = withoutDoctype.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  const stripped = withoutCdata.replace(/<[^>]+>/g, "\n");
  return stripped
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function genericXmlToText(xml: string): string {
  try {
    const rendered = renderGenericXml(xmlParser.parse(xml))
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (rendered) return rendered;
  } catch {
    // Fall through to a tag strip. External-entity errors land here too,
    // and this path does not fetch anything.
  }
  return regexXmlText(xml);
}

export function extractXmlDocument(xml: string, maxChars: number, matchUrl?: string) {
  const feed = parseFeedXml(xml);
  if (feed) {
    if (matchUrl) {
      const item = findFeedItem(feed, matchUrl);
      if (!item) {
        return {
          kind: "feed" as const,
          content: "",
          title: feed.title || undefined,
          description: feed.description,
          siteName: feed.title || undefined,
          truncated: false,
          contentLength: 0,
          visibleLength: 0,
          feedItemCount: feed.items.length,
          matchedFeedItem: false,
        };
      }
      const rendered = renderMatchedFeedItem(feed, item);
      const capped = capContent(rendered, maxChars);
      return {
        kind: "feed" as const,
        content: capped.content,
        title: item.title || feed.title || undefined,
        description: feed.description,
        siteName: feed.title || undefined,
        truncated: capped.truncated,
        contentLength: capped.contentLength,
        feedItemCount: feed.items.length,
        matchedFeedItem: true,
      };
    }
    const rendered = renderFeed(feed, maxChars);
    return {
      kind: "feed" as const,
      content: rendered.text,
      title: feed.title || undefined,
      description: feed.description,
      siteName: feed.title || undefined,
      truncated: rendered.truncated,
      contentLength: rendered.contentLength,
      feedItemCount: feed.items.length,
      matchedFeedItem: false,
      feedHeader: rendered.header,
      feedBlocks: rendered.blocks,
    };
  }

  const text = genericXmlToText(xml);
  const capped = capContent(text, maxChars);
  return {
    kind: "xml" as const,
    content: capped.content,
    truncated: capped.truncated,
    contentLength: capped.contentLength,
    matchedFeedItem: false,
  };
}
