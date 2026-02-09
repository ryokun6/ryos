const stripDiacritics = (value: string): string =>
  value.normalize("NFKD").replace(/\p{Diacritic}/gu, "");

export const normalizeSearchText = (value: string): string =>
  stripDiacritics(value).toLowerCase();

const isLooseSubsequence = (target: string, pattern: string): boolean => {
  if (pattern.length === 0) {
    return true;
  }

  let searchStart = 0;
  for (const char of pattern) {
    const foundIndex = target.indexOf(char, searchStart);
    if (foundIndex === -1) {
      return false;
    }
    searchStart = foundIndex + 1;
  }
  return true;
};

const levenshteinDistance = (a: string, b: string): number => {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const previous = new Array<number>(a.length + 1);
  const current = new Array<number>(a.length + 1);

  for (let i = 0; i <= a.length; i += 1) {
    previous[i] = i;
  }

  for (let i = 1; i <= b.length; i += 1) {
    current[0] = i;
    const bChar = b[i - 1]!;

    for (let j = 1; j <= a.length; j += 1) {
      const substitutionCost = bChar === a[j - 1]! ? 0 : 1;
      current[j] = Math.min(
        current[j - 1]! + 1, // insertion
        previous[j]! + 1, // deletion
        previous[j - 1]! + substitutionCost, // substitution
      );
    }

    for (let j = 0; j <= a.length; j += 1) {
      previous[j] = current[j]!;
    }
  }

  return previous[a.length]!;
};

const bestSubstringDistance = (text: string, query: string): number => {
  const textLength = text.length;
  const queryLength = query.length;

  if (queryLength === 0) return 0;
  if (textLength === 0) return queryLength;
  if (queryLength >= textLength) {
    return levenshteinDistance(text, query);
  }

  let best = Number.MAX_SAFE_INTEGER;
  const maxOffset = textLength - queryLength;

  for (let offset = 0; offset <= maxOffset; offset += 1) {
    const window = text.slice(offset, offset + queryLength);
    const distance = levenshteinDistance(window, query);
    if (distance < best) {
      best = distance;
      if (best === 0) {
        break;
      }
    }
  }

  return best;
};

export const computeMatchScore = (
  text: string,
  query: string,
  tokens: string[],
): number => {
  if (!query) return 1;
  if (!text) return 0;

  let score = 0;

  const includeIndex = text.indexOf(query);
  if (includeIndex !== -1) {
    const includeScore =
      0.7 +
      (1 - includeIndex / Math.max(text.length, query.length)) * 0.3;
    score = Math.max(score, Math.min(1, includeScore));
  }

  if (isLooseSubsequence(text, query)) {
    const subsequenceScore =
      0.5 +
      Math.min(
        0.4,
        (query.length / Math.max(text.length, query.length)) * 0.4,
      );
    score = Math.max(score, Math.min(1, subsequenceScore));
  }

  const maxLen = Math.max(query.length, Math.min(text.length, query.length));
  if (maxLen > 0) {
    const distance = bestSubstringDistance(text, query);
    const distanceScore = 1 - distance / (maxLen + 1);
    score = Math.max(score, Math.max(0, distanceScore));
  }

  if (tokens.length > 1) {
    let tokenAccumulator = 0;
    for (const token of tokens) {
      if (!token) continue;
      const tokenIndex = text.indexOf(token);
      if (tokenIndex !== -1) {
        tokenAccumulator += 1;
        continue;
      }
      const tokenMaxLen = Math.max(
        token.length,
        Math.min(text.length, token.length),
      );
      if (tokenMaxLen === 0) continue;
      const tokenDistance = bestSubstringDistance(text, token);
      const tokenScore = 1 - tokenDistance / (tokenMaxLen + 1);
      if (tokenScore > 0.5) {
        tokenAccumulator += tokenScore;
      }
    }
    if (tokenAccumulator > 0) {
      const normalizedTokenScore = tokenAccumulator / tokens.length;
      score = Math.max(score, Math.min(1, normalizedTokenScore));
    }
  }

  return Math.max(0, Math.min(1, score));
};

export const deriveScoreThreshold = (queryLength: number): number => {
  if (queryLength <= 2) return 0.65;
  if (queryLength <= 4) return 0.55;
  if (queryLength <= 6) return 0.5;
  if (queryLength <= 8) return 0.45;
  return 0.4;
};
