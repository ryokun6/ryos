/**
 * Timezone preferences for the International control panel.
 *
 * The user picks an IANA timezone (e.g. "Asia/Taipei") or the sentinel
 * {@link AUTO_TIMEZONE}, which defers to the browser's resolved timezone. The
 * helpers here resolve the effective timezone, compute UTC offsets, and derive
 * map coordinates for the International world map marker.
 */

import { TIMEZONE_CITY_COORDS } from "./timezoneCityCoords";

/** Sentinel preference: follow the browser's reported timezone. */
export const AUTO_TIMEZONE = "auto";

/** localStorage key backing {@link useTimezoneStore} (zustand persist). */
export const TIMEZONE_STORAGE_KEY = "ryos:timezone";

/**
 * A timezone preference: either {@link AUTO_TIMEZONE} or an IANA timezone id.
 */
export type TimezonePreference = string;

/**
 * Curated fallback list for engines that lack `Intl.supportedValuesOf`.
 * Covers major offsets plus cities/countries users commonly search for.
 */
const FALLBACK_TIMEZONES: string[] = [
  "Pacific/Midway",
  "Pacific/Honolulu",
  "America/Adak",
  "America/Anchorage",
  "America/Vancouver",
  "America/Los_Angeles",
  "America/Tijuana",
  "America/Phoenix",
  "America/Denver",
  "America/Edmonton",
  "America/Mexico_City",
  "America/Chicago",
  "America/Winnipeg",
  "America/Bogota",
  "America/Lima",
  "America/New_York",
  "America/Toronto",
  "America/Havana",
  "America/Caracas",
  "America/Santiago",
  "America/Halifax",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "America/St_Johns",
  "Atlantic/South_Georgia",
  "Atlantic/Azores",
  "Atlantic/Reykjavik",
  "UTC",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Brussels",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Zurich",
  "Europe/Stockholm",
  "Europe/Warsaw",
  "Europe/Athens",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Africa/Casablanca",
  "Africa/Lagos",
  "Africa/Cairo",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Asia/Jerusalem",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Asia/Tehran",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Ho_Chi_Minh",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Macau",
  "Asia/Taipei",
  "Asia/Manila",
  "Asia/Singapore",
  "Asia/Kuala_Lumpur",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Perth",
  "Australia/Adelaide",
  "Australia/Darwin",
  "Australia/Brisbane",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Pacific/Guam",
  "Pacific/Port_Moresby",
  "Pacific/Fiji",
  "Pacific/Auckland",
];

/**
 * Extra searchable aliases (countries, regions, well-known cities) keyed by
 * IANA id. Complements path segments and Intl abbreviations.
 */
const TIMEZONE_SEARCH_ALIASES: Record<string, string> = {
  "America/Los_Angeles":
    "usa us united states california seattle san francisco sf la los angeles pacific pdt pst",
  "America/Vancouver": "canada british columbia vancouver pdt pst",
  "America/Denver": "usa us united states colorado denver mountain mdt mst",
  "America/Phoenix": "usa us arizona phoenix mst",
  "America/Chicago": "usa us united states texas chicago central cdt cst",
  "America/Mexico_City": "mexico ciudad de mexico central",
  "America/New_York":
    "usa us united states new york nyc boston miami washington dc eastern edt est",
  "America/Toronto": "canada ontario toronto eastern edt est",
  "America/Sao_Paulo": "brazil brasil sao paulo",
  "America/Argentina/Buenos_Aires": "argentina buenos aires",
  "America/Santiago": "chile santiago",
  "America/Bogota": "colombia bogota",
  "America/Lima": "peru lima",
  "America/Caracas": "venezuela caracas",
  "America/Havana": "cuba havana",
  "America/Anchorage": "usa us alaska anchorage akst akdt",
  "America/Halifax": "canada nova scotia halifax atlantic adt ast",
  "America/St_Johns": "canada newfoundland st johns",
  "Pacific/Honolulu": "usa us hawaii honolulu hst",
  "Europe/London": "uk united kingdom england britain gmt bst",
  "Europe/Dublin": "ireland dublin ist",
  "Europe/Paris": "france paris cet cest",
  "Europe/Berlin": "germany deutschland berlin cet cest",
  "Europe/Amsterdam": "netherlands holland amsterdam cet cest",
  "Europe/Brussels": "belgium brussels cet cest",
  "Europe/Madrid": "spain espana madrid cet cest",
  "Europe/Rome": "italy italia rome roma cet cest",
  "Europe/Zurich": "switzerland zurich cet cest",
  "Europe/Stockholm": "sweden stockholm cet cest",
  "Europe/Warsaw": "poland warsaw warszawa cet cest",
  "Europe/Athens": "greece athens eet eest",
  "Europe/Istanbul": "turkey turkiye istanbul",
  "Europe/Moscow": "russia moscow msk",
  "Europe/Lisbon": "portugal lisbon west",
  "Africa/Cairo": "egypt cairo",
  "Africa/Johannesburg": "south africa johannesburg",
  "Africa/Lagos": "nigeria lagos west africa",
  "Africa/Nairobi": "kenya nairobi east africa",
  "Africa/Casablanca": "morocco casablanca",
  "Asia/Dubai": "uae united arab emirates dubai gulf",
  "Asia/Riyadh": "saudi arabia riyadh",
  "Asia/Jerusalem": "israel palestine jerusalem",
  "Asia/Tehran": "iran tehran",
  "Asia/Karachi": "pakistan karachi",
  "Asia/Kolkata": "india bharat mumbai delhi bangalore calcutta ist",
  "Asia/Dhaka": "bangladesh dhaka",
  "Asia/Bangkok": "thailand bangkok indochina",
  "Asia/Jakarta": "indonesia jakarta wib",
  "Asia/Ho_Chi_Minh": "vietnam saigon ho chi minh",
  "Asia/Shanghai": "china prc beijing shanghai cst",
  "Asia/Hong_Kong": "hong kong hkt china",
  "Asia/Macau": "macau macao",
  "Asia/Taipei": "taiwan taipei roc",
  "Asia/Singapore": "singapore sg",
  "Asia/Kuala_Lumpur": "malaysia kuala lumpur",
  "Asia/Manila": "philippines manila",
  "Asia/Tokyo": "japan tokyo jst",
  "Asia/Seoul": "korea south korea seoul kst",
  "Australia/Sydney": "australia sydney aedt aest",
  "Australia/Melbourne": "australia melbourne aedt aest",
  "Australia/Brisbane": "australia brisbane aest",
  "Australia/Perth": "australia perth awst",
  "Australia/Adelaide": "australia adelaide acdt acst",
  "Australia/Darwin": "australia darwin acst",
  "Pacific/Auckland": "new zealand auckland nzdt nzst",
  "Pacific/Fiji": "fiji",
  "Pacific/Guam": "guam",
  UTC: "utc gmt coordinated universal zulu z",
};

/** Coarse region-prefix → country / area search tokens. */
const REGION_SEARCH_ALIASES: Record<string, string> = {
  Africa: "africa",
  America: "americas north america south america latin america",
  Antarctica: "antarctica",
  Arctic: "arctic",
  Asia: "asia",
  Atlantic: "atlantic",
  Australia: "australia oceania",
  Europe: "europe eu",
  Indian: "indian ocean",
  Pacific: "pacific oceania",
};

/** Zones treated as southern-hemisphere for map click tie-breaking. */
const SOUTHERN_HEMISPHERE_HINT =
  /Argentina|Santiago|Sao_Paulo|Montevideo|Asuncion|La_Paz|Lima|Sydney|Melbourne|Brisbane|Adelaide|Darwin|Perth|Hobart|Auckland|Fiji|Johannesburg|Buenos_Aires|Antarctica|Easter|Rarotonga|Tahiti|Apia|Tongatapu|Norfolk|Lord_Howe|Chatham|Enderbury|Fakaofo|Kiritimati/i;

/** The browser's resolved IANA timezone, or "UTC" when unavailable. */
export function getBrowserTimezone(): string {
  if (typeof Intl === "undefined") return "UTC";
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz !== "Unknown" ? tz : "UTC";
  } catch {
    return "UTC";
  }
}

/** Whether an IANA timezone id is accepted by the runtime. */
export function isValidTimezone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Full list of selectable IANA timezones, sorted alphabetically. Prefers the
 * runtime's `Intl.supportedValuesOf("timeZone")` and falls back to a curated
 * list. The {@link AUTO_TIMEZONE} sentinel is intentionally excluded.
 */
export function getSupportedTimezones(): string[] {
  try {
    const supportedValuesOf = (
      Intl as unknown as {
        supportedValuesOf?: (key: string) => string[];
      }
    ).supportedValuesOf;
    if (typeof supportedValuesOf === "function") {
      const list = supportedValuesOf("timeZone");
      if (Array.isArray(list) && list.length > 0) {
        return [...list].sort((a, b) => a.localeCompare(b));
      }
    }
  } catch {
    // Fall through to the curated list.
  }
  return [...FALLBACK_TIMEZONES].sort((a, b) => a.localeCompare(b));
}

/**
 * Groups timezones by their region prefix (the part before the first "/"),
 * e.g. "America", "Europe". Single-segment zones like "UTC" land under "Other".
 */
export function groupTimezonesByRegion(
  timezones: string[]
): { region: string; zones: string[] }[] {
  const groups = new Map<string, string[]>();
  for (const tz of timezones) {
    const slash = tz.indexOf("/");
    const region = slash === -1 ? "Other" : tz.slice(0, slash);
    const existing = groups.get(region);
    if (existing) {
      existing.push(tz);
    } else {
      groups.set(region, [tz]);
    }
  }
  return [...groups.entries()]
    .map(([region, zones]) => ({ region, zones }))
    .sort((a, b) => a.region.localeCompare(b.region));
}

/** Human-friendly label for an IANA id, e.g. "Asia/Hong_Kong" -> "Hong Kong". */
export function formatTimezoneCity(tz: string): string {
  const city = tz.split("/").pop() ?? tz;
  return city.replace(/_/g, " ");
}

/**
 * Short / long timezone names from Intl (e.g. PDT, PST, Pacific Daylight Time)
 * sampled in winter and summer so DST abbreviations are both searchable.
 */
export function getTimezoneNameVariants(
  tz: string,
  date = new Date()
): string[] {
  const year = date.getUTCFullYear();
  const samples = [
    date,
    new Date(Date.UTC(year, 0, 15, 12, 0, 0)),
    new Date(Date.UTC(year, 6, 15, 12, 0, 0)),
  ];
  const styles: Intl.DateTimeFormatOptions["timeZoneName"][] = [
    "short",
    "long",
    "shortOffset",
    "longOffset",
  ];
  const names = new Set<string>();
  for (const sample of samples) {
    for (const timeZoneName of styles) {
      try {
        const parts = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          timeZoneName,
        }).formatToParts(sample);
        const value = parts.find((p) => p.type === "timeZoneName")?.value;
        if (value) names.add(value);
      } catch {
        // Unsupported style or zone — skip.
      }
    }
  }
  return [...names];
}

/**
 * Lowercased search blob for combobox filtering: IANA path, city segments,
 * region, GMT/UTC offsets, Intl abbreviations (PDT/PST…), and country aliases.
 */
export function buildTimezoneSearchText(tz: string, date = new Date()): string {
  const slash = tz.indexOf("/");
  const region = slash === -1 ? "" : tz.slice(0, slash);
  const segments = tz.split("/").map((s) => s.replace(/_/g, " "));
  const city = formatTimezoneCity(tz);
  const offset = getTimezoneOffsetMinutes(tz, date);
  const offsetLabel = formatOffsetLabel(offset);
  const hours = offset / 60;
  const hourToken =
    Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace(/\.0$/, "");
  const variants = getTimezoneNameVariants(tz, date);
  const alias = TIMEZONE_SEARCH_ALIASES[tz] ?? "";
  const regionAlias = region ? (REGION_SEARCH_ALIASES[region] ?? "") : "";

  return [
    tz,
    tz.replace(/\//g, " "),
    ...segments,
    city,
    region,
    regionAlias,
    alias,
    offsetLabel,
    `utc${hourToken}`,
    `utc+${hourToken}`,
    `utc-${Math.abs(Number(hourToken))}`,
    `gmt${hourToken}`,
    `gmt+${hourToken}`,
    ...variants,
  ]
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type TimezoneCoordinates = {
  /** Degrees east-positive, [-180, 180]. */
  longitude: number;
  /** Degrees north-positive, [-90, 90]. */
  latitude: number;
  /** `city` when a known principal-city coordinate is used. */
  source: "city" | "estimated";
};

/**
 * Map position for a timezone: principal-city coordinates when known, otherwise
 * offset-derived longitude plus a latitude heuristic (so the marker is not
 * stuck on the equator).
 */
export function getTimezoneCoordinates(
  tz: string,
  date = new Date()
): TimezoneCoordinates {
  const known = TIMEZONE_CITY_COORDS[tz];
  if (known) {
    return {
      longitude: known[0],
      latitude: known[1],
      source: "city",
    };
  }

  const longitude = offsetMinutesToLongitude(
    getTimezoneOffsetMinutes(tz, date)
  );
  let latitude = 25;
  if (tz.startsWith("Antarctica/")) latitude = -75;
  else if (tz.startsWith("Arctic/")) latitude = 78;
  else if (SOUTHERN_HEMISPHERE_HINT.test(tz)) latitude = -30;
  else if (tz.startsWith("Australia/")) latitude = -25;
  else if (tz.startsWith("Pacific/")) latitude = -10;
  else if (tz.startsWith("Africa/")) latitude = 5;
  else if (tz.startsWith("Europe/")) latitude = 50;
  else if (tz.startsWith("Asia/")) latitude = 30;
  else if (tz.startsWith("America/")) latitude = 30;
  else if (tz === "UTC" || tz.startsWith("Etc/")) latitude = 0;

  return { longitude, latitude, source: "estimated" };
}

/** Great-circle-ish distance on an equirectangular plane (degrees²-ish). */
function geoDistanceScore(
  lonA: number,
  latA: number,
  lonB: number,
  latB: number
): number {
  let dLon = Math.abs(lonA - lonB);
  if (dLon > 180) dLon = 360 - dLon;
  const midLat = ((latA + latB) / 2) * (Math.PI / 180);
  const x = dLon * Math.cos(midLat);
  const y = latA - latB;
  return x * x + y * y;
}

/**
 * Pick the supported IANA zone whose representative city (or estimated
 * coordinates) is closest to the map click. Used by the International world
 * map click handler.
 */
export function findClosestTimezone(
  longitude: number,
  options?: {
    latitude?: number;
    date?: Date;
    timezones?: string[];
  }
): string {
  const zones = options?.timezones ?? getSupportedTimezones();
  if (zones.length === 0) return "UTC";

  const date = options?.date ?? new Date();
  const lat = options?.latitude ?? 0;

  let best = zones[0]!;
  let bestScore = Infinity;

  for (const tz of zones) {
    const coords = getTimezoneCoordinates(tz, date);
    const score = geoDistanceScore(
      longitude,
      lat,
      coords.longitude,
      coords.latitude
    );

    if (
      score < bestScore ||
      (score === bestScore && tz.localeCompare(best) < 0)
    ) {
      bestScore = score;
      best = tz;
    }
  }

  return best;
}

/** Wall-clock fields for an instant in a given IANA timezone. */
export type ZonedDateTimeParts = {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number; // 0–23
  minute: number;
  second: number;
};

/**
 * Calendar / clock fields for `date` as observed in `timeZone`. Falls back to
 * the host environment's local fields when the zone is invalid.
 */
export function getZonedDateTimeParts(
  date: Date,
  timeZone: string
): ZonedDateTimeParts {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts = dtf.formatToParts(date);
    const map: Record<string, number> = {};
    for (const part of parts) {
      if (part.type !== "literal") {
        map[part.type] = Number(part.value);
      }
    }
    return {
      year: map.year ?? date.getFullYear(),
      month: map.month ?? date.getMonth() + 1,
      day: map.day ?? date.getDate(),
      hour: map.hour ?? date.getHours(),
      minute: map.minute ?? date.getMinutes(),
      second: map.second ?? date.getSeconds(),
    };
  } catch {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
    };
  }
}

/** `YYYY-MM-DD` for `date` in `timeZone` (calendar day in that zone). */
export function formatZonedDateString(date: Date, timeZone: string): string {
  const { year, month, day } = getZonedDateTimeParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Minutes since local midnight in `timeZone` (for calendar "now" indicators). */
export function getZonedMinutesSinceMidnight(
  date: Date,
  timeZone: string
): number {
  const { hour, minute } = getZonedDateTimeParts(date, timeZone);
  return hour * 60 + minute;
}

/** Fractional hour-of-day in `timeZone` (0–24), for day/night gradients. */
export function getZonedFractionalHour(date: Date, timeZone: string): number {
  const { hour, minute, second } = getZonedDateTimeParts(date, timeZone);
  return hour + minute / 60 + second / 3600;
}

/**
 * Format an instant with `Intl` in a specific timezone (locale-aware display).
 */
export function formatInTimeZone(
  date: Date,
  timeZone: string,
  locale: string | undefined,
  options: Intl.DateTimeFormatOptions
): string {
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(
      date
    );
  } catch {
    return new Intl.DateTimeFormat(locale, options).format(date);
  }
}

/**
 * Current UTC offset (in minutes) for the timezone. Positive values are east of
 * UTC. Computed by comparing the zone's wall-clock time to the instant's UTC.
 */
export function getTimezoneOffsetMinutes(tz: string, date = new Date()): number {
  try {
    const map = getZonedDateTimeParts(date, tz);
    const asUTC = Date.UTC(
      map.year,
      map.month - 1,
      map.day,
      map.hour,
      map.minute,
      map.second
    );
    return Math.round((asUTC - date.getTime()) / 60000);
  } catch {
    return 0;
  }
}

/** Formats an offset in minutes as a "GMT±H[:MM]" label. */
export function formatOffsetLabel(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = abs % 60;
  return minutes === 0
    ? `GMT${sign}${hours}`
    : `GMT${sign}${hours}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Approximate central longitude (degrees, east-positive, [-180, 180]) for a UTC
 * offset, used to orient the globe. Earth rotates 15° per hour (1° per 4 min).
 */
export function offsetMinutesToLongitude(offsetMinutes: number): number {
  const longitude = offsetMinutes / 4;
  return Math.max(-180, Math.min(180, longitude));
}

/** Resolves a preference to a concrete IANA timezone id. */
export function resolveEffectiveTimezone(
  preference: TimezonePreference | null | undefined
): string {
  if (!preference || preference === AUTO_TIMEZONE) {
    return getBrowserTimezone();
  }
  return isValidTimezone(preference) ? preference : getBrowserTimezone();
}

/** Reads the persisted timezone preference directly from localStorage. */
export function readPersistedTimezonePreference(): TimezonePreference {
  if (typeof window === "undefined") return AUTO_TIMEZONE;
  try {
    const raw = window.localStorage.getItem(TIMEZONE_STORAGE_KEY);
    if (!raw) return AUTO_TIMEZONE;
    const parsed = JSON.parse(raw) as { state?: { timezone?: string } };
    const value = parsed?.state?.timezone;
    return typeof value === "string" && value ? value : AUTO_TIMEZONE;
  } catch {
    return AUTO_TIMEZONE;
  }
}

/**
 * Effective IANA timezone for display and API headers: resolves the given
 * preference (or the persisted International setting) through
 * {@link resolveEffectiveTimezone}.
 */
export function getEffectiveTimezone(
  preference?: TimezonePreference | null
): string {
  return resolveEffectiveTimezone(
    preference === undefined ? readPersistedTimezonePreference() : preference
  );
}
