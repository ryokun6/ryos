import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import "fake-indexeddb/auto";

import {
  DB_NAME,
  DB_VERSION,
  dbOperations,
  ensureIndexedDBInitialized,
  STORES,
} from "../../../src/utils/indexedDB";

async function deleteRyOsDatabase(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

/** Create an older schema that intentionally omits `stuff_images`. */
async function seedDatabaseWithoutStuffImages(
  version: number
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, version);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const storeName of Object.values(STORES)) {
        if (storeName === STORES.STUFF_IMAGES) continue;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName);
        }
      }
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
  });
}

describe("stuff_images IndexedDB store", () => {
  beforeEach(async () => {
    await deleteRyOsDatabase();
  });

  test("DB_VERSION includes stuff_images in the current schema", () => {
    expect(DB_VERSION).toBeGreaterThanOrEqual(16);
    expect(STORES.STUFF_IMAGES).toBe("stuff_images");
  });

  test("does not read STORES before it is initialized", () => {
    // Guards the TDZ regression where `Object.values(STORES)` was placed
    // above `export const STORES` (Chrome: indexedDB.ts:11 Cannot access
    // 'STORES' before initialization).
    const source = readFileSync(
      new URL("../../../src/utils/indexedDB.ts", import.meta.url),
      "utf8"
    );
    const storesDef = source.indexOf("export const STORES");
    const storeNamesInit = source.indexOf("Object.values(STORES)");
    expect(storesDef).toBeGreaterThanOrEqual(0);
    expect(storeNamesInit).toBeGreaterThan(storesDef);
  });

  test("creates stuff_images when upgrading from a pre-store DB version", async () => {
    await seedDatabaseWithoutStuffImages(15);

    const db = await ensureIndexedDBInitialized();
    try {
      expect(db.objectStoreNames.contains(STORES.STUFF_IMAGES)).toBe(true);
      expect(db.version).toBeGreaterThanOrEqual(DB_VERSION);
    } finally {
      db.close();
    }
  });

  test("heals stuff_images when missing at the current DB version", async () => {
    // Simulate a same-version gap: DB already at DB_VERSION but store was never created.
    await seedDatabaseWithoutStuffImages(DB_VERSION);

    const db = await ensureIndexedDBInitialized();
    try {
      expect(db.objectStoreNames.contains(STORES.STUFF_IMAGES)).toBe(true);
    } finally {
      db.close();
    }
  });

  test("put/get cover blobs succeed after upgrade", async () => {
    await seedDatabaseWithoutStuffImages(15);

    const coverBlobId = "cover-1";
    const record = {
      name: "cover",
      content: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }),
      type: "image/png",
    };

    await dbOperations.put(STORES.STUFF_IMAGES, record, coverBlobId);
    const loaded = await dbOperations.get<typeof record>(
      STORES.STUFF_IMAGES,
      coverBlobId
    );

    expect(loaded?.name).toBe("cover");
    expect(loaded?.type).toBe("image/png");
    expect(loaded?.content).toBeInstanceOf(Blob);
    expect(loaded?.content.size).toBe(3);
  });

  test("fresh open still creates every declared store including stuff_images", async () => {
    const db = await ensureIndexedDBInitialized();
    try {
      for (const storeName of Object.values(STORES)) {
        expect(db.objectStoreNames.contains(storeName)).toBe(true);
      }
    } finally {
      db.close();
    }
  });
});
