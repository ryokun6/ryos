import type { TFunction } from "i18next";
import type { StuffTag } from "../types";

/** Canonical English names / id suffixes for seeded default tags. */
export const STUFF_DEFAULT_TAG_SLUGS = [
  "kitchen",
  "electronics",
  "clothing",
  "books",
  "furniture",
  "cd",
  "other",
] as const;

export type StuffDefaultTagSlug = (typeof STUFF_DEFAULT_TAG_SLUGS)[number];

const DEFAULT_TAG_SLUG_SET = new Set<string>(STUFF_DEFAULT_TAG_SLUGS);

/**
 * Resolve a localization slug for a seeded default tag.
 * Prefers stable `stuff-default:<slug>` ids; falls back to canonical English name
 * so pre-stable-id tags still localize.
 */
export function stuffDefaultTagSlug(tag: StuffTag): StuffDefaultTagSlug | null {
  if (tag.id.startsWith("stuff-default:")) {
    const slug = tag.id.slice("stuff-default:".length);
    if (DEFAULT_TAG_SLUG_SET.has(slug)) {
      return slug as StuffDefaultTagSlug;
    }
  }
  const byName = tag.name.trim().toLowerCase();
  if (DEFAULT_TAG_SLUG_SET.has(byName)) {
    return byName as StuffDefaultTagSlug;
  }
  return null;
}

/** Localized label for UI; custom tags keep their stored name. */
export function stuffTagDisplayName(tag: StuffTag, t: TFunction): string {
  const slug = stuffDefaultTagSlug(tag);
  if (!slug) return tag.name;
  return t(`apps.stuff.defaultTags.${slug}`, { defaultValue: tag.name });
}
