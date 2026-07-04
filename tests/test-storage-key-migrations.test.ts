import { beforeEach, describe, expect, test } from "bun:test";
import {
  LEGACY_STORAGE_KEYS,
  migrateWebStorageKey,
  removeStaleStorageKeys,
  STORAGE_KEYS,
} from "../src/utils/storageKeys";
import { installTestLocalStorage } from "./setup";

beforeEach(() => {
  installTestLocalStorage();
  localStorage.clear();
});

describe("storage key migrations", () => {
  test("all canonical namespace keys start with ryos:", () => {
    expect(
      Object.values(STORAGE_KEYS).every((key) => key.startsWith("ryos:"))
    ).toBe(true);
  });

  test("moves legacy values without overwriting canonical data", () => {
    localStorage.setItem(LEGACY_STORAGE_KEYS.dock, "legacy");
    migrateWebStorageKey(
      localStorage,
      LEGACY_STORAGE_KEYS.dock,
      STORAGE_KEYS.dock
    );
    expect(localStorage.getItem(STORAGE_KEYS.dock)).toBe("legacy");
    expect(localStorage.getItem(LEGACY_STORAGE_KEYS.dock)).toBeNull();

    localStorage.setItem(STORAGE_KEYS.dock, "canonical");
    localStorage.setItem(LEGACY_STORAGE_KEYS.dock, "stale");
    migrateWebStorageKey(
      localStorage,
      LEGACY_STORAGE_KEYS.dock,
      STORAGE_KEYS.dock
    );
    expect(localStorage.getItem(STORAGE_KEYS.dock)).toBe("canonical");
    expect(localStorage.getItem(LEGACY_STORAGE_KEYS.dock)).toBe("stale");

    localStorage.setItem(LEGACY_STORAGE_KEYS.dock, "canonical");
    migrateWebStorageKey(
      localStorage,
      LEGACY_STORAGE_KEYS.dock,
      STORAGE_KEYS.dock
    );
    expect(localStorage.getItem(LEGACY_STORAGE_KEYS.dock)).toBeNull();
  });

  test("removes storage paths no current code reads", () => {
    localStorage.setItem("ryos:pending-file-open", "scratch");
    localStorage.setItem("ryos:app:settings:wallpaper", "legacy-wallpaper");
    removeStaleStorageKeys();
    expect(localStorage.getItem("ryos:pending-file-open")).toBeNull();
    expect(
      localStorage.getItem("ryos:app:settings:wallpaper")
    ).toBeNull();
  });
});
