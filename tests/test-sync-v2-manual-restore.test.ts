import "./local-storage-stub";
import { beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { shouldIncludeManualBackupLocalStorageKey } from "../src/sync/manualBackup";
import {
  clearManualRestoreIntent,
  createManualRestoreIntent,
  getManualRestoreIntent,
  setManualRestoreIntent,
} from "../src/sync/manualRestoreIntent";

describe("manual backup Sync v2 metadata filtering", () => {
  test("excludes Sync v2 cursor, shadow, and restore intent metadata", () => {
    expect(shouldIncludeManualBackupLocalStorageKey("ryos:files")).toBe(true);
    expect(
      shouldIncludeManualBackupLocalStorageKey("ryos:sync2:client-id")
    ).toBe(false);
    expect(
      shouldIncludeManualBackupLocalStorageKey("ryos:sync2:state:alice")
    ).toBe(false);
    expect(
      shouldIncludeManualBackupLocalStorageKey(
        "ryos:sync2:manual-restore-intent"
      )
    ).toBe(false);
  });

  test("Control Panels local backup and restore filter stale Sync v2 metadata", () => {
    const source = readFileSync(
      "src/apps/control-panels/hooks/useControlPanelsLogic.ts",
      "utf8"
    );

    const localBackupBlock = source.slice(
      source.indexOf("const handleBackup = async () =>"),
      source.indexOf("const handleRestore =")
    );
    const localRestoreBlock = source.slice(
      source.indexOf("const performRestore = async () =>"),
      source.indexOf("const performFormat = async () =>")
    );

    expect(localBackupBlock).toContain("shouldIncludeManualBackupLocalStorageKey");
    expect(localRestoreBlock).toContain("shouldIncludeManualBackupLocalStorageKey");
    expect(localRestoreBlock).toContain("createManualRestoreIntent");
    expect(localRestoreBlock).toContain("setManualRestoreIntent");
    expect(localRestoreBlock).toContain("MANUAL_BACKUP_INDEXEDDB_STORES.map");
    expect(localRestoreBlock).toContain(
      "backup.indexedDB?.[storeName] ?? []"
    );
    expect(localRestoreBlock).toContain("restoreStoreItemsAtomically");
    expect(localRestoreBlock).toContain(
      "replaceLocalStorage(previousLocalStorage)"
    );
  });
});

describe("manual restore intent", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("round-trips only for the matching user", () => {
    const intent = createManualRestoreIntent(
      "Alice",
      "2026-06-28T04:00:00.000Z"
    );
    setManualRestoreIntent(intent);

    expect(getManualRestoreIntent("alice")).toMatchObject({
      username: "alice",
      backupTimestamp: "2026-06-28T04:00:00.000Z",
    });
    expect(getManualRestoreIntent("bob")).toBeNull();

    clearManualRestoreIntent("alice");
    expect(getManualRestoreIntent("alice")).toBeNull();
  });
});
