import type { RedisLike } from "./redis.js";
import {
  GoogleApiError,
  getGoogleApiUrls,
  getValidGoogleAccessToken,
  saveLinkedGoogleAccount,
} from "./google-oauth.js";
import { normalizeUserTimeZone } from "./auth/_user-record.js";
import {
  GOOGLE_CALENDAR_SCOPE,
  type GoogleCalendarAccessRole,
  type GoogleCalendarDeletedRemoteEvent,
  type GoogleCalendarDeletionInput,
  type GoogleCalendarPushedItem,
  type GoogleCalendarSyncResponse,
  type GoogleEventColor,
  type GoogleSyncedCalendarEvent,
  type GoogleSyncedCalendarGroup,
} from "../../src/shared/contracts/google.js";
import {
  mapGoogleCalendarListColor,
  mapGoogleEventColorIdToColor,
} from "../../src/shared/calendarColors.js";

export const DEFAULT_GOOGLE_CALENDAR_ID = "primary";
export const CALENDAR_SYNC_SCHEMA_VERSION = 2;

const MAX_CALENDAR_PAGES = 20;
const PAGE_SIZE = 250;
const MAX_SYNCED_CALENDARS = 12;
const MAX_MUTATIONS_PER_SYNC = 200;
const FULL_SYNC_PAST_DAYS = 365;
const FULL_SYNC_FUTURE_DAYS = 730;
const UPSTREAM_TIMEOUT_MS = 15_000;

interface GoogleCalendarDateTime {
  date?: string | null;
  dateTime?: string | null;
  timeZone?: string | null;
}

export interface GoogleRawCalendarEvent {
  id?: string;
  status?: string;
  etag?: string;
  summary?: string;
  description?: string;
  location?: string;
  colorId?: string;
  recurringEventId?: string;
  created?: string;
  updated?: string;
  start?: GoogleCalendarDateTime;
  end?: GoogleCalendarDateTime;
  extendedProperties?: {
    private?: Record<string, string>;
  };
}

export interface GoogleRawCalendarListEntry {
  id?: string;
  summary?: string;
  summaryOverride?: string;
  colorId?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  selected?: boolean;
  primary?: boolean;
  deleted?: boolean;
  hidden?: boolean;
  accessRole?: string;
}

interface GoogleCalendarListResponse {
  items?: GoogleRawCalendarListEntry[];
  nextPageToken?: string;
}

interface GoogleEventsListResponse {
  items?: GoogleRawCalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

export function addDaysYmd(ymd: string, deltaDays: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return ymd;
  const utc = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]) + deltaDays
  );
  const d = new Date(utc);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatIsoInTimeZone(
  iso: string,
  timeZone: string
): { date: string; time: string } | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const rawHour = get("hour");
  const hour = rawHour === "24" ? "00" : rawHour;
  const minute = get("minute");

  if (!year || !month || !day || !hour || !minute) {
    return null;
  }
  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
  };
}

function encodeSafeSlug(raw: string, maxLen: number): string {
  const trimmed = raw.trim();
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed) && trimmed.length <= maxLen) {
    return trimmed;
  }
  return Buffer.from(trimmed, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
    .slice(0, maxLen);
}

export function buildDeterministicGoogleCalendarGroupId(
  googleCalendarId: string = DEFAULT_GOOGLE_CALENDAR_ID
): string {
  const trimmed = googleCalendarId.trim() || DEFAULT_GOOGLE_CALENDAR_ID;
  if (trimmed === DEFAULT_GOOGLE_CALENDAR_ID) {
    return "gcal_cal_primary";
  }
  return `gcal_cal_${encodeSafeSlug(trimmed, 96)}`;
}

export function buildDeterministicGoogleCalendarEventId(
  googleEventId: string,
  calendarId: string = DEFAULT_GOOGLE_CALENDAR_ID
): string {
  const prefix =
    calendarId === DEFAULT_GOOGLE_CALENDAR_ID
      ? "gcal"
      : `gcal_${encodeSafeSlug(calendarId, 32)}`;
  const safeId = googleEventId.trim();
  if (/^[a-zA-Z0-9_-]{1,160}$/.test(safeId)) {
    return `${prefix}_${safeId}`;
  }
  return `${prefix}_${encodeSafeSlug(safeId, 120)}`;
}

function parseTimestampOrFallback(
  iso: string | undefined,
  fallback: number
): number {
  if (!iso) return fallback;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function mapGoogleCalendarListEntryToRyos(
  entry: GoogleRawCalendarListEntry,
  fallbackName?: string | null
): GoogleSyncedCalendarGroup | null {
  const rawId = entry.id?.trim();
  if (!rawId || entry.deleted || entry.hidden) {
    return null;
  }
  const role = entry.accessRole?.trim();
  if (role === "freeBusyReader") {
    return null;
  }

  const isPrimary = Boolean(entry.primary) || rawId === DEFAULT_GOOGLE_CALENDAR_ID;
  const googleCalendarId = isPrimary ? DEFAULT_GOOGLE_CALENDAR_ID : rawId;
  const accessRole: GoogleCalendarAccessRole =
    role === "owner" || role === "writer"
      ? role
      : isPrimary
        ? "owner"
        : "reader";
  const readOnly = accessRole === "reader";

  const name =
    entry.summaryOverride?.trim() ||
    entry.summary?.trim() ||
    (isPrimary ? fallbackName?.trim() || "Google Calendar" : rawId);

  const color = mapGoogleCalendarListColor({
    backgroundColor: entry.backgroundColor,
    colorId: entry.colorId,
  });

  return {
    id: buildDeterministicGoogleCalendarGroupId(googleCalendarId),
    name,
    color,
    googleCalendarId,
    ...(rawId !== googleCalendarId ? { googleAccountCalendarId: rawId } : {}),
    ...(entry.colorId?.trim() ? { googleColorId: entry.colorId.trim() } : {}),
    ...(isPrimary ? { googlePrimary: true } : {}),
    googleAccessRole: accessRole,
    readOnly,
    selected: entry.selected !== false,
  };
}

export function mapGoogleEventToRyos(
  raw: GoogleRawCalendarEvent,
  options: {
    timeZone: string;
    preferredLocalId?: string;
    preferredCalendarId?: string;
    googleCalendarId?: string;
    calendarColor?: GoogleEventColor;
  }
): GoogleSyncedCalendarEvent | null {
  const googleEventId = raw.id?.trim();
  if (!googleEventId || raw.status === "cancelled") {
    return null;
  }

  const googleCalendarId =
    options.googleCalendarId || DEFAULT_GOOGLE_CALENDAR_ID;
  const privateRyosId = raw.extendedProperties?.private?.ryosEventId?.trim();
  const id =
    options.preferredLocalId ||
    privateRyosId ||
    buildDeterministicGoogleCalendarEventId(googleEventId, googleCalendarId);

  const explicitColorId = raw.colorId?.trim() || undefined;
  const explicitEventHex = explicitColorId
    ? mapGoogleEventColorIdToColor(explicitColorId)
    : null;
  const inheritedCalendarColor: GoogleEventColor =
    options.calendarColor || "#039be5";
  const color: GoogleEventColor = explicitEventHex || inheritedCalendarColor;

  const updatedAt = parseTimestampOrFallback(raw.updated, 0);
  const createdAt = parseTimestampOrFallback(raw.created, updatedAt);

  let date = "";
  let endDate: string | undefined;
  let startTime: string | undefined;
  let endTime: string | undefined;

  if (raw.start?.date) {
    date = raw.start.date.trim();
    if (raw.end?.date) {
      const inclusiveEnd = addDaysYmd(raw.end.date.trim(), -1);
      if (inclusiveEnd > date) {
        endDate = inclusiveEnd;
      }
    }
  } else if (raw.start?.dateTime) {
    const startParts = formatIsoInTimeZone(
      raw.start.dateTime,
      options.timeZone
    );
    if (!startParts) return null;
    date = startParts.date;
    startTime = startParts.time;

    if (raw.end?.dateTime) {
      const endParts = formatIsoInTimeZone(raw.end.dateTime, options.timeZone);
      if (endParts) {
        endTime = endParts.date > date ? "23:59" : endParts.time;
      }
    }
    if (!endTime) {
      const [hh, mm] = startTime.split(":").map(Number);
      const nextHour = Math.min(23, (hh || 0) + 1);
      endTime = `${String(nextHour).padStart(2, "0")}:${String(mm || 0).padStart(2, "0")}`;
    }
  } else {
    return null;
  }

  const title = (raw.summary || "").trim() || "Untitled Event";
  const location = (raw.location || "").trim() || undefined;
  const notes = (raw.description || "").trim() || undefined;
  const defaultCalendarGroupId =
    buildDeterministicGoogleCalendarGroupId(googleCalendarId);

  return {
    id,
    title,
    date,
    ...(endDate ? { endDate } : {}),
    ...(startTime ? { startTime } : {}),
    ...(endTime ? { endTime } : {}),
    color,
    calendarId: options.preferredCalendarId || defaultCalendarGroupId,
    ...(location ? { location } : {}),
    ...(notes ? { notes } : {}),
    googleEventId,
    googleCalendarId,
    ...(explicitColorId && explicitEventHex
      ? { googleColorId: explicitColorId }
      : {}),
    ...(raw.etag ? { googleEtag: raw.etag } : {}),
    ...(raw.recurringEventId
      ? { googleRecurringEventId: raw.recurringEventId }
      : {}),
    googleSyncedUpdatedAt: updatedAt,
    createdAt,
    updatedAt,
  };
}

function computeTimedEnd(
  date: string,
  startTime: string,
  endTime?: string
): { endDate: string; endTime: string } {
  const parseMinutes = (hhmm: string): number => {
    const [h, m] = hhmm.split(":").map((n) => Number(n));
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  };

  const startMins = parseMinutes(startTime);
  if (endTime && /^\d{2}:\d{2}$/.test(endTime)) {
    const endMins = parseMinutes(endTime);
    if (endMins > startMins) {
      return { endDate: date, endTime };
    }
    if (endMins < startMins) {
      return { endDate: addDaysYmd(date, 1), endTime };
    }
  }

  const plusHour = startMins + 60;
  const endDate = plusHour >= 24 * 60 ? addDaysYmd(date, 1) : date;
  const wrapped = ((plusHour % (24 * 60)) + 24 * 60) % (24 * 60);
  const hh = String(Math.floor(wrapped / 60)).padStart(2, "0");
  const mm = String(wrapped % 60).padStart(2, "0");
  return { endDate, endTime: `${hh}:${mm}` };
}

export function buildGoogleEventPayload(
  event: GoogleSyncedCalendarEvent,
  timeZone: string,
  isPatch: boolean
): Record<string, unknown> {
  const isAllDay = !event.startTime;
  const start = isAllDay
    ? isPatch
      ? { date: event.date, dateTime: null, timeZone: null }
      : { date: event.date }
    : isPatch
      ? {
          date: null,
          dateTime: `${event.date}T${event.startTime}:00`,
          timeZone,
        }
      : {
          dateTime: `${event.date}T${event.startTime}:00`,
          timeZone,
        };

  const end = isAllDay
    ? (() => {
        const exclusiveEnd = addDaysYmd(event.endDate || event.date, 1);
        return isPatch
          ? { date: exclusiveEnd, dateTime: null, timeZone: null }
          : { date: exclusiveEnd };
      })()
    : (() => {
        const resolved = computeTimedEnd(
          event.date,
          event.startTime!,
          event.endTime
        );
        return isPatch
          ? {
              date: null,
              dateTime: `${resolved.endDate}T${resolved.endTime}:00`,
              timeZone,
            }
          : {
              dateTime: `${resolved.endDate}T${resolved.endTime}:00`,
              timeZone,
            };
      })();

  // Only include `colorId` when an explicit per-event override exists (or `null`
  // on PATCH to clear an existing override back to calendar inheritance).
  // Never stamp a default `colorId` onto events that inherit their calendar color.
  const colorPatch: Record<string, unknown> =
    event.googleColorId === null
      ? isPatch
        ? { colorId: null }
        : {}
      : typeof event.googleColorId === "string" &&
          event.googleColorId.trim().length > 0
        ? { colorId: event.googleColorId.trim() }
        : {};

  return {
    summary: event.title || "Untitled Event",
    location: event.location || "",
    description: event.notes || "",
    ...colorPatch,
    start,
    end,
    extendedProperties: {
      private: {
        ryosEventId: event.id,
      },
    },
  };
}

async function googleCalendarFetch(
  path: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<Response> {
  const { calendarBaseUrl } = getGoogleApiUrls();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(`${calendarBaseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function buildFallbackPrimaryCalendar(
  fallbackName?: string | null
): GoogleSyncedCalendarGroup {
  return {
    id: buildDeterministicGoogleCalendarGroupId(DEFAULT_GOOGLE_CALENDAR_ID),
    name: fallbackName?.trim() || "Google Calendar",
    color: "#039be5",
    googleCalendarId: DEFAULT_GOOGLE_CALENDAR_ID,
    googlePrimary: true,
    googleAccessRole: "owner",
    readOnly: false,
    selected: true,
  };
}

async function listGoogleCalendars(params: {
  accessToken: string;
  fallbackName?: string | null;
}): Promise<GoogleSyncedCalendarGroup[]> {
  const rawEntries: GoogleRawCalendarListEntry[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < 5; page += 1) {
    const qs = new URLSearchParams();
    qs.set("maxResults", String(PAGE_SIZE));
    if (pageToken) {
      qs.set("pageToken", pageToken);
    }

    const res = await googleCalendarFetch(
      `/users/me/calendarList?${qs.toString()}`,
      params.accessToken
    );

    if (res.status === 404 && page === 0) {
      return [buildFallbackPrimaryCalendar(params.fallbackName)];
    }
    if (res.status === 401 || res.status === 403) {
      throw new GoogleApiError(
        res.status,
        res.status === 401 ? "reauth_required" : "missing_scope",
        "Google Calendar authorization failed."
      );
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new GoogleApiError(
        502,
        "calendar_list_failed",
        `Google Calendar list failed (${res.status}): ${errText.slice(0, 160)}`
      );
    }

    const data = (await res.json()) as GoogleCalendarListResponse;
    if (Array.isArray(data.items)) {
      rawEntries.push(...data.items);
    }
    if (!data.nextPageToken) {
      break;
    }
    pageToken = data.nextPageToken;
  }

  const mapped: GoogleSyncedCalendarGroup[] = [];
  const seenCalIds = new Set<string>();
  for (const entry of rawEntries) {
    const group = mapGoogleCalendarListEntryToRyos(entry, params.fallbackName);
    if (!group) continue;
    // Keep primary + writable calendars + selected reader calendars
    if (!group.googlePrimary && group.readOnly && group.selected === false) {
      continue;
    }
    if (seenCalIds.has(group.googleCalendarId)) continue;
    seenCalIds.add(group.googleCalendarId);
    mapped.push(group);
  }

  if (mapped.length === 0) {
    return [buildFallbackPrimaryCalendar(params.fallbackName)];
  }

  if (!mapped.some((c) => c.googlePrimary)) {
    mapped.unshift(buildFallbackPrimaryCalendar(params.fallbackName));
  } else {
    mapped.sort((a, b) => {
      if (a.googlePrimary && !b.googlePrimary) return -1;
      if (!a.googlePrimary && b.googlePrimary) return 1;
      if (!a.readOnly && b.readOnly) return -1;
      if (a.readOnly && !b.readOnly) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  return mapped.slice(0, MAX_SYNCED_CALENDARS);
}

async function listGoogleCalendarChanges(params: {
  accessToken: string;
  googleCalendarId: string;
  syncToken: string | null;
}): Promise<{
  fullSync: boolean;
  notFound?: boolean;
  upserts: GoogleRawCalendarEvent[];
  deletedIds: string[];
  nextSyncToken: string | null;
}> {
  const runList = async (
    tokenToUse: string | null
  ): Promise<
    | { ok: true; items: GoogleRawCalendarEvent[]; nextSyncToken: string | null }
    | { ok: false; gone: true }
    | { ok: false; notFound: true }
  > => {
    const allItems: GoogleRawCalendarEvent[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | null = null;
    const now = Date.now();
    const timeMin = new Date(
      now - FULL_SYNC_PAST_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();
    const timeMax = new Date(
      now + FULL_SYNC_FUTURE_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    for (let page = 0; page < MAX_CALENDAR_PAGES; page += 1) {
      const qs = new URLSearchParams();
      qs.set("maxResults", String(PAGE_SIZE));
      qs.set("showDeleted", "true");
      if (tokenToUse) {
        qs.set("syncToken", tokenToUse);
      } else {
        qs.set("singleEvents", "true");
        qs.set("timeMin", timeMin);
        qs.set("timeMax", timeMax);
      }
      if (pageToken) {
        qs.set("pageToken", pageToken);
      }

      const res = await googleCalendarFetch(
        `/calendars/${encodeURIComponent(params.googleCalendarId)}/events?${qs.toString()}`,
        params.accessToken
      );

      if (res.status === 410 && tokenToUse) {
        return { ok: false, gone: true };
      }
      if (
        res.status === 404 &&
        params.googleCalendarId !== DEFAULT_GOOGLE_CALENDAR_ID
      ) {
        return { ok: false, notFound: true };
      }
      if (res.status === 401 || res.status === 403) {
        throw new GoogleApiError(
          res.status,
          res.status === 401 ? "reauth_required" : "missing_scope",
          "Google Calendar authorization failed."
        );
      }
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new GoogleApiError(
          502,
          "calendar_pull_failed",
          `Google Calendar list failed (${res.status}): ${errText.slice(0, 160)}`
        );
      }

      const data = (await res.json()) as GoogleEventsListResponse;
      if (Array.isArray(data.items)) {
        allItems.push(...data.items);
      }
      if (data.nextSyncToken) {
        nextSyncToken = data.nextSyncToken;
      }
      if (!data.nextPageToken) {
        break;
      }
      pageToken = data.nextPageToken;
    }

    return { ok: true, items: allItems, nextSyncToken };
  };

  let fullSync = !params.syncToken;
  let result = await runList(params.syncToken);
  if (!result.ok && "gone" in result && result.gone) {
    fullSync = true;
    result = await runList(null);
  }
  if (!result.ok) {
    if ("notFound" in result && result.notFound) {
      return {
        fullSync: true,
        notFound: true,
        upserts: [],
        deletedIds: [],
        nextSyncToken: null,
      };
    }
    throw new GoogleApiError(
      502,
      "calendar_pull_failed",
      "Google Calendar sync token reset failed."
    );
  }

  const upserts: GoogleRawCalendarEvent[] = [];
  const deletedIds: string[] = [];
  for (const item of result.items) {
    if (!item.id) continue;
    if (item.status === "cancelled") {
      deletedIds.push(item.id);
    } else {
      upserts.push(item);
    }
  }

  return {
    fullSync,
    upserts,
    deletedIds,
    nextSyncToken: result.nextSyncToken,
  };
}

export async function syncGoogleCalendarForUser(
  redis: RedisLike,
  username: string,
  input: {
    mode?: "incremental" | "reset_pull";
    timeZone?: string | null;
    upserts?: GoogleSyncedCalendarEvent[];
    deletions?: GoogleCalendarDeletionInput[];
  }
): Promise<GoogleCalendarSyncResponse> {
  const { accessToken, account } = await getValidGoogleAccessToken(
    redis,
    username,
    GOOGLE_CALENDAR_SCOPE
  );
  const timeZone = normalizeUserTimeZone(input.timeZone) || "UTC";

  const discoveredCalendars = await listGoogleCalendars({
    accessToken,
    fallbackName: account.name || account.email,
  });

  const byGoogleCalId = new Map<string, GoogleSyncedCalendarGroup>();
  const byLocalGroupId = new Map<string, GoogleSyncedCalendarGroup>();
  for (const cal of discoveredCalendars) {
    byGoogleCalId.set(cal.googleCalendarId, cal);
    if (cal.googleAccountCalendarId) {
      byGoogleCalId.set(cal.googleAccountCalendarId, cal);
    }
    byLocalGroupId.set(cal.id, cal);
  }
  const primaryCalendar =
    discoveredCalendars.find((c) => c.googlePrimary) ?? discoveredCalendars[0]!;

  const deletedLocalIds: string[] = [];
  const deletions = (input.deletions || []).slice(0, MAX_MUTATIONS_PER_SYNC);
  for (const deletion of deletions) {
    const resolvedCal = deletion.googleCalendarId
      ? byGoogleCalId.get(deletion.googleCalendarId)
      : undefined;
    const apiCalId =
      resolvedCal?.googleCalendarId ||
      deletion.googleCalendarId ||
      DEFAULT_GOOGLE_CALENDAR_ID;
    const res = await googleCalendarFetch(
      `/calendars/${encodeURIComponent(apiCalId)}/events/${encodeURIComponent(deletion.googleEventId)}`,
      accessToken,
      { method: "DELETE" }
    );
    if (
      res.ok ||
      res.status === 204 ||
      res.status === 404 ||
      res.status === 410
    ) {
      deletedLocalIds.push(deletion.localId);
    }
  }

  const pushed: GoogleCalendarPushedItem[] = [];
  const upserts = (input.upserts || []).slice(0, MAX_MUTATIONS_PER_SYNC);
  for (const event of upserts) {
    const targetCal =
      (event.googleCalendarId
        ? byGoogleCalId.get(event.googleCalendarId)
        : undefined) ||
      (event.calendarId ? byLocalGroupId.get(event.calendarId) : undefined) ||
      primaryCalendar;

    if (targetCal?.readOnly) {
      continue;
    }

    const canonicalGoogleCalId =
      targetCal?.googleCalendarId ||
      event.googleCalendarId ||
      DEFAULT_GOOGLE_CALENDAR_ID;
    let rawSaved: GoogleRawCalendarEvent | null = null;

    if (event.googleEventId) {
      const patchRes = await googleCalendarFetch(
        `/calendars/${encodeURIComponent(canonicalGoogleCalId)}/events/${encodeURIComponent(event.googleEventId)}`,
        accessToken,
        {
          method: "PATCH",
          body: JSON.stringify(buildGoogleEventPayload(event, timeZone, true)),
        }
      );
      if (patchRes.ok) {
        rawSaved = (await patchRes.json()) as GoogleRawCalendarEvent;
      } else if (patchRes.status !== 404 && patchRes.status !== 410) {
        continue;
      }
    }

    if (!rawSaved) {
      const createRes = await googleCalendarFetch(
        `/calendars/${encodeURIComponent(canonicalGoogleCalId)}/events`,
        accessToken,
        {
          method: "POST",
          body: JSON.stringify(buildGoogleEventPayload(event, timeZone, false)),
        }
      );
      if (createRes.ok) {
        rawSaved = (await createRes.json()) as GoogleRawCalendarEvent;
      }
    }

    if (rawSaved) {
      const mapped = mapGoogleEventToRyos(rawSaved, {
        timeZone,
        preferredLocalId: event.id,
        preferredCalendarId:
          targetCal?.id ||
          buildDeterministicGoogleCalendarGroupId(canonicalGoogleCalId),
        googleCalendarId: canonicalGoogleCalId,
        calendarColor: targetCal?.color,
      });
      if (mapped) {
        const effectiveUpdatedAt = Math.max(event.updatedAt, mapped.updatedAt);
        pushed.push({
          localId: event.id,
          event: {
            ...mapped,
            createdAt: event.createdAt || mapped.createdAt,
            updatedAt: effectiveUpdatedAt,
            googleSyncedUpdatedAt: effectiveUpdatedAt,
          },
        });
      }
    }
  }

  const needsSchemaMigrationReset =
    (account.calendarSyncSchemaVersion ?? 1) < CALENDAR_SYNC_SCHEMA_VERSION;
  const forceResetPull =
    input.mode === "reset_pull" || needsSchemaMigrationReset;

  const previousSyncTokens: Record<string, string> = {
    ...(account.calendarSyncTokens || {}),
  };
  if (
    !previousSyncTokens[DEFAULT_GOOGLE_CALENDAR_ID] &&
    account.calendarSyncToken
  ) {
    previousSyncTokens[DEFAULT_GOOGLE_CALENDAR_ID] = account.calendarSyncToken;
  }

  const pulledPerCalendar = await Promise.all(
    discoveredCalendars.map(async (cal) => {
      const tokenForCal = forceResetPull
        ? null
        : previousSyncTokens[cal.googleCalendarId] ?? null;
      const pulled = await listGoogleCalendarChanges({
        accessToken,
        googleCalendarId: cal.googleCalendarId,
        syncToken: tokenForCal,
      });
      return { cal, pulled };
    })
  );

  const pushedByCompositeKey = new Map(
    pushed
      .filter((p) => p.event.googleEventId)
      .map((p) => [
        `${p.event.googleCalendarId || DEFAULT_GOOGLE_CALENDAR_ID}::${p.event.googleEventId!}`,
        p.event,
      ])
  );

  const activeCalendars: GoogleSyncedCalendarGroup[] = [];
  const nextSyncTokens: Record<string, string> = {};
  const fullSyncGoogleCalendarIds: string[] = [];
  const remoteUpserts: GoogleSyncedCalendarEvent[] = [];
  const remoteDeletedGoogleIds: string[] = [];
  const remoteDeletedEvents: GoogleCalendarDeletedRemoteEvent[] = [];

  for (const { cal, pulled } of pulledPerCalendar) {
    if (pulled.notFound) {
      continue;
    }
    activeCalendars.push(cal);
    const tokenToPersist =
      pulled.nextSyncToken ?? previousSyncTokens[cal.googleCalendarId] ?? null;
    if (tokenToPersist) {
      nextSyncTokens[cal.googleCalendarId] = tokenToPersist;
    }
    if (pulled.fullSync) {
      fullSyncGoogleCalendarIds.push(cal.googleCalendarId);
    }

    for (const deletedId of pulled.deletedIds) {
      remoteDeletedGoogleIds.push(deletedId);
      remoteDeletedEvents.push({
        googleEventId: deletedId,
        googleCalendarId: cal.googleCalendarId,
      });
    }

    for (const raw of pulled.upserts) {
      const compositeKey = raw.id
        ? `${cal.googleCalendarId}::${raw.id}`
        : null;
      if (compositeKey && pushedByCompositeKey.has(compositeKey)) {
        remoteUpserts.push(pushedByCompositeKey.get(compositeKey)!);
        continue;
      }
      const mapped = mapGoogleEventToRyos(raw, {
        timeZone,
        preferredCalendarId: cal.id,
        googleCalendarId: cal.googleCalendarId,
        calendarColor: cal.color,
      });
      if (mapped) {
        remoteUpserts.push(mapped);
      }
    }
  }

  const syncedAt = Date.now();
  await saveLinkedGoogleAccount(redis, {
    ...account,
    calendarSyncToken: nextSyncTokens[DEFAULT_GOOGLE_CALENDAR_ID] ?? null,
    calendarSyncTokens: nextSyncTokens,
    calendarSyncSchemaVersion: CALENDAR_SYNC_SCHEMA_VERSION,
    calendarLastSyncedAt: syncedAt,
    updatedAt: syncedAt,
  });

  const fullSync =
    activeCalendars.length > 0 &&
    fullSyncGoogleCalendarIds.length === activeCalendars.length;

  return {
    fullSync,
    fullSyncGoogleCalendarIds,
    remoteCalendars: activeCalendars,
    pushed,
    deletedLocalIds,
    remoteUpserts,
    remoteDeletedGoogleIds,
    remoteDeletedEvents,
    syncedAt,
  };
}
