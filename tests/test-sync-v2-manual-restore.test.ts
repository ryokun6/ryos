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
  });

  test("Control Panels reset clears IndexedDB persisted app state", () => {
    const source = readFileSync(
      "src/apps/control-panels/hooks/useControlPanelsLogic.ts",
      "utf8"
    );

    const resetBlock = source.slice(
      source.indexOf("const performReset = async () =>"),
      source.indexOf("const handleBackup = async () =>")
    );
    const restoreBlock = source.slice(
      source.indexOf("const performRestore = async () =>"),
      source.indexOf("const performFormat = async () =>")
    );

    expect(resetBlock).toContain("await settlePersistWrites()");
    expect(resetBlock).toContain("haltDebouncedPersistWrites()");
    expect(resetBlock).toContain("clearIndexedDBPersistedState()");
    expect(resetBlock.indexOf("await settlePersistWrites()")).toBeLessThan(
      resetBlock.indexOf("haltDebouncedPersistWrites()")
    );
    expect(restoreBlock).toContain(
      'storeName === "persisted_state" ? [] : null'
    );
    expect(restoreBlock.indexOf("await settlePersistWrites()")).toBeLessThan(
      restoreBlock.indexOf("haltDebouncedPersistWrites()")
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
