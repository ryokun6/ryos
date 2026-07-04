import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const readSource = (path: string): string => readFileSync(path, "utf8");

describe("large Zustand stores use IndexedDB persistence", () => {
  const splitStorePaths = [
    "src/stores/useTextEditStore.ts",
    "src/stores/useFilesStore.ts",
    "src/stores/useSoundboardStore.ts",
    "src/stores/useChatsStore.ts",
  ];
  const snapshotStorePaths = [
    "src/stores/useIpodStore.ts",
    "src/stores/useStickiesStore.ts",
    "src/stores/useContactsStore.ts",
    "src/stores/useBooksStore.ts",
    "src/stores/useCalendarStore.ts",
    "src/stores/useVideoStore.ts",
    "src/stores/useTvStore.ts",
  ];

  for (const path of splitStorePaths) {
    test(`${path} uses normalized IndexedDB entity persistence`, () => {
      const source = readSource(path);
      expect(source).toContain("createSplitIndexedDBPersistStorage");
      expect(source).not.toContain("createDebouncedPersistStorage()");
      expect(source).not.toContain("createJSONStorage(() => localStorage)");
    });
  }

  for (const path of snapshotStorePaths) {
    test(`${path} uses IndexedDB snapshot persistence`, () => {
      const source = readSource(path);
      expect(source).toContain("createIndexedDBPersistStorage");
      expect(source).not.toContain("createDebouncedPersistStorage()");
      expect(source).not.toContain("createJSONStorage(() => localStorage)");
    });
  }

  test("async hydration gates consumers and cloud sync paths", () => {
    const textEditState = readSource(
      "src/apps/textedit/hooks/useTextEditState.ts"
    );
    const stickiesApp = readSource(
      "src/apps/stickies/components/StickiesAppComponent.tsx"
    );
    const ipodUpdateChecker = readSource(
      "src/apps/ipod/hooks/useLibraryUpdateChecker.ts"
    );
    const syncCodecs = readSource("src/sync/codecs.ts");

    expect(textEditState).toContain(
      "usePersistHydrated(useTextEditStore.persist)"
    );
    expect(stickiesApp).toContain(
      "usePersistHydrated(useStickiesStore.persist)"
    );
    expect(ipodUpdateChecker).toContain(
      "usePersistHydrated(useIpodStore.persist)"
    );
    expect(readSource("src/apps/books/hooks/useBooksLogic.ts")).toContain(
      "usePersistHydrated(useBooksStore.persist)"
    );
    expect(syncCodecs).toContain(
      "return useIpodStore.persist.hasHydrated();"
    );
    for (const store of [
      "useBooksStore",
      "useCalendarStore",
      "useVideoStore",
      "useTvStore",
    ]) {
      expect(syncCodecs).toContain(
        `return ${store}.persist.hasHydrated();`
      );
    }
  });

  test("full-state stores partialize away action functions", () => {
    expect(readSource("src/stores/useStickiesStore.ts")).toContain(
      "partialize: (state) => ({ notes: state.notes })"
    );
    expect(readSource("src/stores/useContactsStore.ts")).toContain(
      "partialize: (state) => ({"
    );
  });
});

describe("TextEdit dropped-file staging", () => {
  test("keeps the pending File per instance and reuses the import path", () => {
    const dragAndDrop = readSource(
      "src/apps/textedit/hooks/useDragAndDrop.ts"
    );
    const component = readSource(
      "src/apps/textedit/components/TextEditAppComponent.tsx"
    );
    const dialogs = readSource(
      "src/apps/textedit/components/DialogManager.tsx"
    );

    expect(dragAndDrop).toContain("onConfirmOverwrite(file)");
    expect(dragAndDrop).not.toContain("localStorage.setItem");
    expect(component).toContain("pendingImportRef");
    expect(component).toContain("handleImportFile(file)");
    expect(component).not.toContain(
      'localStorage.getItem("ryos:pending-file-open")'
    );
    expect(dialogs).toContain("onCancelConfirmNew");
  });
});
