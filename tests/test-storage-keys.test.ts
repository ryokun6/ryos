import { describe, expect, test } from "bun:test";

import {
  CURRENT_LOCAL_STORAGE_STATIC_KEYS,
  CURRENT_SESSION_STORAGE_STATIC_KEYS,
  LEGACY_LOCAL_STORAGE_KEYS,
  LOCAL_STORAGE_KEYS,
  STORE_STORAGE_KEYS,
} from "../src/config/storageKeys";

function expectUnique(label: string, keys: readonly string[]) {
  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);
  expect(duplicates, `${label} duplicates`).toEqual([]);
}

describe("browser storage key registry", () => {
  test("active Zustand store keys are unique", () => {
    const storeKeys = Object.values(STORE_STORAGE_KEYS);

    expectUnique("store storage keys", storeKeys);
    expect(STORE_STORAGE_KEYS.pc).toBe("ryos:pc");
    expect(STORE_STORAGE_KEYS.infinitePc).toBe("ryos:store:infinite-pc");
  });

  test("current static key lists are unique", () => {
    expectUnique("localStorage keys", CURRENT_LOCAL_STORAGE_STATIC_KEYS);
    expectUnique("sessionStorage keys", CURRENT_SESSION_STORAGE_STATIC_KEYS);
  });

  test("unprefixed current keys are explicit shipped exceptions", () => {
    const allowedUnprefixedLocalKeys = new Set([
      STORE_STORAGE_KEYS.applet,
      STORE_STORAGE_KEYS.calendar,
      STORE_STORAGE_KEYS.contacts,
      STORE_STORAGE_KEYS.dashboard,
      STORE_STORAGE_KEYS.dock,
      STORE_STORAGE_KEYS.stickies,
      LOCAL_STORAGE_KEYS.auth.usernameRecovery,
    ]);

    const unexpected = CURRENT_LOCAL_STORAGE_STATIC_KEYS.filter(
      (key) => !key.startsWith("ryos:") && !allowedUnprefixedLocalKeys.has(key)
    );

    expect(unexpected).toEqual([]);
  });

  test("dynamic builders preserve key namespaces", () => {
    expect(LOCAL_STORAGE_KEYS.handoff.appInitialPath("finder")).toBe(
      LOCAL_STORAGE_KEYS.handoff.finderInitialPath
    );
    expect(LOCAL_STORAGE_KEYS.sync.stateForUser("RyoLu")).toBe(
      "ryos:sync2:state:ryolu"
    );
    expect(LEGACY_LOCAL_STORAGE_KEYS.textEdit.pendingFileOpen).toBe(
      "pending_file_open"
    );
  });
});
