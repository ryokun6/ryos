import { describe, test, expect, beforeEach } from "bun:test";
import {
  readCachedLocale,
  writeCachedLocale,
  clearLocaleCache,
  getLocaleBuildStamp,
} from "../src/utils/localeCache";
import { ensureIndexedDBInitialized, STORES } from "../src/utils/indexedDB";

const hasIndexedDB = typeof indexedDB !== "undefined";

describe("localeCache", () => {
  beforeEach(async () => {
    if (!hasIndexedDB) return;
    await clearLocaleCache();
  });

  test("getLocaleBuildStamp returns a non-empty string", () => {
    expect(getLocaleBuildStamp().length).toBeGreaterThan(0);
  });

  test("write then read returns messages for same build stamp", async () => {
    if (!hasIndexedDB) return;

    const stamp = "test-build-abc";
    const messages = { common: { ok: "OK" } };

    await writeCachedLocale("ja", messages, stamp);
    const cached = await readCachedLocale("ja", stamp);

    expect(cached).toEqual(messages);
  });

  test("read returns null when build stamp differs", async () => {
    if (!hasIndexedDB) return;

    await writeCachedLocale("fr", { hello: "bonjour" }, "build-a");
    const cached = await readCachedLocale("fr", "build-b");

    expect(cached).toBeNull();
  });

  test("clearLocaleCache removes all entries", async () => {
    if (!hasIndexedDB) return;

    await writeCachedLocale("ko", { a: 1 }, "build-clear");
    await clearLocaleCache();
    const cached = await readCachedLocale("ko", "build-clear");
    expect(cached).toBeNull();
  });

  test("locale_translations store exists after DB open", async () => {
    if (!hasIndexedDB) return;

    const db = await ensureIndexedDBInitialized();
    expect(db.objectStoreNames.contains(STORES.LOCALE_TRANSLATIONS)).toBe(true);
    db.close();
  });
});
