import type { TFunction } from "i18next";
import type { StuffLocation } from "../types";

/** Canonical slug suffixes for seeded default locations (`stuff-location-default:<slug>`). */
export const STUFF_DEFAULT_LOCATION_SLUGS = [
  "closet",
  "storage",
  "carry-on",
  "checked-in",
  "box",
] as const;

export type StuffDefaultLocationSlug =
  (typeof STUFF_DEFAULT_LOCATION_SLUGS)[number];

const DEFAULT_LOCATION_SLUG_SET = new Set<string>(STUFF_DEFAULT_LOCATION_SLUGS);

const STUFF_LOCATION_DEFAULT_PREFIX = "stuff-location-default:";

/** Slugify a location name the same way as the stable default id ("Carry On" → "carry-on"). */
function slugifyLocationName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * Resolve a localization slug for a seeded default location.
 * Prefers stable `stuff-location-default:<slug>` ids; falls back to the
 * (slugified) name so pre-stable-id rows still localize.
 */
export function stuffDefaultLocationSlug(
  location: StuffLocation
): StuffDefaultLocationSlug | null {
  if (location.id.startsWith(STUFF_LOCATION_DEFAULT_PREFIX)) {
    const slug = location.id.slice(STUFF_LOCATION_DEFAULT_PREFIX.length);
    if (DEFAULT_LOCATION_SLUG_SET.has(slug)) {
      return slug as StuffDefaultLocationSlug;
    }
  }
  const bySlug = slugifyLocationName(location.name);
  if (DEFAULT_LOCATION_SLUG_SET.has(bySlug)) {
    return bySlug as StuffDefaultLocationSlug;
  }
  return null;
}

/** Localized label for UI; custom locations keep their stored name. */
export function stuffLocationDisplayName(
  location: StuffLocation,
  t: TFunction
): string {
  const slug = stuffDefaultLocationSlug(location);
  if (!slug) return location.name;
  return t(`apps.stuff.defaultLocations.${slug}`, {
    defaultValue: location.name,
  });
}
