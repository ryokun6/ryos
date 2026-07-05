/**
 * Deterministic wallpaper name resolution for the AI `settings` tool.
 *
 * Replaces the previous fuzzy scoring (subsequence/Levenshtein), which was
 * unpredictable: near-miss queries could land on unrelated wallpapers. The
 * rules here are strict and ordered, so the same query always resolves the
 * same way:
 *
 *   1. exact name match (case/diacritic-insensitive; `-`, `_`, `/` and runs
 *      of whitespace are equivalent; the file extension is ignored)
 *   2. exact "category name" or full path match (e.g. "nature aurora",
 *      "photos/nature/aurora.jpg", "tiles/red_light.png")
 *   3. unique prefix match on the name
 *   4. unique substring match on the name or categorized path
 *
 * Anything else fails with suggestions the model can retry with, instead of
 * silently applying a wrong wallpaper.
 */

import type { WallpaperManifest } from "@/utils/wallpapers";
import { stripDiacritics } from "@/apps/chats/utils/fuzzySearch";

export interface WallpaperMatch {
  /** Absolute wallpaper path to feed `setWallpaper` (e.g. `/wallpapers/…`). */
  path: string;
  /** Human-readable name (file name without extension, separators as spaces). */
  label: string;
}

export interface WallpaperResolution {
  match: WallpaperMatch | null;
  /** When no unique match exists: candidate names the caller can surface. */
  suggestions: string[];
  /** True when the query matched several wallpapers instead of none. */
  ambiguous: boolean;
}

const MAX_SUGGESTIONS = 8;

/** Strip the file extension from a manifest-relative path. */
const withoutExtension = (relPath: string): string =>
  relPath.replace(/\.[^./]+$/, "");

/** Human-readable label for a manifest-relative wallpaper path. */
export const wallpaperLabelFromPath = (relPath: string): string => {
  const fileName = relPath.split("/").pop() || relPath;
  return withoutExtension(fileName).replace(/[-_]+/g, " ");
};

/**
 * Canonical comparison form: lowercase, diacritics stripped, extension
 * removed, and `-`/`_`/`/`/whitespace runs collapsed to single spaces.
 */
export const normalizeWallpaperName = (value: string): string =>
  stripDiacritics(withoutExtension(value))
    .toLowerCase()
    .replace(/[-_/\s]+/g, " ")
    .trim();

interface Candidate {
  relPath: string;
  label: string;
  /** Lowercased manifest path with extension, e.g. "tiles/azul_dark.png". */
  rawPath: string;
  /** Normalized bare name, e.g. "azul dark". */
  name: string;
  /** Normalized categorized path, e.g. "photos nature aurora". */
  path: string;
  /** Normalized "category name" variant, e.g. "nature aurora". */
  categoryName: string;
}

const buildCandidates = (manifest: WallpaperManifest): Candidate[] => {
  const relPaths: string[] = [
    ...(manifest.tiles || []),
    ...Object.values(manifest.photos || {}).flat(),
    ...(manifest.videos || []),
  ];
  return relPaths.map((relPath) => {
    const label = wallpaperLabelFromPath(relPath);
    const segments = withoutExtension(relPath).split("/");
    // Drop the "photos" prefix so "nature aurora" matches photos/nature/aurora.
    const categorySegments =
      segments[0] === "photos" ? segments.slice(1) : segments;
    return {
      relPath,
      label,
      rawPath: relPath.toLowerCase(),
      name: normalizeWallpaperName(label),
      path: normalizeWallpaperName(relPath),
      categoryName: normalizeWallpaperName(categorySegments.join(" ")),
    };
  });
};

const toMatch = (candidate: Candidate): WallpaperMatch => ({
  path: `/wallpapers/${candidate.relPath}`,
  label: candidate.label,
});

const uniqueLabels = (candidates: Candidate[]): string[] => {
  const labels: string[] = [];
  for (const candidate of candidates) {
    if (!labels.includes(candidate.label)) labels.push(candidate.label);
    if (labels.length >= MAX_SUGGESTIONS) break;
  }
  return labels;
};

/**
 * Resolve a wallpaper name against the manifest using the strict, ordered
 * rules documented above. Pure and synchronous for easy unit testing.
 */
export function resolveWallpaperFromManifest(
  manifest: WallpaperManifest,
  query: string
): WallpaperResolution {
  const normalizedQuery = normalizeWallpaperName(query);
  if (!normalizedQuery) {
    return { match: null, suggestions: [], ambiguous: false };
  }

  const candidates = buildCandidates(manifest);

  // 0. Exact manifest path (with extension) — distinguishes assets that only
  // differ by extension (e.g. tiles/default.jpg vs tiles/default.png).
  const rawQuery = query.trim().toLowerCase().replace(/^\/?wallpapers\//, "");
  const exactRaw = candidates.find((c) => c.rawPath === rawQuery);
  if (exactRaw) {
    return { match: toMatch(exactRaw), suggestions: [], ambiguous: false };
  }

  // 1. Exact name match (manifest order breaks rare cross-category ties).
  const exactName = candidates.filter((c) => c.name === normalizedQuery);
  if (exactName.length > 0) {
    return { match: toMatch(exactName[0]), suggestions: [], ambiguous: false };
  }

  // 2. Exact categorized-path match ("nature aurora", "photos/nature/aurora").
  const exactPath = candidates.filter(
    (c) => c.path === normalizedQuery || c.categoryName === normalizedQuery
  );
  if (exactPath.length > 0) {
    return { match: toMatch(exactPath[0]), suggestions: [], ambiguous: false };
  }

  // 3. Unique prefix match on the name.
  const prefixMatches = candidates.filter((c) =>
    c.name.startsWith(normalizedQuery)
  );
  if (prefixMatches.length === 1) {
    return {
      match: toMatch(prefixMatches[0]),
      suggestions: [],
      ambiguous: false,
    };
  }

  // 4. Unique substring match on the name or categorized path.
  const substringMatches =
    prefixMatches.length > 0
      ? prefixMatches
      : candidates.filter(
          (c) =>
            c.name.includes(normalizedQuery) ||
            c.categoryName.includes(normalizedQuery)
        );
  if (substringMatches.length === 1) {
    return {
      match: toMatch(substringMatches[0]),
      suggestions: [],
      ambiguous: false,
    };
  }
  if (substringMatches.length > 1) {
    return {
      match: null,
      suggestions: uniqueLabels(substringMatches),
      ambiguous: true,
    };
  }

  // No match at all: suggest wallpapers sharing any whole query token.
  const tokens = normalizedQuery.split(" ").filter(Boolean);
  const tokenMatches = candidates.filter((c) =>
    tokens.some(
      (token) => c.name.includes(token) || c.categoryName.includes(token)
    )
  );
  return {
    match: null,
    suggestions: uniqueLabels(tokenMatches),
    ambiguous: false,
  };
}
