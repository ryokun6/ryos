import type { EventColor } from "@/stores/useCalendarStore";

export interface ParsedIcalEvent {
  title: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:MM
  endTime?: string; // HH:MM
  notes?: string;
  color: EventColor;
}

/**
 * Parse an iCalendar (.ics) file string into an array of calendar events.
 * Handles VEVENT components with DTSTART, DTEND, SUMMARY, DESCRIPTION.
 * Supports both DATE and DATE-TIME values. Unfolds long lines per RFC 5545.
 */
export function parseIcalString(icsText: string): ParsedIcalEvent[] {
  const unfolded = icsText.replace(/\r\n[ \t]/g, "").replace(/\r/g, "");
  const lines = unfolded.split("\n");

  const events: ParsedIcalEvent[] = [];
  let inEvent = false;
  let current: Partial<{
    summary: string;
    description: string;
    dtstart: string;
    dtend: string;
    isAllDay: boolean;
    isUtc: boolean;
  }> = {};

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "BEGIN:VEVENT") {
      inEvent = true;
      current = {};
      continue;
    }

    if (trimmed === "END:VEVENT") {
      inEvent = false;
      const event = buildEvent(current);
      if (event) events.push(event);
      continue;
    }

    if (!inEvent) continue;

    const { name, params, value } = parseLine(trimmed);

    switch (name) {
      case "SUMMARY":
        current.summary = unescapeIcalText(value);
        break;
      case "DESCRIPTION":
        current.description = unescapeIcalText(value);
        break;
      case "DTSTART": {
        const isDateOnly =
          params.includes("VALUE=DATE") || /^\d{8}$/.test(value);
        current.dtstart = value;
        current.isAllDay = isDateOnly;
        if (value.endsWith("Z")) current.isUtc = true;
        break;
      }
      case "DTEND":
        current.dtend = value;
        if (value.endsWith("Z")) current.isUtc = true;
        break;
    }
  }

  return events;
}

function parseLine(line: string): {
  name: string;
  params: string;
  value: string;
} {
  const colonIdx = line.indexOf(":");
  if (colonIdx === -1) return { name: line, params: "", value: "" };

  const left = line.substring(0, colonIdx);
  const value = line.substring(colonIdx + 1);

  const semiIdx = left.indexOf(";");
  if (semiIdx === -1) return { name: left.toUpperCase(), params: "", value };

  return {
    name: left.substring(0, semiIdx).toUpperCase(),
    params: left.substring(semiIdx + 1).toUpperCase(),
    value,
  };
}

function unescapeIcalText(text: string): string {
  return text
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function parseIcalDateTime(
  dt: string,
  isUtc: boolean
): { date: string; time?: string } | null {
  const cleaned = dt.replace(/[^0-9T]/g, "");

  if (/^\d{8}$/.test(cleaned)) {
    return {
      date: `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`,
    };
  }

  const match = cleaned.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
  if (!match) return null;

  if (isUtc) {
    const utc = new Date(
      Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5])
    );
    return {
      date: `${utc.getFullYear()}-${pad2(utc.getMonth() + 1)}-${pad2(utc.getDate())}`,
      time: `${pad2(utc.getHours())}:${pad2(utc.getMinutes())}`,
    };
  }

  return {
    date: `${match[1]}-${match[2]}-${match[3]}`,
    time: `${match[4]}:${match[5]}`,
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function buildEvent(
  raw: Partial<{
    summary: string;
    description: string;
    dtstart: string;
    dtend: string;
    isAllDay: boolean;
    isUtc: boolean;
  }>
): ParsedIcalEvent | null {
  if (!raw.summary || !raw.dtstart) return null;

  const isUtc = raw.isUtc ?? false;
  const start = parseIcalDateTime(raw.dtstart, isUtc);
  if (!start) return null;

  const end = raw.dtend ? parseIcalDateTime(raw.dtend, isUtc) : null;

  const event: ParsedIcalEvent = {
    title: raw.summary,
    date: start.date,
    color: "blue",
  };

  if (!raw.isAllDay && start.time) {
    event.startTime = start.time;
    if (end?.time) {
      event.endTime = end.time;
    }
  }

  if (raw.description) {
    event.notes = raw.description;
  }

  return event;
}
