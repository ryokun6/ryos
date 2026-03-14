import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
  compareCloudSyncRevisions,
  getNextSyncRevision,
  getSyncClientId,
  normalizeCloudSyncRevision,
} from "../src/utils/cloudSyncRevision";

const localStorageState = new Map<string, string>();
const originalCrypto = globalThis.crypto;
const originalLocalStorage = (globalThis as { localStorage?: Storage }).localStorage;

const localStorageMock = {
  getItem(key: string) {
    return localStorageState.has(key) ? localStorageState.get(key)! : null;
  },
  setItem(key: string, value: string) {
    localStorageState.set(key, value);
  },
  removeItem(key: string) {
    localStorageState.delete(key);
  },
};

beforeEach(() => {
  localStorageState.clear();
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageMock,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, "crypto", {
    value: {
      randomUUID: mock(() => "client-123"),
    },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, "crypto", {
    value: originalCrypto,
    configurable: true,
    writable: true,
  });

  Object.defineProperty(globalThis, "localStorage", {
    value: originalLocalStorage,
    configurable: true,
    writable: true,
  });
});

describe("cloud sync revision helpers", () => {
  test("persists a stable client id", () => {
    expect(getSyncClientId()).toBe("client-123");
    expect(getSyncClientId()).toBe("client-123");
  });

  test("allocates monotonically increasing revisions per scope", () => {
    expect(getNextSyncRevision("files-metadata")).toEqual({
      clientId: "client-123",
      counter: 1,
    });
    expect(getNextSyncRevision("files-metadata")).toEqual({
      clientId: "client-123",
      counter: 2,
    });
    expect(getNextSyncRevision("files-images")).toEqual({
      clientId: "client-123",
      counter: 1,
    });
  });

  test("normalizes valid revisions and rejects malformed values", () => {
    expect(
      normalizeCloudSyncRevision({ clientId: "abc", counter: 2 })
    ).toEqual({
      clientId: "abc",
      counter: 2,
    });
    expect(normalizeCloudSyncRevision({ clientId: "", counter: 2 })).toBe(
      undefined
    );
    expect(normalizeCloudSyncRevision({ clientId: "abc" })).toBe(undefined);
  });

  test("compares same-client revisions and treats different clients as concurrent", () => {
    expect(
      compareCloudSyncRevisions(
        { clientId: "client-a", counter: 2 },
        { clientId: "client-a", counter: 1 }
      )
    ).toBe(1);
    expect(
      compareCloudSyncRevisions(
        { clientId: "client-a", counter: 1 },
        { clientId: "client-a", counter: 2 }
      )
    ).toBe(-1);
    expect(
      compareCloudSyncRevisions(
        { clientId: "client-a", counter: 2 },
        { clientId: "client-a", counter: 2 }
      )
    ).toBe(0);
    expect(
      compareCloudSyncRevisions(
        { clientId: "client-a", counter: 2 },
        { clientId: "client-b", counter: 1 }
      )
    ).toBeNull();
  });
});
