import type { Redis } from "./redis.js";
import {
  getStoredUserTimeZone,
  normalizeUserTimeZone,
} from "./auth/_user-record.js";

export interface UserLocalTimeContext {
  timeString: string;
  dateString: string;
  timeZone: string;
}

export function buildUserLocalTimeContext(
  timeZone?: string | null,
  date: Date = new Date()
): UserLocalTimeContext | null {
  const resolvedTimeZone = normalizeUserTimeZone(timeZone);
  if (!resolvedTimeZone) {
    return null;
  }

  return {
    timeString: date.toLocaleTimeString("en-US", {
      timeZone: resolvedTimeZone,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
    dateString: date.toLocaleDateString("en-US", {
      timeZone: resolvedTimeZone,
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    timeZone: resolvedTimeZone,
  };
}

export async function getStoredUserLocalTimeContext({
  redis,
  username,
  fallbackTimeZone,
  date,
}: {
  redis?: Redis;
  username?: string | null;
  fallbackTimeZone?: string | null;
  date?: Date;
}): Promise<UserLocalTimeContext | null> {
  const storedTimeZone = await getStoredUserTimeZone(redis, username);
  return buildUserLocalTimeContext(storedTimeZone || fallbackTimeZone, date);
}
