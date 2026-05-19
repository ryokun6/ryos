import { describe, test, expect, beforeEach } from "bun:test";
import {
  readCachedLocale,
  writeCachedLocale,
  clearLocaleCache,
  getLocaleBuildStamp,
} from "../src/utils/localeCache";

const hasLocalStorage = typeof localStorage !== "undefined";

describe("localeCache", () => {
  beforeEach(async () => {
    if (!hasLocalStorage) return;
    await clearLocaleCache();
  });

  test("getLocaleBuildStamp returns a non-empty string", () => {
    expect(getLocaleBuildStamp().length).toBeGreaterThan(0);
  });

  test("write then read returns messages for same build stamp", async () => {
    if (!hasLocalStorage) return;

    const stamp = "test-build-abc";
    const messages = { common: { ok: "OK" } };

    await writeCachedLocale("ja", messages, stamp);
    const cached = await readCachedLocale("ja", stamp);

    expect(cached).toEqual(messages);
  });

  test("read returns null when build stamp differs", async () => {
    if (!hasLocalStorage) return;

    await writeCachedLocale("fr", { hello: "bonjour" }, "build-a");
    const cached = await readCachedLocale("fr", "build-b");

    expect(cached).toBeNull();
  });

  test("clearLocaleCache removes all entries", async () => {
    if (!hasLocalStorage) return;

    await writeCachedLocale("ko", { a: 1 }, "build-clear");
    await clearLocaleCache();
    const cached = await readCachedLocale("ko", "build-clear");
    expect(cached).toBeNull();
  });

  test("write prunes bundles from other build stamps", async () => {
    if (!hasLocalStorage) return;

    await writeCachedLocale("de", { a: 1 }, "old-build");
    await writeCachedLocale("de", { b: 2 }, "new-build");

    expect(await readCachedLocale("de", "old-build")).toBeNull();
    expect(await readCachedLocale("de", "new-build")).toEqual({ b: 2 });
  });
});
