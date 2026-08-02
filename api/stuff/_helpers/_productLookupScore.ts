/** Shared title-relevance scoring for Stuff product lookup sources. */

export function normalizeTitleTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

/**
 * Score how well a catalog title matches the user query.
 * Exact / phrase matches beat long accessory listings that merely mention tokens.
 */
export function scoreTitleMatch(title: string | undefined, query: string): number {
  if (!title?.trim() || !query.trim()) return 0;
  const q = normalizeTitleTokens(query).join(" ");
  const t = normalizeTitleTokens(title).join(" ");
  if (!q || !t) return 0;

  const qTokens = q.split(" ");
  const tTokens = t.split(" ");
  let matched = 0;
  for (const qt of qTokens) {
    if (tTokens.some((tt) => tt === qt || (qt.length >= 3 && tt.includes(qt)))) {
      matched += 1;
    }
  }

  let score = matched / qTokens.length;
  if (t === q) score += 1.5;
  else if (t.startsWith(q)) score += 1.25;
  else if (t.includes(q)) score += 0.85;
  else if (q.includes(t) && t.length >= 3) score += 0.75;

  // Prefer titles that lead with the query's first token (brand / product name).
  if (tTokens[0] && qTokens[0] && tTokens[0] === qTokens[0]) {
    score += 0.35;
  }

  // Penalize long marketplace listings where the query is only a buried mention.
  // Keep modest products like "KitchenAid Ultra Power … Stand Mixer" (all tokens
  // present, moderate length) while rejecting accessory SKUs that merely mention
  // the product name among many unrelated tokens.
  const coverage = qTokens.length / Math.max(tTokens.length, 1);
  const allTokensMatched = matched === qTokens.length;
  if (!allTokensMatched) {
    if (coverage < 0.34) score -= 0.55;
    if (coverage < 0.2) score -= 0.55;
  } else if (coverage < 0.25) {
    score -= 1.1;
  } else if (coverage < 0.34) {
    score -= 0.2;
  }

  const lengthRatio = tTokens.length / Math.max(qTokens.length, 1);
  if (lengthRatio > 4) score -= 0.35;
  if (lengthRatio > 8) score -= 0.35;

  // Downrank merch/fan listings unless the query itself asked for them.
  const merchTokens = [
    "tee",
    "tshirt",
    "shirt",
    "poster",
    "sticker",
    "hoodie",
    "mug",
    "case",
  ];
  const queryHasMerch = qTokens.some((token) => merchTokens.includes(token));
  if (
    !queryHasMerch &&
    tTokens.some((token) => merchTokens.includes(token) || token === "graphic")
  ) {
    score -= 1;
  }

  return score;
}

/** Retail / catalog sources that usually carry real product packshots. */
export const RETAIL_PRODUCT_SOURCES = new Set([
  "amazon",
  "apple",
  "duckduckgo_images",
  "itunes",
  "upcitemdb",
  "openproductsfacts",
  "openfoodfacts",
]);

export function isRetailProductSource(source?: string): boolean {
  return Boolean(source && RETAIL_PRODUCT_SOURCES.has(source));
}

/** Tie-break boost so packshot retail beats Wikipedia merch / random wiki images. */
export function sourcePackshotBoost(source?: string): number {
  switch (source) {
    case "amazon":
    case "apple":
      return 0.55;
    case "upcitemdb":
    case "itunes":
      return 0.4;
    case "openproductsfacts":
    case "openfoodfacts":
      return 0.3;
    // Image-search filler: useful packshots, but weaker than catalogs / books.
    case "duckduckgo_images":
      return 0.15;
    case "wikipedia":
      return 0;
    case "openlibrary":
    case "google_books":
      return -0.05;
    default:
      return 0;
  }
}
