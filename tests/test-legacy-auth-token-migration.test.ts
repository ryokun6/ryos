import { beforeEach, describe, expect, test } from "bun:test";
import {
  LEGACY_AUTH_TOKEN_RECOVERY_KEY,
  clearLegacyTokenRecovery,
  consumeLegacyAuthToken,
} from "../src/utils/legacyAuthTokenMigration";

class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

describe("legacy auth token migration", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: new MemoryStorage(),
    });
  });

  test("consumes a legacy reversed btoa token once", () => {
    const token = "secret-token";
    localStorage.setItem(
      LEGACY_AUTH_TOKEN_RECOVERY_KEY,
      btoa(token.split("").reverse().join(""))
    );

    expect(consumeLegacyAuthToken()).toBe(token);
    expect(consumeLegacyAuthToken()).toBeNull();
  });

  test("clears invalid legacy data idempotently", () => {
    localStorage.setItem(LEGACY_AUTH_TOKEN_RECOVERY_KEY, "not-base64");
    clearLegacyTokenRecovery();
    expect(consumeLegacyAuthToken()).toBeNull();
  });
});
