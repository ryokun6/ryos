/**
 * Best-effort retail product lookup via public HTML/JSON scrapes.
 * Soft-fails on markup changes, captchas, timeouts, or network errors.
 */

import {
  normalizeTitleTokens,
  scoreTitleMatch,
} from "./_productLookupScore.js";
import { parseAmazonCardPrice } from "./_productPrice.js";

export type RetailLookupResult = {
  found: boolean;
  title?: string;
  brand?: string;
  imageUrl?: string;
  productUrl?: string;
  /** List / purchase price in major currency units when known. */
  originalPrice?: number;
  currency?: string;
  source?:
    | "amazon"
    | "duckduckgo_images"
    | "apple"
    | "itunes";
};

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
const APP_UA = "ryOS-Stuff/1.0 (https://os.ryo.lu)";
const SCRAPE_TIMEOUT_MS = 7000;

/** Env kill-switch for HTML scrapes (Amazon / DuckDuckGo / Apple.com). */
export function retailScrapesEnabled(): boolean {
  const raw = process.env.STUFF_DISABLE_RETAIL_SCRAPE?.trim().toLowerCase();
  return !(raw === "1" || raw === "true" || raw === "yes");
}

export function looksLikeAppleProductQuery(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  if (
    /\b(iphone|ipad|ipod|imac|macbook|mac\s*mini|mac\s*studio|mac\s*pro|airpods|homepod|apple\s*watch|vision\s*pro|apple\s*tv)\b/i.test(
      q
    )
  ) {
    return true;
  }
  const tokens = normalizeTitleTokens(q);
  return tokens[0] === "apple" && tokens.length >= 2;
}

/** Prefer App Store artwork only for software-ish queries (not hardware). */
export function looksLikeITunesSoftwareQuery(query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  if (looksLikeAppleProductQuery(q) && !/\b(app|apps|ios|ipados|macos)\b/i.test(q)) {
    return false;
  }
  return /\b(app|apps|ios app|mac app|iphone app|ipad app)\b/i.test(q);
}

const APPLE_SLUG_ALIASES: Record<string, string> = {
  airpods: "airpods",
  "airpods pro": "airpods-pro",
  "airpods max": "airpods-max",
  "airpods 4": "airpods-4",
  "macbook pro": "macbook-pro",
  "macbook air": "macbook-air",
  imac: "imac",
  "mac mini": "mac-mini",
  "mac studio": "mac-studio",
  "mac pro": "mac-pro",
  "apple watch": "watch",
  watch: "watch",
  "vision pro": "apple-vision-pro",
  "apple vision pro": "apple-vision-pro",
  "apple tv": "apple-tv",
  "apple tv 4k": "apple-tv-4k",
  homepod: "homepod",
  "homepod mini": "homepod-mini",
  iphone: "iphone",
  ipad: "ipad",
  "ipad pro": "ipad-pro",
  "ipad air": "ipad-air",
  "ipad mini": "ipad-mini",
};

function slugifyApplePath(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

/** Candidate Apple.com product paths for a free-text query. */
export function appleProductSlugCandidates(query: string): string[] {
  const tokens = normalizeTitleTokens(query);
  if (!tokens.length) return [];

  const joined = tokens.join(" ");
  const withoutApple = tokens[0] === "apple" ? tokens.slice(1).join(" ") : joined;
  const candidates: string[] = [];

  const push = (slug?: string) => {
    if (!slug) return;
    if (!candidates.includes(slug)) candidates.push(slug);
  };

  push(APPLE_SLUG_ALIASES[joined]);
  push(APPLE_SLUG_ALIASES[withoutApple]);

  // Drop trailing generation / size tokens: "iphone 15 pro max" → "iphone-15-pro-max", …
  for (let end = tokens.length; end >= 1; end--) {
    const slice = tokens.slice(0, end).join(" ");
    const stripped =
      tokens[0] === "apple" ? tokens.slice(1, end).join(" ") : slice;
    push(APPLE_SLUG_ALIASES[slice]);
    push(APPLE_SLUG_ALIASES[stripped]);
    push(slugifyApplePath(slice));
    if (stripped) push(slugifyApplePath(stripped));
  }

  return candidates.slice(0, 6);
}

export function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

/** Upgrade Amazon thumbnail URLs to a larger packshot-friendly size. */
export function upgradeAmazonImageUrl(url: string): string {
  return url
    .replace(/\._AC_[^.]+_\./, "._AC_SL1000_.")
    .replace(/\._SX\d+_\./, "._AC_SL1000_.")
    .replace(/\._UY\d+_\./, "._AC_SL1000_.");
}

export type ParsedRetailHit = {
  title: string;
  brand?: string;
  imageUrl?: string;
  productUrl?: string;
  originalPrice?: number;
  currency?: string;
};

function attr(tag: string, name: string): string | undefined {
  const re = new RegExp(
    `${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    "i"
  );
  const match = tag.match(re);
  return match?.[1] ?? match?.[2];
}

function isSponsoredAmazonCard(cardHtml: string): boolean {
  const head = cardHtml.slice(0, 2500);
  return (
    /\bAdHolder\b/i.test(head) ||
    /\bpuis-sponsored/i.test(head) ||
    /alt="Sponsored Ad/i.test(cardHtml.slice(0, 4000))
  );
}

/**
 * Parse Amazon search HTML for organic (non-sponsored) product packshots + price.
 * Prefers per-card `img.s-image` + `a-offscreen` price — soft-fails if markup changes.
 */
export function parseAmazonSearchHtml(
  html: string,
  query: string
): ParsedRetailHit | undefined {
  if (!html || /robot\s*check|enter the characters you see|opfcaptcha/i.test(html)) {
    return undefined;
  }

  // ASIN / AdHolder live on the wrapper *before* the split marker — keep a prefix.
  const parts = html.split(/data-component-type="s-search-result"/i);
  const hits: ParsedRetailHit[] = [];

  for (let i = 1; i < parts.length; i++) {
    const card = `${parts[i - 1].slice(-800)}${parts[i].slice(0, 14000)}`;
    if (isSponsoredAmazonCard(card)) continue;

    const tag =
      card.match(/<img\b[^>]*\bclass="[^"]*\bs-image\b[^"]*"[^>]*>/i)?.[0];
    if (!tag) continue;

    const alt = attr(tag, "alt");
    const src = attr(tag, "src") || attr(tag, "data-src");
    if (!alt || !src) continue;
    if (/^sponsored\s+ad/i.test(alt.trim())) continue;
    if (!/m\.media-amazon\.com\/images\//i.test(src)) continue;

    const title = decodeBasicHtmlEntities(alt).trim();
    if (title.length < 3) continue;

    const asin =
      card.match(/data-asin="([A-Z0-9]{10})"/i)?.[1] ??
      card.match(/data-csa-c-item-id="amzn1\.asin\.1\.([A-Z0-9]{10})"/i)?.[1] ??
      card.match(/\/dp\/([A-Z0-9]{10})/i)?.[1];

    const money = parseAmazonCardPrice(card);

    hits.push({
      title,
      imageUrl: upgradeAmazonImageUrl(src),
      productUrl: asin ? `https://www.amazon.com/dp/${asin}` : undefined,
      originalPrice: money?.amount,
      currency: money?.currency,
    });
  }

  // Fallback: older markup without search-result markers — image tags only.
  if (!hits.length) {
    const tags = html.match(/<img\b[^>]*\bclass="[^"]*\bs-image\b[^"]*"[^>]*>/gi) ?? [];
    for (const tag of tags) {
      const alt = attr(tag, "alt");
      const src = attr(tag, "src") || attr(tag, "data-src");
      if (!alt || !src || /^sponsored\s+ad/i.test(alt.trim())) continue;
      if (!/m\.media-amazon\.com\/images\//i.test(src)) continue;
      const title = decodeBasicHtmlEntities(alt).trim();
      if (title.length < 3) continue;
      const tagIndex = html.indexOf(tag);
      const nearby = html.slice(Math.max(0, tagIndex - 2500), tagIndex);
      const asin = [...nearby.matchAll(/data-asin="([A-Z0-9]{10})"/g)].at(-1)?.[1];
      const money = parseAmazonCardPrice(html.slice(tagIndex, tagIndex + 4000));
      hits.push({
        title,
        imageUrl: upgradeAmazonImageUrl(src),
        productUrl: asin ? `https://www.amazon.com/dp/${asin}` : undefined,
        originalPrice: money?.amount,
        currency: money?.currency,
      });
    }
  }

  if (!hits.length) return undefined;

  // Prefer strong title matches; break ties toward priced packshots.
  const ranked = [...hits].sort((a, b) => {
    const scoreDelta =
      scoreTitleMatch(b.title, query) - scoreTitleMatch(a.title, query);
    if (Math.abs(scoreDelta) > 0.05) return scoreDelta;
    return (b.originalPrice ? 1 : 0) - (a.originalPrice ? 1 : 0);
  });
  const best = ranked[0];
  if (scoreTitleMatch(best.title, query) < 0.75) return undefined;

  // Recover ASIN from the pre-card wrapper when the split dropped it.
  if (!best.productUrl) {
    const bestTag = html.includes(best.title)
      ? html.indexOf(best.title)
      : -1;
    if (bestTag >= 0) {
      const nearby = html.slice(Math.max(0, bestTag - 3000), bestTag);
      const asin = [...nearby.matchAll(/data-asin="([A-Z0-9]{10})"/g)].at(
        -1
      )?.[1];
      if (asin) best.productUrl = `https://www.amazon.com/dp/${asin}`;
    }
  }

  return best;
}

export type DuckDuckGoImageResult = {
  title?: string;
  image?: string;
  thumbnail?: string;
  url?: string;
  width?: number;
  height?: number;
  source?: string;
};

const RETAIL_IMAGE_HOST_HINTS = [
  "media-amazon.com",
  "ssl-images-amazon.com",
  "walmartimages.com",
  "targetimg1.com",
  "scene7.com",
  "bestbuy.com",
  "bhphoto.com",
  "apple.com",
  "samsung.com",
  "lg.com",
  "sony.com",
  "kitchenaid.com",
  "ikea.com",
  "homedepot.com",
  "lowes.com",
  "crateandbarrel.com",
  "nfm.com",
];

function retailImageHostBonus(imageUrl: string): number {
  try {
    const host = new URL(imageUrl).hostname.toLowerCase();
    if (RETAIL_IMAGE_HOST_HINTS.some((hint) => host.includes(hint))) return 0.45;
  } catch {
    /* ignore */
  }
  return 0;
}

function imageAspectBonus(width?: number, height?: number): number {
  if (!width || !height || width < 200 || height < 200) return -0.35;
  const ratio = width / height;
  if (ratio >= 0.75 && ratio <= 1.35) return 0.25; // packshot-ish
  if (ratio >= 0.5 && ratio <= 2) return 0.05;
  return -0.2;
}

/** Rank DuckDuckGo / Bing-backed image results for product packshots. */
export function pickBestDuckDuckGoImageResult(
  results: DuckDuckGoImageResult[] | undefined,
  query: string
): ParsedRetailHit | undefined {
  if (!results?.length) return undefined;

  const scored = results
    .map((entry) => {
      const title = entry.title?.trim();
      const imageUrl = (entry.image || entry.thumbnail || "").replace(
        /^http:\/\//i,
        "https://"
      );
      if (!title || !imageUrl) return null;
      if (!/^https:\/\//i.test(imageUrl)) return null;
      // Skip clearly non-product noise.
      if (/\b(logo|icon|sprite|favicon)\b/i.test(title)) return null;

      const score =
        scoreTitleMatch(title, query) +
        retailImageHostBonus(imageUrl) +
        imageAspectBonus(entry.width, entry.height);

      return {
        hit: {
          title,
          imageUrl,
          productUrl: entry.url?.replace(/^http:\/\//i, "https://"),
        } satisfies ParsedRetailHit,
        score,
      };
    })
    .filter((entry): entry is { hit: ParsedRetailHit; score: number } =>
      Boolean(entry)
    )
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best || best.score < 0.85) return undefined;
  return best.hit;
}

export function parseAppleProductPageHtml(
  html: string,
  query: string
): ParsedRetailHit | undefined {
  if (!html) return undefined;
  const title =
    html.match(/property="og:title"\s+content="([^"]+)"/i)?.[1] ||
    html.match(/property='og:title'\s+content='([^']+)'/i)?.[1];
  const image =
    html.match(/property="og:image:secure_url"\s+content="([^"]+)"/i)?.[1] ||
    html.match(/property="og:image"\s+content="([^"]+)"/i)?.[1] ||
    html.match(/property='og:image'\s+content='([^']+)'/i)?.[1];

  if (!title) return undefined;
  const decodedTitle = decodeBasicHtmlEntities(title).trim();
  // Avoid generic Apple.com chrome.
  if (/^apple$/i.test(decodedTitle)) return undefined;
  if (scoreTitleMatch(decodedTitle, query) < 0.55) return undefined;

  return {
    title: decodedTitle,
    brand: "Apple",
    imageUrl: image?.replace(/^http:\/\//i, "https://"),
  };
}

function hitToResult(
  hit: ParsedRetailHit,
  source: NonNullable<RetailLookupResult["source"]>
): RetailLookupResult {
  return {
    found: true,
    title: hit.title,
    brand: hit.brand,
    imageUrl: hit.imageUrl,
    productUrl: hit.productUrl,
    originalPrice: hit.originalPrice,
    currency: hit.currency,
    source,
  };
}

async function fetchText(
  url: string,
  init?: { headers?: Record<string, string>; timeoutMs?: number }
): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        ...init?.headers,
      },
      signal: AbortSignal.timeout(init?.timeoutMs ?? SCRAPE_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

async function fetchJson<T>(
  url: string,
  init?: { headers?: Record<string, string>; timeoutMs?: number }
): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": APP_UA,
        Accept: "application/json",
        ...init?.headers,
      },
      signal: AbortSignal.timeout(init?.timeoutMs ?? SCRAPE_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** Amazon.com keyword search scrape (title + packshot + optional ASIN URL). */
export async function lookupAmazonByTitle(
  title: string
): Promise<RetailLookupResult | null> {
  if (!retailScrapesEnabled()) return null;

  const html = await fetchText(
    `https://www.amazon.com/s?k=${encodeURIComponent(title)}`,
    {
      headers: {
        Accept: "text/html,application/xhtml+xml",
      },
    }
  );
  if (!html) return null;

  const hit = parseAmazonSearchHtml(html, title);
  if (!hit?.title) return null;
  return hitToResult(hit, "amazon");
}

function extractDuckDuckGoVqd(html: string): string | undefined {
  return (
    html.match(/vqd=["']([^"']+)["']/i)?.[1] ||
    html.match(/vqd:\s*["']([^"']+)["']/i)?.[1] ||
    html.match(/"vqd"\s*:\s*"([^"]+)"/i)?.[1]
  );
}

/**
 * DuckDuckGo image results (Bing-backed JSON). Good packshot fallback when
 * catalog APIs miss electronics / furniture / appliances.
 */
export async function lookupDuckDuckGoImagesByTitle(
  title: string
): Promise<RetailLookupResult | null> {
  if (!retailScrapesEnabled()) return null;

  const query = `${title} product`;
  const landing = await fetchText(
    `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
    {
      headers: { Accept: "text/html" },
    }
  );
  if (!landing) return null;

  const vqd = extractDuckDuckGoVqd(landing);
  if (!vqd) return null;

  const data = await fetchJson<{ results?: DuckDuckGoImageResult[] }>(
    `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${encodeURIComponent(vqd)}&f=,,,,,&p=1`,
    {
      headers: {
        "User-Agent": BROWSER_UA,
        Referer: "https://duckduckgo.com/",
        Accept: "application/json, text/javascript, */*; q=0.01",
      },
    }
  );

  const hit = pickBestDuckDuckGoImageResult(data?.results, title);
  if (!hit?.title) return null;
  return hitToResult(hit, "duckduckgo_images");
}

/** Apple.com product page Open Graph scrape for Apple hardware queries. */
export async function lookupAppleComByTitle(
  title: string
): Promise<RetailLookupResult | null> {
  if (!retailScrapesEnabled()) return null;
  if (!looksLikeAppleProductQuery(title)) return null;

  const slugs = appleProductSlugCandidates(title).slice(0, 3);
  const pages = await Promise.all(
    slugs.map(async (slug) => {
      const html = await fetchText(
        `https://www.apple.com/${encodeURIComponent(slug)}/`,
        { headers: { Accept: "text/html" } }
      );
      if (!html) return null;
      const hit = parseAppleProductPageHtml(html, title);
      if (!hit?.title) return null;
      return {
        ...hitToResult(hit, "apple"),
        productUrl: `https://www.apple.com/${slug}/`,
        brand: "Apple" as const,
        _score: scoreTitleMatch(hit.title, title),
      };
    })
  );

  const best = pages
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((a, b) => b._score - a._score)[0];
  if (!best) return null;
  const { _score: _ignored, ...result } = best;
  return result;
}

type ITunesTrack = {
  trackName?: string;
  collectionName?: string;
  artistName?: string;
  kind?: string;
  wrapperType?: string;
  artworkUrl100?: string;
  artworkUrl60?: string;
  trackViewUrl?: string;
  collectionViewUrl?: string;
  price?: number;
  currency?: string;
};

function itunesArtworkUrl(url?: string): string | undefined {
  if (!url) return undefined;
  return url.replace(/\/\d+x\d+bb\./, "/600x600bb.");
}

/** iTunes Search API — software / app artwork when the query looks app-related. */
export async function lookupITunesSoftwareByTitle(
  title: string
): Promise<RetailLookupResult | null> {
  if (!looksLikeITunesSoftwareQuery(title)) return null;

  const data = await fetchJson<{ results?: ITunesTrack[] }>(
    `https://itunes.apple.com/search?term=${encodeURIComponent(title)}&country=us&entity=software,iPadSoftware,macSoftware&limit=8`
  );
  const apps = (data?.results ?? []).filter(
    (entry) =>
      (entry.trackName || entry.collectionName) &&
      (entry.artworkUrl100 || entry.artworkUrl60)
  );
  if (!apps.length) return null;

  const ranked = [...apps].sort(
    (a, b) =>
      scoreTitleMatch(b.trackName || b.collectionName, title) -
      scoreTitleMatch(a.trackName || a.collectionName, title)
  );
  const best = ranked[0];
  const appTitle = best.trackName || best.collectionName;
  if (!appTitle || scoreTitleMatch(appTitle, title) < 0.75) return null;

  const price =
    typeof best.price === "number" && Number.isFinite(best.price) && best.price > 0
      ? best.price
      : undefined;

  return {
    found: true,
    title: appTitle,
    brand: best.artistName || "Apple",
    imageUrl: itunesArtworkUrl(best.artworkUrl100 || best.artworkUrl60),
    productUrl: best.trackViewUrl || best.collectionViewUrl,
    originalPrice: price,
    currency: best.currency || (price != null ? "USD" : undefined),
    source: "itunes",
  };
}
