import { describe, expect, test } from "bun:test";
import type { Redis } from "../api/_utils/redis";
import {
  getStoredUserGeo,
  getStoredUserTimeZone,
  isUserBanned,
  normalizeUserGeo,
  normalizeUserTimeZone,
  parseStoredUser,
  updateStoredUserGeo,
  updateStoredUserTimeZone,
} from "../api/_utils/auth/_user-record";
import { CHAT_USERS_PREFIX } from "../api/_utils/auth/_constants";
import { buildUserLocalTimeContext } from "../api/_utils/user-time-context";

class FakeRedis {
  private readonly store = new Map<string, unknown>();

  async get<T = unknown>(key: string): Promise<T | null> {
    return (this.store.has(key) ? this.store.get(key) : null) as T | null;
  }

  async set(key: string, value: unknown): Promise<"OK"> {
    this.store.set(key, value);
    return "OK";
  }
}

function makeRedis(): Redis {
  return new FakeRedis() as unknown as Redis;
}

describe("stored user record helpers", () => {
  test("parses JSON-string and object records", () => {
    expect(parseStoredUser('{"username":"ryo","banned":true}')).toEqual({
      username: "ryo",
      banned: true,
    });
    expect(parseStoredUser({ username: "ryo", banned: false })).toEqual({
      username: "ryo",
      banned: false,
    });
  });

  test("returns null for missing/malformed records", () => {
    expect(parseStoredUser(null)).toBeNull();
    expect(parseStoredUser(undefined)).toBeNull();
    expect(parseStoredUser("not json")).toBeNull();
  });

  test("isUserBanned only true when banned === true", () => {
    expect(isUserBanned('{"username":"u","banned":true}')).toBe(true);
    expect(isUserBanned({ username: "u", banned: true })).toBe(true);
    expect(isUserBanned({ username: "u", banned: false })).toBe(false);
    expect(isUserBanned({ username: "u" })).toBe(false);
    expect(isUserBanned(null)).toBe(false);
    expect(isUserBanned("garbage")).toBe(false);
  });

  test("validates and persists IANA timezones without accepting placeholders", async () => {
    const redis = makeRedis();
    const username = "timezone_user";
    await redis.set(`${CHAT_USERS_PREFIX}${username}`, JSON.stringify({ username }));

    expect(normalizeUserTimeZone("Asia/Tokyo")).toBe("Asia/Tokyo");
    expect(normalizeUserTimeZone("Unknown")).toBeNull();
    expect(normalizeUserTimeZone("not/a-zone")).toBeNull();

    const updated = await updateStoredUserTimeZone(
      redis,
      username,
      "Europe/Berlin",
      123
    );
    expect(updated?.timeZone).toBe("Europe/Berlin");
    expect(updated?.timeZoneUpdatedAt).toBe(123);
    expect(await getStoredUserTimeZone(redis, username)).toBe("Europe/Berlin");

    const ignored = await updateStoredUserTimeZone(redis, username, "not/a-zone", 456);
    expect(ignored).toBeNull();
    expect(await getStoredUserTimeZone(redis, username)).toBe("Europe/Berlin");
  });

  test("validates and persists useful approximate GeoIP context", async () => {
    const redis = makeRedis();
    const username = "geo_user";
    await redis.set(`${CHAT_USERS_PREFIX}${username}`, JSON.stringify({ username }));

    expect(
      normalizeUserGeo({
        city: "  San Francisco  ",
        region: "California",
        country: "US",
        latitude: "37.7749",
        longitude: -122.4194,
      })
    ).toEqual({
      city: "San Francisco",
      region: "California",
      country: "US",
      latitude: "37.7749",
      longitude: "-122.4194",
    });
    expect(normalizeUserGeo({ region: "California" })).toBeNull();
    expect(normalizeUserGeo({ latitude: "999", longitude: "0" })).toBeNull();

    const updated = await updateStoredUserGeo(
      redis,
      username,
      {
        city: "Berlin",
        country: "DE",
        latitude: "52.52",
        longitude: "13.405",
      },
      456
    );

    expect(updated?.geo).toEqual({
      city: "Berlin",
      country: "DE",
      latitude: "52.52",
      longitude: "13.405",
    });
    expect(updated?.geoUpdatedAt).toBe(456);
    expect(await getStoredUserGeo(redis, username)).toEqual(updated?.geo);

    const ignored = await updateStoredUserGeo(redis, username, { region: "Only" }, 789);
    expect(ignored).toBeNull();
    expect(await getStoredUserGeo(redis, username)).toEqual(updated?.geo);
  });

  test("builds stable user-local prompt time context", () => {
    const context = buildUserLocalTimeContext(
      "Asia/Tokyo",
      new Date("2026-01-15T06:30:00.000Z")
    );

    expect(context).toEqual({
      timeString: "3:30 PM",
      dateString: "Thursday, January 15, 2026",
      timeZone: "Asia/Tokyo",
    });
    expect(buildUserLocalTimeContext("bad-zone")).toBeNull();
  });
});
