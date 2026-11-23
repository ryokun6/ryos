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
  type GoogleCalendarDeletionInput,
  type GoogleCalendarPushedItem,
  type GoogleCalendarSyncResponse,
  type GoogleEventColor,
  type GoogleSyncedCalendarEvent,
} from "../../src/shared/contracts/google.js";

const DEFAULT_GOOGLE_CALENDAR_ID = "primary";
const MAX_CALENDAR_PAGES = 20;
const PAGE_SIZE = 250;
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

interface GoogleEventsListResponse {
  items?: GoogleRawCalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

const RYOS_TO_GOOGLE_COLOR: Record<GoogleEventColor, string> = {
  blue: "9",
  red: "11",
  green: "10",
  orange: "6",
  purple: "3",
};

const GOOGLE_TO_RYOS_COLOR: Record<string, GoogleEventColor> = {
  "1": "purple", // Lavender
  "2": "green", // Sage
  "3": "purple", // Grape
  "4": "red", // Flamingo
  "5": "orange", // Banana
  "6": "orange", // Tangerine
  "7": "blue", // Peacock
  "8": "blue", // Graphite
  "9": "blue", // Blueberry
  "10": "green", // Basil
  "11": "red", // Tomato
};

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

export function buildDeterministicGoogleCalendarEventId(
  googleEventId: string,
  calendarId: string = DEFAULT_GOOGLE_CALENDAR_ID
): string {
  const prefix =
    calendarId === DEFAULT_GOOGLE_CALENDAR_ID
      ? "gcal"
      : `gcal_${calendarId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32)}`;
  const safeId = googleEventId.trim();
  if (/^[a-zA-Z0-9_-]{1,160}$/.test(safeId)) {
    return `${prefix}_${safeId}`;
  }
  const encoded = Buffer.from(safeId, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
    .slice(0, 120);
  return `${prefix}_${encoded}`;
}

function parseTimestampOrFallback(
  iso: string | undefined,
  fallback: number
): number {
  if (!iso) return fallback;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function mapGoogleEventToRyos(
  raw: GoogleRawCalendarEvent,
  options: {
    timeZone: string;
    preferredLocalId?: string;
    preferredCalendarId?: string;
    googleCalendarId?: string;
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

  const color: GoogleEventColor =
    (raw.colorId && GOOGLE_TO_RYOS_COLOR[raw.colorId]) || "blue";

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

  return {
    id,
    title,
    date,
    ...(endDate ? { endDate } : {}),
    ...(startTime ? { startTime } : {}),
    ...(endTime ? { endTime } : {}),
    color,
    calendarId: options.preferredCalendarId || "home",
    ...(location ? { location } : {}),
    ...(notes ? { notes } : {}),
    googleEventId,
    googleCalendarId,
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

  return {
    summary: event.title || "Untitled Event",
    location: event.location || "",
    description: event.notes || "",
    colorId: RYOS_TO_GOOGLE_COLOR[event.color] || "9",
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

async function listGoogleCalendarChanges(params: {
  accessToken: string;
  syncToken: string | null;
}): Promise<{
  fullSync: boolean;
  upserts: GoogleRawCalendarEvent[];
  deletedIds: string[];
  nextSyncToken: string | null;
}> {
  const runList = async (
    tokenToUse: string | null
  ): Promise<
    | { ok: true; items: GoogleRawCalendarEvent[]; nextSyncToken: string | null }
    | { ok: false; gone: true }
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
        `/calendars/${encodeURIComponent(DEFAULT_GOOGLE_CALENDAR_ID)}/events?${qs.toString()}`,
        params.accessToken
      );

      if (res.status === 410 && tokenToUse) {
        return { ok: false, gone: true };
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
  if (!result.ok && result.gone) {
    fullSync = true;
    result = await runList(null);
  }
  if (!result.ok) {
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

  const deletedLocalIds: string[] = [];
  const deletions = (input.deletions || []).slice(0, MAX_MUTATIONS_PER_SYNC);
  for (const deletion of deletions) {
    const calId = deletion.googleCalendarId || DEFAULT_GOOGLE_CALENDAR_ID;
    const res = await googleCalendarFetch(
      `/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(deletion.googleEventId)}`,
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
    const calId = event.googleCalendarId || DEFAULT_GOOGLE_CALENDAR_ID;
    let rawSaved: GoogleRawCalendarEvent | null = null;

    if (event.googleEventId) {
      const patchRes = await googleCalendarFetch(
        `/calendars/${encodeURIComponent(calId)}/events/${encodeURIComponent(event.googleEventId)}`,
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
        `/calendars/${encodeURIComponent(DEFAULT_GOOGLE_CALENDAR_ID)}/events`,
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
        preferredCalendarId: event.calendarId,
        googleCalendarId: calId,
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

  const storedSyncToken =
    input.mode === "reset_pull" ? null : account.calendarSyncToken ?? null;
  const pulled = await listGoogleCalendarChanges({
    accessToken,
    syncToken: storedSyncToken,
  });

  const pushedByGoogleId = new Map(
    pushed
      .filter((p) => p.event.googleEventId)
      .map((p) => [p.event.googleEventId!, p.event])
  );

  const remoteUpserts: GoogleSyncedCalendarEvent[] = [];
  for (const raw of pulled.upserts) {
    if (raw.id && pushedByGoogleId.has(raw.id)) {
      remoteUpserts.push(pushedByGoogleId.get(raw.id)!);
      continue;
    }
    const mapped = mapGoogleEventToRyos(raw, {
      timeZone,
      googleCalendarId: DEFAULT_GOOGLE_CALENDAR_ID,
    });
    if (mapped) {
      remoteUpserts.push(mapped);
    }
  }

  const syncedAt = Date.now();
  await saveLinkedGoogleAccount(redis, {
    ...account,
    calendarSyncToken: pulled.nextSyncToken ?? account.calendarSyncToken ?? null,
    calendarLastSyncedAt: syncedAt,
    updatedAt: syncedAt,
  });

  return {
    fullSync: pulled.fullSync,
    pushed,
    deletedLocalIds,
    remoteUpserts,
    remoteDeletedGoogleIds: pulled.deletedIds,
    syncedAt,
  };
}
