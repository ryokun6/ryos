import { fetchProductImageAsDataUrl } from "./_productImage.js";
import {
  normalizeTitleTokens,
  scoreTitleMatch,
  sourcePackshotBoost,
} from "./_productLookupScore.js";
import {
  parseMoneyAmount,
  pickOfferMoney,
} from "./_productPrice.js";
import {
  lookupAmazonByTitle,
  lookupAppleComByTitle,
  lookupDuckDuckGoImagesByTitle,
  lookupITunesSoftwareByTitle,
} from "./_productRetailLookup.js";

export { scoreTitleMatch, normalizeTitleTokens } from "./_productLookupScore.js";
export { parseMoneyAmount, pickOfferMoney } from "./_productPrice.js";

const USER_AGENT = "ryOS-Stuff/1.0 (https://os.ryo.lu)";
const FETCH_TIMEOUT_MS = 8000;

export type ProductQueryKind = "isbn" | "barcode" | "title";

export interface ProductLookupResult {
  found: boolean;
  queryKind?: ProductQueryKind;
  title?: string;
  /** Manufacturer, publisher, or joined author list for books. */
  brand?: string;
  authors?: string[];
  imageUrl?: string;
  /** Populated server-side when cover download succeeds. */
  imageDataUrl?: string;
  productUrl?: string;
  source?: string;
  isbn?: string;
  /** List / purchase price in major currency units when a source provides one. */
  originalPrice?: number;
  /** ISO currency code paired with `originalPrice` (e.g. USD). */
  currency?: string;
}

/** Cap for multi-result picker responses. */
export const PRODUCT_LOOKUP_MAX_RESULTS = 8;

/**
 * API / client payload: primary fields mirror the best hit (backward compatible)
 * plus a ranked `results` list for the picker.
 */
export interface ProductLookupResponse extends ProductLookupResult {
  results: ProductLookupResult[];
}

type OpenLibraryDoc = {
  title?: string;
  author_name?: string[];
  cover_i?: number;
  isbn?: string[];
  key?: string;
};

type GoogleVolumeInfo = {
  title?: string;
  authors?: string[];
  imageLinks?: {
    extraLarge?: string;
    large?: string;
    medium?: string;
    small?: string;
    thumbnail?: string;
    smallThumbnail?: string;
  };
  infoLink?: string;
  industryIdentifiers?: Array<{ type?: string; identifier?: string }>;
};

type GoogleSaleInfo = {
  listPrice?: { amount?: number; currencyCode?: string };
  retailPrice?: { amount?: number; currencyCode?: string };
};

type UpcItem = {
  title?: string;
  brand?: string;
  images?: string[];
  offers?: Array<{
    link?: string;
    price?: number | string;
    list_price?: number | string;
    currency?: string;
  }>;
};

type OpenFactsProduct = {
  product_name?: string;
  product_name_en?: string;
  brands?: string;
  image_url?: string;
  image_front_url?: string;
  image_front_small_url?: string;
  url?: string;
  code?: string;
  /** Rare / experimental; present on some Open Prices-linked products. */
  price?: number | string;
  pricing?: string | number;
};

type WikipediaPage = {
  pageid?: number;
  title?: string;
  index?: number;
  thumbnail?: { source?: string };
  original?: { source?: string };
  terms?: { description?: string[] };
};

export function classifyProductQuery(raw: string): {
  kind: ProductQueryKind;
  normalized: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { kind: "title", normalized: "" };
  }

  const isbnCandidate = trimmed.replace(/[-\s]/g, "").toUpperCase();
  if (/^(97[89]\d{10}|\d{9}[\dX])$/.test(isbnCandidate)) {
    return { kind: "isbn", normalized: isbnCandidate };
  }

  const compact = trimmed.replace(/\s+/g, "");
  const digits = compact.replace(/\D/g, "");
  if (
    digits.length >= 8 &&
    digits.length <= 14 &&
    digits.length === compact.length
  ) {
    return { kind: "barcode", normalized: digits };
  }

  return { kind: "title", normalized: trimmed };
}

function httpsImageUrl(url?: string): string | undefined {
  if (!url) return undefined;
  return url.replace(/^http:\/\//i, "https://");
}

function joinAuthors(authors?: string[]): string | undefined {
  if (!authors?.length) return undefined;
  return authors.join(", ");
}

function bestGoogleBooksImage(
  imageLinks?: GoogleVolumeInfo["imageLinks"]
): string | undefined {
  if (!imageLinks) return undefined;
  const raw =
    imageLinks.extraLarge ??
    imageLinks.large ??
    imageLinks.medium ??
    imageLinks.small ??
    imageLinks.thumbnail ??
    imageLinks.smallThumbnail;
  if (!raw) return undefined;
  return httpsImageUrl(
    raw.replace(/&zoom=\d+/i, "&zoom=0").replace(/&edge=curl/i, "")
  );
}

function resolveIsbn(identifiers?: GoogleVolumeInfo["industryIdentifiers"]): string | undefined {
  return (
    identifiers?.find((entry) => entry.type === "ISBN_13")?.identifier ??
    identifiers?.find((entry) => entry.type === "ISBN_10")?.identifier
  );
}

function openLibraryCoverUrl(doc: OpenLibraryDoc, fallbackIsbn?: string): string | undefined {
  if (doc.cover_i) {
    return `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
  }
  const isbn =
    doc.isbn?.find((value) => /^\d{10,13}$/.test(value)) ?? fallbackIsbn;
  if (isbn) {
    return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg`;
  }
  return undefined;
}

function compareScoredCandidates<T>(
  a: T,
  b: T,
  scoreOf: (item: T) => number,
  hasImageOf: (item: T) => boolean
): number {
  const aImage = hasImageOf(a) ? 1 : 0;
  const bImage = hasImageOf(b) ? 1 : 0;
  if (aImage !== bImage) return bImage - aImage;
  return scoreOf(b) - scoreOf(a);
}

/** Prefer entries with cover art; fall back to first titled hit. */
export function pickBestOpenLibraryDoc(
  docs?: OpenLibraryDoc[],
  query?: string
): OpenLibraryDoc | undefined {
  if (!docs?.length) return undefined;
  const titled = docs.filter((entry) => entry.title);
  if (!titled.length) return undefined;
  if (!query) {
    return (
      titled.find((entry) => entry.cover_i) ?? titled[0]
    );
  }
  return [...titled].sort((a, b) =>
    compareScoredCandidates(
      a,
      b,
      (entry) => scoreTitleMatch(entry.title, query),
      (entry) => Boolean(entry.cover_i)
    )
  )[0];
}

/** Prefer catalog items that include product imagery and match the query. */
export function pickBestUpcItem(
  items?: UpcItem[],
  query?: string
): UpcItem | undefined {
  if (!items?.length) return undefined;
  const titled = items.filter((entry) => entry.title);
  if (!titled.length) return undefined;
  if (!query) {
    return (
      titled.find((entry) => entry.images?.[0]) ?? titled[0]
    );
  }
  const ranked = [...titled].sort((a, b) =>
    compareScoredCandidates(
      a,
      b,
      (entry) => scoreTitleMatch(entry.title, query),
      (entry) => Boolean(entry.images?.[0])
    )
  );
  const best = ranked[0];
  // Drop weak accessory / merch / unrelated hits (e.g. RAM or tee for a product name).
  if (scoreTitleMatch(best.title, query) < 0.85) return undefined;
  return best;
}

/** Prefer Open*Facts products that include a front image and match the query. */
export function pickBestOpenFactsProduct(
  products?: OpenFactsProduct[],
  query?: string
): OpenFactsProduct | undefined {
  if (!products?.length) return undefined;
  const titled = products.filter(
    (entry) => entry.product_name_en || entry.product_name
  );
  if (!titled.length) return undefined;
  const titleOf = (entry: OpenFactsProduct) =>
    entry.product_name_en || entry.product_name;
  const hasImage = (entry: OpenFactsProduct) =>
    Boolean(
      entry.image_front_url || entry.image_url || entry.image_front_small_url
    );
  if (!query) {
    return titled.find(hasImage) ?? titled[0];
  }
  const ranked = [...titled].sort((a, b) =>
    compareScoredCandidates(
      a,
      b,
      (entry) => scoreTitleMatch(titleOf(entry), query),
      hasImage
    )
  );
  const best = ranked[0];
  if (scoreTitleMatch(titleOf(best), query) < 0.45) return undefined;
  return best;
}

/** Prefer Wikipedia search hits with a lead image and a strong title match. */
export function pickBestWikipediaPage(
  pages?: Record<string, WikipediaPage> | WikipediaPage[],
  query?: string
): WikipediaPage | undefined {
  const list = Array.isArray(pages)
    ? pages
    : pages
      ? Object.values(pages)
      : [];
  const titled = list.filter((page) => page.title);
  if (!titled.length) return undefined;

  const hasImage = (page: WikipediaPage) =>
    Boolean(page.original?.source || page.thumbnail?.source);

  if (!query) {
    const ranked = [...titled].sort(
      (a, b) =>
        (a.index ?? Number.MAX_SAFE_INTEGER) -
        (b.index ?? Number.MAX_SAFE_INTEGER)
    );
    return ranked.find(hasImage) ?? ranked[0];
  }

  const ranked = [...titled].sort((a, b) => {
    const byScore = compareScoredCandidates(
      a,
      b,
      (page) => scoreTitleMatch(page.title, query),
      hasImage
    );
    if (byScore !== 0) return byScore;
    return (
      (a.index ?? Number.MAX_SAFE_INTEGER) -
      (b.index ?? Number.MAX_SAFE_INTEGER)
    );
  });
  const best = ranked[0];
  // Require most query tokens (avoids "Mixer (appliance)" for "KitchenAid mixer").
  if (scoreTitleMatch(best.title, query) < 0.75) return undefined;
  return best;
}

/** Best-effort manufacturer extraction from Wikipedia short descriptions. */
export function brandFromWikipediaDescription(
  description?: string
): string | undefined {
  if (!description) return undefined;
  // Only trust explicit manufacturer phrasing, not incidental "from …" copy.
  const match = description.match(
    /\b(?:manufactured|made|designed|sold|produced)\b[^.]{0,80}?\bby\s+([A-Z][\w.&'’\-]+(?:\s+[A-Z][\w.&'’\-]+){0,5})/
  );
  if (!match?.[1]) return undefined;
  return match[1]
    .replace(/,?\s*(Inc\.?|Ltd\.?|LLC\.?|Corp\.?)$/i, "")
    .trim() || undefined;
}

type MergeOptions = { query?: string };

function preferLookupResult(
  primary: ProductLookupResult,
  secondary: ProductLookupResult,
  query?: string
): ProductLookupResult {
  const primaryImage = Boolean(primary.imageUrl);
  const secondaryImage = Boolean(secondary.imageUrl);

  if (!query) {
    // Without a query, still prefer retail packshot sources when both have images.
    if (primaryImage && secondaryImage) {
      const boostDelta =
        sourcePackshotBoost(secondary.source) - sourcePackshotBoost(primary.source);
      if (boostDelta > 0.2) return secondary;
    }
    return primaryImage ? primary : secondaryImage ? secondary : primary;
  }

  const primaryScore =
    scoreTitleMatch(primary.title, query) + sourcePackshotBoost(primary.source);
  const secondaryScore =
    scoreTitleMatch(secondary.title, query) + sourcePackshotBoost(secondary.source);

  if (primaryImage !== secondaryImage) {
    const imaged = primaryImage ? primary : secondary;
    const plain = primaryImage ? secondary : primary;
    const imagedScore = primaryImage ? primaryScore : secondaryScore;
    const plainScore = primaryImage ? secondaryScore : primaryScore;
    // Keep image preference unless the imaged hit is a poor match.
    // Retail packshots get a little more leash vs bare Wikipedia titles.
    const imageSlack = sourcePackshotBoost(imaged.source) >= 0.3 ? 0.55 : 0.35;
    if (imagedScore + imageSlack >= plainScore || imagedScore >= 0.75) {
      return imaged;
    }
    return plain;
  }

  if (secondaryScore > primaryScore + 0.15) return secondary;
  // Near-ties: prefer retail packshot sources over Wikipedia / books.
  if (
    Math.abs(secondaryScore - primaryScore) <= 0.15 &&
    sourcePackshotBoost(secondary.source) >
      sourcePackshotBoost(primary.source) + 0.2
  ) {
    return secondary;
  }
  return primary;
}

/** Merge two hits, preferring images and stronger title relevance when query is known. */
export function mergeProductResults(
  primary: ProductLookupResult | null,
  secondary: ProductLookupResult | null,
  options?: MergeOptions
): ProductLookupResult | null {
  if (!primary && !secondary) return null;
  if (!primary) return secondary;
  if (!secondary) return primary;

  const preferred = preferLookupResult(primary, secondary, options?.query);
  const other = preferred === primary ? secondary : primary;
  const preferredIsBook =
    preferred.source === "openlibrary" || preferred.source === "google_books";
  const otherUsefulForMetadata =
    !options?.query ||
    scoreTitleMatch(other.title, options.query) + 0.3 >=
      scoreTitleMatch(preferred.title, options.query);

  const originalPrice =
    preferred.originalPrice ??
    (otherUsefulForMetadata ? other.originalPrice : undefined);
  let currency =
    preferred.currency ?? (otherUsefulForMetadata ? other.currency : undefined);
  if (originalPrice != null && !currency) currency = "USD";

  return {
    found: true,
    title: preferred.title ?? other.title,
    brand:
      preferred.brand ?? (otherUsefulForMetadata ? other.brand : undefined),
    // Do not copy cookbook/manual authors onto general product hits.
    authors: preferred.authors ?? (preferredIsBook ? other.authors : undefined),
    imageUrl: preferred.imageUrl ?? other.imageUrl,
    productUrl:
      preferred.productUrl ??
      (otherUsefulForMetadata ? other.productUrl : undefined),
    source: preferred.source ?? other.source,
    isbn: preferred.isbn ?? other.isbn,
    originalPrice,
    currency,
  };
}

/** Left-fold merge; earlier args win on ties when both sides have images. */
export function mergeAllProductResults(
  results: Array<ProductLookupResult | null | undefined>,
  options?: MergeOptions
): ProductLookupResult | null {
  return results.reduce<ProductLookupResult | null>(
    (acc, cur) => mergeProductResults(acc, cur ?? null, options),
    null
  );
}

function candidateRankScore(
  result: ProductLookupResult,
  query?: string
): number {
  const titleScore = query ? scoreTitleMatch(result.title, query) : 0;
  const imageBoost = result.imageUrl ? 0.5 : 0;
  return titleScore + imageBoost + sourcePackshotBoost(result.source);
}

function candidateDedupeKey(result: ProductLookupResult): string {
  return normalizeTitleTokens(result.title || "").join(" ");
}

/**
 * Rank distinct source hits for the multi-result picker (best first).
 * Dedupes near-identical titles, keeping the higher-scoring hit.
 */
export function rankProductLookupCandidates(
  candidates: Array<ProductLookupResult | null | undefined>,
  query?: string,
  limit = PRODUCT_LOOKUP_MAX_RESULTS
): ProductLookupResult[] {
  const found = candidates.filter(
    (entry): entry is ProductLookupResult =>
      Boolean(entry?.found && entry.title?.trim())
  );
  if (!found.length) return [];

  const ranked = [...found].sort(
    (a, b) => candidateRankScore(b, query) - candidateRankScore(a, query)
  );

  const deduped: ProductLookupResult[] = [];
  const seen = new Set<string>();
  for (const entry of ranked) {
    const key = candidateDedupeKey(entry);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push({ ...entry, found: true });
    if (deduped.length >= limit) break;
  }
  return deduped;
}

function toProductLookupResponse(
  candidates: ProductLookupResult[],
  queryKind: ProductQueryKind,
  options?: { query?: string; preferMergedPrimary?: boolean }
): ProductLookupResponse {
  if (!candidates.length) {
    return { found: false, queryKind, results: [] };
  }
  const withKind = candidates.map((entry) => ({ ...entry, queryKind }));
  const primary =
    options?.preferMergedPrimary
      ? mergeAllProductResults(withKind, { query: options.query }) ?? withKind[0]
      : withKind[0];
  return {
    ...primary,
    found: true,
    queryKind,
    results: withKind,
  };
}

async function fetchJson<T>(
  url: string,
  init?: { headers?: Record<string, string> }
): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, ...init?.headers },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function upcItemDbConfig(): {
  baseUrl: string;
  headers?: Record<string, string>;
} {
  const userKey = process.env.UPCITEMDB_USER_KEY?.trim();
  if (userKey) {
    return {
      baseUrl: "https://api.upcitemdb.com/prod/v1",
      headers: {
        user_key: userKey,
        key_type: "userkey",
        Accept: "application/json",
      },
    };
  }
  return { baseUrl: "https://api.upcitemdb.com/prod/trial" };
}

function openLibraryResultFromDoc(
  doc: OpenLibraryDoc,
  fallbackIsbn?: string
): ProductLookupResult {
  const isbn =
    doc.isbn?.find((value) => /^\d{10,13}$/.test(value)) ?? fallbackIsbn;
  return {
    found: true,
    title: doc.title!,
    brand: joinAuthors(doc.author_name),
    authors: doc.author_name,
    imageUrl: openLibraryCoverUrl(doc, fallbackIsbn),
    productUrl: doc.key
      ? `https://openlibrary.org${doc.key}`
      : isbn
        ? `https://openlibrary.org/isbn/${encodeURIComponent(isbn)}`
        : undefined,
    source: "openlibrary",
    isbn,
  };
}

function googleBooksResultFromInfo(
  info: GoogleVolumeInfo,
  fallbackIsbn?: string,
  saleInfo?: GoogleSaleInfo
): ProductLookupResult {
  const isbn = resolveIsbn(info.industryIdentifiers) ?? fallbackIsbn;
  const list =
    parseMoneyAmount(
      saleInfo?.listPrice?.amount,
      saleInfo?.listPrice?.currencyCode || "USD"
    ) ??
    parseMoneyAmount(
      saleInfo?.retailPrice?.amount,
      saleInfo?.retailPrice?.currencyCode || "USD"
    );
  return {
    found: true,
    title: info.title!,
    brand: joinAuthors(info.authors),
    authors: info.authors,
    imageUrl: bestGoogleBooksImage(info.imageLinks),
    productUrl: info.infoLink,
    source: "google_books",
    isbn,
    originalPrice: list?.amount,
    currency: list?.currency,
  };
}

function upcItemToResult(item: UpcItem): ProductLookupResult {
  const money = pickOfferMoney(item.offers);
  return {
    found: true,
    title: item.title!,
    brand: item.brand || undefined,
    imageUrl: httpsImageUrl(item.images?.[0]),
    productUrl: item.offers?.[0]?.link,
    source: "upcitemdb",
    originalPrice: money?.amount,
    currency: money?.currency,
  };
}

function openFactsProductToResult(
  product: OpenFactsProduct,
  source: "openfoodfacts" | "openproductsfacts"
): ProductLookupResult | null {
  const title = product.product_name_en || product.product_name || undefined;
  if (!title) return null;

  const code = product.code?.trim();
  const productUrl =
    product.url ||
    (code
      ? source === "openproductsfacts"
        ? `https://world.openproductsfacts.org/product/${encodeURIComponent(code)}`
        : `https://world.openfoodfacts.org/product/${encodeURIComponent(code)}`
      : undefined);

  const money =
    parseMoneyAmount(product.price) ?? parseMoneyAmount(product.pricing);

  return {
    found: true,
    title,
    brand: product.brands || undefined,
    imageUrl: httpsImageUrl(
      product.image_front_url ||
        product.image_url ||
        product.image_front_small_url
    ),
    productUrl,
    source,
    originalPrice: money?.amount,
    currency: money?.currency,
  };
}

function wikipediaPageToResult(page: WikipediaPage): ProductLookupResult {
  const description = page.terms?.description?.[0];
  return {
    found: true,
    title: page.title!,
    brand: brandFromWikipediaDescription(description),
    imageUrl: httpsImageUrl(page.original?.source || page.thumbnail?.source),
    productUrl: page.title
      ? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`
      : undefined,
    source: "wikipedia",
  };
}

export async function lookupOpenLibraryByIsbn(
  isbn: string
): Promise<ProductLookupResult | null> {
  const data = await fetchJson<{ docs?: OpenLibraryDoc[] }>(
    `https://openlibrary.org/search.json?isbn=${encodeURIComponent(isbn)}&limit=3`
  );
  const doc = pickBestOpenLibraryDoc(data?.docs, isbn);
  if (!doc?.title) return null;
  return openLibraryResultFromDoc(doc, isbn);
}

export async function lookupOpenLibraryByTitle(
  title: string
): Promise<ProductLookupResult | null> {
  const data = await fetchJson<{ docs?: OpenLibraryDoc[] }>(
    `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=10`
  );
  const doc = pickBestOpenLibraryDoc(data?.docs, title);
  if (!doc?.title) return null;
  return openLibraryResultFromDoc(doc);
}

export async function lookupGoogleBooksByIsbn(
  isbn: string
): Promise<ProductLookupResult | null> {
  const data = await fetchJson<{
    items?: Array<{ volumeInfo?: GoogleVolumeInfo; saleInfo?: GoogleSaleInfo }>;
  }>(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}&maxResults=3`
  );
  const item =
    data?.items?.find(
      (entry) =>
        entry.volumeInfo?.title &&
        bestGoogleBooksImage(entry.volumeInfo.imageLinks)
    ) ?? data?.items?.[0];
  const info = item?.volumeInfo;
  if (!info?.title) return null;
  return googleBooksResultFromInfo(info, isbn, item?.saleInfo);
}

export async function lookupGoogleBooksByTitle(
  title: string
): Promise<ProductLookupResult | null> {
  const data = await fetchJson<{
    items?: Array<{ volumeInfo?: GoogleVolumeInfo; saleInfo?: GoogleSaleInfo }>;
  }>(
    `https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(title)}&maxResults=8`
  );
  const item =
    data?.items?.find(
      (entry) =>
        entry.volumeInfo?.title &&
        bestGoogleBooksImage(entry.volumeInfo.imageLinks)
    ) ?? data?.items?.[0];
  const info = item?.volumeInfo;
  if (!info?.title) return null;
  return googleBooksResultFromInfo(info, undefined, item?.saleInfo);
}

export async function lookupOpenFoodFacts(
  barcode: string
): Promise<ProductLookupResult | null> {
  const data = await fetchJson<{
    status?: number;
    product?: OpenFactsProduct;
  }>(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`
  );
  if (data?.status !== 1 || !data.product) return null;
  return openFactsProductToResult(data.product, "openfoodfacts");
}

async function lookupOpenFactsByTitle(
  title: string,
  source: "openfoodfacts" | "openproductsfacts"
): Promise<ProductLookupResult | null> {
  const host =
    source === "openproductsfacts"
      ? "world.openproductsfacts.org"
      : "world.openfoodfacts.org";
  const fields = [
    "product_name",
    "product_name_en",
    "brands",
    "image_front_url",
    "image_url",
    "image_front_small_url",
    "url",
    "code",
    "price",
  ].join(",");

  const searchOnce = async (terms: string) =>
    fetchJson<{ products?: OpenFactsProduct[] }>(
      `https://${host}/cgi/search.pl?search_terms=${encodeURIComponent(terms)}&search_simple=1&action=process&json=1&page_size=8&fields=${fields}`
    );

  let data = await searchOnce(title);
  // Open*Facts full-phrase search is often empty for "Brand product"; retry brand token.
  // Only retry on an empty hit list — not on network/timeout null (avoids doubling latency).
  if (data && !data.products?.length) {
    const brandToken = normalizeTitleTokens(title)[0];
    if (brandToken && brandToken.length >= 4 && brandToken !== title.toLowerCase()) {
      data = await searchOnce(brandToken);
    }
  }

  const product = pickBestOpenFactsProduct(data?.products, title);
  if (!product) return null;
  return openFactsProductToResult(product, source);
}

export async function lookupOpenFoodFactsByTitle(
  title: string
): Promise<ProductLookupResult | null> {
  return lookupOpenFactsByTitle(title, "openfoodfacts");
}

export async function lookupOpenProductsFactsByTitle(
  title: string
): Promise<ProductLookupResult | null> {
  return lookupOpenFactsByTitle(title, "openproductsfacts");
}

export async function lookupUpcItemDb(
  barcode: string
): Promise<ProductLookupResult | null> {
  const { baseUrl, headers } = upcItemDbConfig();
  const data = await fetchJson<{ items?: UpcItem[] }>(
    `${baseUrl}/lookup?upc=${encodeURIComponent(barcode)}`,
    { headers }
  );
  const item = pickBestUpcItem(data?.items);
  if (!item?.title) return null;
  return upcItemToResult(item);
}

/** Keyword search against UPCitemdb (trial endpoint, or paid when UPCITEMDB_USER_KEY is set). */
export async function lookupUpcItemDbByTitle(
  title: string
): Promise<ProductLookupResult | null> {
  const { baseUrl, headers } = upcItemDbConfig();
  const data = await fetchJson<{ items?: UpcItem[] }>(
    `${baseUrl}/search?s=${encodeURIComponent(title)}&match_mode=0&type=product`,
    { headers }
  );
  const item = pickBestUpcItem(data?.items, title);
  if (!item?.title) return null;
  return upcItemToResult(item);
}

/** Wikipedia search + pageimages for notable products (no API key). */
export async function lookupWikipediaByTitle(
  title: string
): Promise<ProductLookupResult | null> {
  const data = await fetchJson<{
    query?: { pages?: Record<string, WikipediaPage> };
  }>(
    `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(title)}&gsrlimit=5&prop=pageimages|pageterms&piprop=thumbnail|original&pithumbsize=800&wbptterms=description&format=json&origin=*`
  );
  const page = pickBestWikipediaPage(data?.query?.pages, title);
  if (!page?.title) return null;
  return wikipediaPageToResult(page);
}

/**
 * Resolve product metadata for barcode, ISBN, or free-text queries.
 *
 * Title (free-text) search fans out in parallel to retail scrapes (Amazon,
 * DuckDuckGo images, Apple.com / iTunes when relevant), catalog APIs
 * (UPCitemdb, Open Products/Food Facts), Wikipedia, and book APIs, then ranks
 * distinct source hits for the picker (primary fields = best hit).
 */
export async function resolveProductLookup(
  rawQuery: string
): Promise<ProductLookupResponse> {
  const { kind, normalized } = classifyProductQuery(rawQuery);
  if (!normalized) {
    return { found: false, queryKind: kind, results: [] };
  }

  if (kind === "isbn") {
    const [openLibrary, googleBooks, upc] = await Promise.all([
      lookupOpenLibraryByIsbn(normalized),
      lookupGoogleBooksByIsbn(normalized),
      lookupUpcItemDb(normalized),
    ]);
    const upcWithIsbn = upc
      ? { ...upc, isbn: upc.isbn ?? normalized }
      : null;
    return toProductLookupResponse(
      rankProductLookupCandidates(
        [openLibrary, googleBooks, upcWithIsbn],
        normalized
      ),
      "isbn",
      { query: normalized, preferMergedPrimary: true }
    );
  }

  if (kind === "barcode") {
    const [openFoodFacts, upc] = await Promise.all([
      lookupOpenFoodFacts(normalized),
      lookupUpcItemDb(normalized),
    ]);
    let candidates: Array<ProductLookupResult | null> = [openFoodFacts, upc];

    if (/^97[89]\d{10}$/.test(normalized)) {
      const needBooks = !openFoodFacts?.imageUrl && !upc?.imageUrl;
      if (needBooks || (!openFoodFacts && !upc)) {
        const [openLibrary, googleBooks] = await Promise.all([
          lookupOpenLibraryByIsbn(normalized),
          lookupGoogleBooksByIsbn(normalized),
        ]);
        candidates = [...candidates, openLibrary, googleBooks];
      }
    }

    return toProductLookupResponse(
      rankProductLookupCandidates(candidates, normalized),
      "barcode",
      { query: normalized, preferMergedPrimary: true }
    );
  }

  // Free-text: retail scrapes + catalogs + books in parallel.
  const [
    amazonTitle,
    ddgImagesTitle,
    appleTitle,
    itunesTitle,
    upcTitle,
    openProductsTitle,
    openFoodTitle,
    wikipediaTitle,
    openLibraryTitle,
    googleBooksTitle,
  ] = await Promise.all([
    lookupAmazonByTitle(normalized),
    lookupDuckDuckGoImagesByTitle(normalized),
    lookupAppleComByTitle(normalized),
    lookupITunesSoftwareByTitle(normalized),
    lookupUpcItemDbByTitle(normalized),
    lookupOpenProductsFactsByTitle(normalized),
    lookupOpenFoodFactsByTitle(normalized),
    lookupWikipediaByTitle(normalized),
    lookupOpenLibraryByTitle(normalized),
    lookupGoogleBooksByTitle(normalized),
  ]);

  // Prefer retail/catalog ordering when a solid product hit exists so cookbooks
  // don't dominate the top of the picker; otherwise lead with wiki/books.
  const retailMerged = mergeAllProductResults(
    [amazonTitle, appleTitle, itunesTitle],
    { query: normalized }
  );
  const catalogMerged = mergeAllProductResults(
    [upcTitle, openProductsTitle, openFoodTitle],
    { query: normalized }
  );
  const productMerged = mergeProductResults(retailMerged, catalogMerged, {
    query: normalized,
  });
  const productLooksSolid =
    Boolean(productMerged?.imageUrl) &&
    scoreTitleMatch(productMerged?.title, normalized) +
      sourcePackshotBoost(productMerged?.source) >=
      0.85;

  const orderedSources = productLooksSolid
    ? [
        amazonTitle,
        appleTitle,
        itunesTitle,
        upcTitle,
        openProductsTitle,
        openFoodTitle,
        wikipediaTitle,
        openLibraryTitle,
        googleBooksTitle,
        ddgImagesTitle,
      ]
    : [
        wikipediaTitle,
        openLibraryTitle,
        googleBooksTitle,
        amazonTitle,
        appleTitle,
        itunesTitle,
        upcTitle,
        openProductsTitle,
        openFoodTitle,
        ddgImagesTitle,
      ];

  return toProductLookupResponse(
    rankProductLookupCandidates(orderedSources, normalized),
    "title"
  );
}

/** Resolve metadata and download cover server-side for the best hit. */
export async function resolveProductLookupWithImage(
  rawQuery: string
): Promise<ProductLookupResponse> {
  const result = await resolveProductLookup(rawQuery);
  if (!result.found || !result.imageUrl) {
    return result;
  }

  const imageDataUrl = await fetchProductImageAsDataUrl(result.imageUrl);
  if (!imageDataUrl) {
    return result;
  }

  const results = result.results.map((entry) =>
    entry.imageUrl === result.imageUrl ? { ...entry, imageDataUrl } : entry
  );
  return { ...result, imageDataUrl, results };
}
