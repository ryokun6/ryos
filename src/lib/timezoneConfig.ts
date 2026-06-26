/**
 * Timezone preferences for the International control panel.
 *
 * The user picks an IANA timezone (e.g. "Asia/Taipei") or the sentinel
 * {@link AUTO_TIMEZONE}, which defers to the browser's resolved timezone. The
 * helpers here resolve the effective timezone, compute UTC offsets, and derive
 * an approximate longitude so the globe visualization can rotate to face it.
 */

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
 * Covers every UTC offset plus the cities most users recognize.
 */
const FALLBACK_TIMEZONES: string[] = [
  "Pacific/Midway",
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Caracas",
  "America/Halifax",
  "America/Sao_Paulo",
  "Atlantic/South_Georgia",
  "Atlantic/Azores",
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Athens",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Tehran",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Taipei",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Perth",
  "Australia/Sydney",
  "Pacific/Guam",
  "Pacific/Auckland",
];

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
