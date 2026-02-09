#!/usr/bin/env bun

import { dbOperations } from "../src/apps/finder/utils/fileDatabase";
import { STORES } from "../src/utils/indexedDB";
import {
  replaceSingleOccurrence,
  readLocalFileTextOrThrow,
  readOptionalTextContentFromStore,
  readTextContentFromStore,
  requireActiveFileWithUuid,
} from "../src/apps/chats/utils/localFileContent";
import { useFilesStore } from "../src/stores/useFilesStore";
import {
  assert,
  assertEq,
  clearResults,
  header,
  printSummary,
  runTest,
  section,
} from "./test-utils";

type FileItemsState = ReturnType<typeof useFilesStore.getState>["items"];

const withMockFileItems = async (
  items: FileItemsState,
  run: () => Promise<void>,
): Promise<void> => {
  const originalItems = useFilesStore.getState().items;
  useFilesStore.setState({ items });
  try {
    await run();
  } finally {
    useFilesStore.setState({ items: originalItems });
  }
};

const withMockDbGet = async (
  mockGet: typeof dbOperations.get,
  run: () => Promise<void>,
): Promise<void> => {
  const originalGet = dbOperations.get;
  dbOperations.get = mockGet;
  try {
    await run();
  } finally {
    dbOperations.get = originalGet;
  }
};

export async function runChatLocalFileContentTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Chat Local File Content Tests"));

  console.log(section("File metadata guards"));
  await runTest("requires active file item", async () => {
    await withMockFileItems({}, async () => {
      let thrown: Error | null = null;
      try {
        requireActiveFileWithUuid(
          "/Documents/test.md",
          "not-found",
          "missing-uuid",
        );
      } catch (error) {
        thrown = error as Error;
      }
      assertEq(thrown?.message, "not-found");
    });
  });

  await runTest("requires UUID for active file", async () => {
    await withMockFileItems(
      {
        "/Documents/test.md": {
          path: "/Documents/test.md",
          name: "test.md",
          isDirectory: false,
          status: "active",
        },
      },
      async () => {
        let thrown: Error | null = null;
        try {
          requireActiveFileWithUuid(
            "/Documents/test.md",
            "not-found",
            "missing-uuid",
          );
        } catch (error) {
          thrown = error as Error;
        }
        assertEq(thrown?.message, "missing-uuid");
      },
    );
  });

  await runTest("returns active file item with uuid", async () => {
    await withMockFileItems(
      {
        "/Documents/test.md": {
          path: "/Documents/test.md",
          name: "test.md",
          isDirectory: false,
          status: "active",
          uuid: "uuid-1",
        },
      },
      async () => {
        const fileItem = requireActiveFileWithUuid(
          "/Documents/test.md",
          "not-found",
          "missing-uuid",
        );
        assertEq(fileItem.uuid, "uuid-1");
      },
    );
  });

  console.log(section("Content loading"));
  await runTest("reads string content from indexeddb store", async () => {
    await withMockDbGet(
      async <T>() => ({ name: "test", content: "hello" } as T),
      async () => {
        const content = await readTextContentFromStore(
          STORES.DOCUMENTS,
          "uuid-1",
          "read-failed",
        );
        assertEq(content, "hello");
      },
    );
  });

  await runTest("reads Blob content from indexeddb store", async () => {
    await withMockDbGet(
      async <T>() =>
        ({ name: "test", content: new Blob(["blob-text"]) } as T),
      async () => {
        const content = await readTextContentFromStore(
          STORES.APPLETS,
          "uuid-blob",
          "read-failed",
        );
        assertEq(content, "blob-text");
      },
    );
  });

  await runTest("throws configured error when content is missing", async () => {
    await withMockDbGet(async () => undefined, async () => {
      let thrown: Error | null = null;
      try {
        await readTextContentFromStore(
          STORES.DOCUMENTS,
          "uuid-missing",
          "read-failed",
        );
      } catch (error) {
        thrown = error as Error;
      }
      assertEq(thrown?.message, "read-failed");
    });
  });

  await runTest("returns null for optional content read when record is missing", async () => {
    await withMockDbGet(async () => undefined, async () => {
      const content = await readOptionalTextContentFromStore(
        STORES.DOCUMENTS,
        "uuid-missing",
      );
      assertEq(content, null);
    });
  });

  await runTest("reads optional content when record exists", async () => {
    await withMockDbGet(
      async <T>() => ({ name: "test", content: "optional" } as T),
      async () => {
        const content = await readOptionalTextContentFromStore(
          STORES.DOCUMENTS,
          "uuid-1",
        );
        assertEq(content, "optional");
      },
    );
  });

  await runTest("composes metadata and content reads in readLocalFileTextOrThrow", async () => {
    await withMockFileItems(
      {
        "/Applets/demo.html": {
          path: "/Applets/demo.html",
          name: "demo.html",
          isDirectory: false,
          status: "active",
          uuid: "uuid-demo",
        },
      },
      async () => {
        await withMockDbGet(
          async <T>() => ({ name: "demo", content: "applet body" } as T),
          async () => {
            const result = await readLocalFileTextOrThrow(
              "/Applets/demo.html",
              STORES.APPLETS,
              {
                notFound: "nf",
                missingContent: "missing",
                readFailed: "rf",
              },
            );
            assertEq(result.fileItem.uuid, "uuid-demo");
            assertEq(result.content, "applet body");
          },
        );
      },
    );
  });

  await runTest("propagates not-found errors from readLocalFileTextOrThrow", async () => {
    await withMockFileItems({}, async () => {
      let thrown: Error | null = null;
      try {
        await readLocalFileTextOrThrow("/Documents/missing.md", STORES.DOCUMENTS, {
          notFound: "nf",
          missingContent: "missing",
          readFailed: "rf",
        });
      } catch (error) {
        thrown = error as Error;
      }
      assertEq(thrown?.message, "nf");
    });
  });

  await runTest("does not leak mocked dbOperations.get between tests", async () => {
    assert(typeof dbOperations.get === "function", "Expected db get function");
  });

  console.log(section("Text edit replacement"));
  await runTest("replaces exactly one occurrence after normalizing line endings", async () => {
    const result = replaceSingleOccurrence(
      "line-a\r\nline-b\r\nline-c",
      "line-b\nline-c",
      "line-b\nline-d",
    );
    assertEq(result.ok, true);
    if (!result.ok) {
      throw new Error("Expected replacement success");
    }
    assertEq(result.updatedContent, "line-a\nline-b\nline-d");
  });

  await runTest("returns not_found when old string is missing", async () => {
    const result = replaceSingleOccurrence("a\nb\nc", "x", "y");
    assertEq(result.ok, false);
    if (result.ok) {
      throw new Error("Expected replacement failure");
    }
    assertEq(result.reason, "not_found");
    assertEq(result.occurrences, 0);
  });

  await runTest("returns multiple_matches when old string is ambiguous", async () => {
    const result = replaceSingleOccurrence("foo foo foo", "foo", "bar");
    assertEq(result.ok, false);
    if (result.ok) {
      throw new Error("Expected replacement failure");
    }
    assertEq(result.reason, "multiple_matches");
    assertEq(result.occurrences, 3);
  });

  return printSummary();
}

if (import.meta.main) {
  runChatLocalFileContentTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
