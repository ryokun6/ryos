/**
 * Helpers for reading and updating the stored user record (`chat:users:{username}`).
 *
 * The record is persisted as a JSON string (or, on some Redis backends, an
 * already-parsed object), so callers must tolerate both shapes.
 */

import type { Redis } from "../redis.js";
import type { IpGeolocation } from "../_geolocation.js";
import { CHAT_USERS_PREFIX } from "./_constants.js";

export type StoredUserGeo = IpGeolocation;

export interface StoredUserRecord {
  username?: string;
  createdAt?: number;
  lastActive?: number;
  timeZone?: string;
  timeZoneUpdatedAt?: number;
  geo?: StoredUserGeo;
  geoUpdatedAt?: number;
  banned?: boolean;
  banReason?: string;
  bannedAt?: number;
}

/**
 * Parse a raw `chat:users:{username}` value into a user record.
 * Returns null when the value is missing or malformed.
 */
export function parseStoredUser(userData: unknown): StoredUserRecord | null {
  if (!userData) return null;
  try {
    return typeof userData === "string"
      ? (JSON.parse(userData) as StoredUserRecord)
      : (userData as StoredUserRecord);
  } catch {
    return null;
  }
}

/**
 * Whether a stored user record represents a banned account.
 */
export function isUserBanned(userData: unknown): boolean {
  return parseStoredUser(userData)?.banned === true;
}

/**
 * Validate a browser-provided IANA timezone. Returns null for unknown/invalid
 * values so we never persist misleading prompt context.
 */
export function normalizeUserTimeZone(timeZone?: string | null): string | null {
  if (!timeZone || typeof timeZone !== "string") {
    return null;
  }

  const trimmed = timeZone.trim();
  if (!trimmed || trimmed === "Unknown") {
    return null;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed });
    return trimmed;
  } catch {
    return null;
  }
}

function normalizeGeoString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLength);
}

function normalizeGeoCoordinate(
  value: unknown,
  min: number,
  max: number
): string | undefined {
  const raw =
    typeof value === "number"
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : "";
  if (!raw) return undefined;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return undefined;
  }

  return raw;
}

export function normalizeUserGeo(geo?: unknown): StoredUserGeo | null {
  if (!geo || typeof geo !== "object") {
    return null;
  }

  const raw = geo as Record<string, unknown>;
  const normalized: StoredUserGeo = {};
  const city = normalizeGeoString(raw.city, 100);
  const region = normalizeGeoString(raw.region, 100);
  const country = normalizeGeoString(raw.country, 100);
  const latitude = normalizeGeoCoordinate(raw.latitude, -90, 90);
  const longitude = normalizeGeoCoordinate(raw.longitude, -180, 180);

  if (city) normalized.city = city;
  if (region) normalized.region = region;
  if (country) normalized.country = country;
  if (latitude) normalized.latitude = latitude;
  if (longitude) normalized.longitude = longitude;

  if (
    !normalized.city &&
    !normalized.country &&
    !(normalized.latitude && normalized.longitude)
  ) {
    return null;
  }

  return normalized;
}

function geoMatches(a: StoredUserGeo | null, b: StoredUserGeo | null): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export async function getStoredUserRecord(
  redis: Redis,
  username: string
): Promise<StoredUserRecord | null> {
  return parseStoredUser(
    await redis.get(`${CHAT_USERS_PREFIX}${username.toLowerCase()}`)
  );
}

export async function getStoredUserTimeZone(
  redis: Redis | undefined,
  username?: string | null
): Promise<string | null> {
  if (!redis || !username) {
    return null;
  }

  const record = await getStoredUserRecord(redis, username);
  return normalizeUserTimeZone(record?.timeZone);
}

export async function getStoredUserGeo(
  redis: Redis | undefined,
  username?: string | null
): Promise<StoredUserGeo | null> {
  if (!redis || !username) {
    return null;
  }

  const record = await getStoredUserRecord(redis, username);
  return normalizeUserGeo(record?.geo);
}

export async function updateStoredUserTimeZone(
  redis: Redis,
  username: string,
  timeZone?: string | null,
  now: number = Date.now()
): Promise<StoredUserRecord | null> {
  const normalizedTimeZone = normalizeUserTimeZone(timeZone);
  if (!normalizedTimeZone) {
    return null;
  }

  const key = `${CHAT_USERS_PREFIX}${username.toLowerCase()}`;
  const existingRecord = parseStoredUser(await redis.get(key));
  if (!existingRecord) {
    return null;
  }

  if (existingRecord.timeZone === normalizedTimeZone) {
    return existingRecord;
  }

  const updatedRecord: StoredUserRecord = {
    ...existingRecord,
    timeZone: normalizedTimeZone,
    timeZoneUpdatedAt: now,
  };
  await redis.set(key, JSON.stringify(updatedRecord));
  return updatedRecord;
}

export async function updateStoredUserGeo(
  redis: Redis,
  username: string,
  geo?: unknown,
  now: number = Date.now()
): Promise<StoredUserRecord | null> {
  const normalizedGeo = normalizeUserGeo(geo);
  if (!normalizedGeo) {
    return null;
  }

  const key = `${CHAT_USERS_PREFIX}${username.toLowerCase()}`;
  const existingRecord = parseStoredUser(await redis.get(key));
  if (!existingRecord) {
    return null;
  }

  const existingGeo = normalizeUserGeo(existingRecord.geo);
  if (geoMatches(existingGeo, normalizedGeo)) {
    return existingRecord;
  }

  const updatedRecord: StoredUserRecord = {
    ...existingRecord,
    geo: normalizedGeo,
    geoUpdatedAt: now,
  };
  await redis.set(key, JSON.stringify(updatedRecord));
  return updatedRecord;
}
