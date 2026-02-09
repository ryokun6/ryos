#!/usr/bin/env bun

import { dbOperations } from "../src/apps/finder/utils/fileDatabase";
import { STORES } from "../src/utils/indexedDB";
import {
  attemptLocalFileReplacement,
  mergeContentByWriteMode,
  persistUpdatedLocalFileContent,
  replaceAndPersistLocalFileContent,
  replaceSingleOccurrence,
  readLocalFileTextOrThrow,
  readOptionalTextContentFromStore,
  readTextContentFromStore,
  requireActiveFileWithUuid,
  saveDocumentTextFile,
  writeDocumentFileWithMode,
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

const withMockDbPut = async (
  mockPut: typeof dbOperations.put,
  run: () => Promise<void>,
): Promise<void> => {
  const originalPut = dbOperations.put;
  dbOperations.put = mockPut;
  try {
    await run();
  } finally {
    dbOperations.put = originalPut;
  }
};

const withMockAddItem = async (
  mockAddItem: ReturnType<typeof useFilesStore.getState>["addItem"],
  run: () => Promise<void>,
): Promise<void> => {
  const originalAddItem = useFilesStore.getState().addItem;
  useFilesStore.setState({ addItem: mockAddItem });
  try {
    await run();
  } finally {
    useFilesStore.setState({ addItem: originalAddItem });
  }
};

const withMockUpdateItemMetadata = async (
  mockUpdateItemMetadata: ReturnType<typeof useFilesStore.getState>["updateItemMetadata"],
  run: () => Promise<void>,
): Promise<void> => {
  const originalUpdateItemMetadata = useFilesStore.getState().updateItemMetadata;
  useFilesStore.setState({ updateItemMetadata: mockUpdateItemMetadata });
  try {
    await run();
  } finally {
    useFilesStore.setState({ updateItemMetadata: originalUpdateItemMetadata });
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
        "/": {
          path: "/",
          name: "/",
          isDirectory: true,
          status: "active",
        },
        "/Documents": {
          path: "/Documents",
          name: "Documents",
          isDirectory: true,
          status: "active",
        },
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

  await runTest("attemptLocalFileReplacement returns updated file payload on unique match", async () => {
    await withMockFileItems(
      {
        "/Documents/edit.md": {
          path: "/Documents/edit.md",
          name: "edit.md",
          isDirectory: false,
          status: "active",
          uuid: "uuid-edit",
        },
      },
      async () => {
        await withMockDbGet(
          async <T>() => ({ name: "edit.md", content: "hello old world" } as T),
          async () => {
            const replacement = await attemptLocalFileReplacement({
              path: "/Documents/edit.md",
              storeName: STORES.DOCUMENTS,
              oldString: "old",
              newString: "new",
              errors: {
                notFound: "nf",
                missingContent: "missing",
                readFailed: "rf",
              },
            });
            assertEq(replacement.ok, true);
            if (!replacement.ok) {
              throw new Error("Expected replacement success");
            }
            assertEq(replacement.fileItem.uuid, "uuid-edit");
            assertEq(replacement.updatedContent, "hello new world");
          },
        );
      },
    );
  });

  await runTest("attemptLocalFileReplacement returns multiple-match metadata", async () => {
    await withMockFileItems(
      {
        "/Documents/edit.md": {
          path: "/Documents/edit.md",
          name: "edit.md",
          isDirectory: false,
          status: "active",
          uuid: "uuid-edit",
        },
      },
      async () => {
        await withMockDbGet(
          async <T>() => ({ name: "edit.md", content: "same same same" } as T),
          async () => {
            const replacement = await attemptLocalFileReplacement({
              path: "/Documents/edit.md",
              storeName: STORES.DOCUMENTS,
              oldString: "same",
              newString: "diff",
              errors: {
                notFound: "nf",
                missingContent: "missing",
                readFailed: "rf",
              },
            });
            assertEq(replacement.ok, false);
            if (replacement.ok) {
              throw new Error("Expected replacement failure");
            }
            assertEq(replacement.reason, "multiple_matches");
            assertEq(replacement.occurrences, 3);
          },
        );
      },
    );
  });

  await runTest("replaceAndPersistLocalFileContent persists successful replacement", async () => {
    let persistedRecordName = "";
    let persistedContent = "";
    let updateSize: number | undefined;
    await withMockFileItems(
      {
        "/Documents/edit.md": {
          path: "/Documents/edit.md",
          name: "edit.md",
          isDirectory: false,
          status: "active",
          uuid: "uuid-edit",
        },
      },
      async () => {
        await withMockDbGet(
          async <T>() => ({ name: "edit.md", content: "replace me" } as T),
          async () => {
            await withMockDbPut(
              async <T>(_storeName: string, item: T) => {
                persistedRecordName = (item as { name: string }).name;
                persistedContent = (item as { content: string }).content;
              },
              async () => {
                await withMockUpdateItemMetadata(async (_path, updates) => {
                  updateSize = updates.size;
                }, async () => {
                  const replacement = await replaceAndPersistLocalFileContent({
                    path: "/Documents/edit.md",
                    storeName: STORES.DOCUMENTS,
                    oldString: "replace",
                    newString: "updated",
                    errors: {
                      notFound: "nf",
                      missingContent: "missing",
                      readFailed: "rf",
                    },
                    resolveRecordName: (fileItem) => fileItem.name,
                  });
                  assertEq(replacement.ok, true);
                  if (!replacement.ok) {
                    throw new Error("Expected persisted replacement success");
                  }
                  assertEq(replacement.updatedContent, "updated me");
                });
              },
            );
          },
        );
      },
    );

    assertEq(persistedRecordName, "edit.md");
    assertEq(persistedContent, "updated me");
    assertEq(updateSize, new Blob(["updated me"]).size);
  });

  await runTest("replaceAndPersistLocalFileContent short-circuits on failed match", async () => {
    let dbPutCalled = false;
    await withMockFileItems(
      {
        "/Documents/edit.md": {
          path: "/Documents/edit.md",
          name: "edit.md",
          isDirectory: false,
          status: "active",
          uuid: "uuid-edit",
        },
      },
      async () => {
        await withMockDbGet(
          async <T>() => ({ name: "edit.md", content: "same same" } as T),
          async () => {
            await withMockDbPut(
              async () => {
                dbPutCalled = true;
              },
              async () => {
                const replacement = await replaceAndPersistLocalFileContent({
                  path: "/Documents/edit.md",
                  storeName: STORES.DOCUMENTS,
                  oldString: "same",
                  newString: "diff",
                  errors: {
                    notFound: "nf",
                    missingContent: "missing",
                    readFailed: "rf",
                  },
                  resolveRecordName: (fileItem) => fileItem.name,
                });
                assertEq(replacement.ok, false);
                if (replacement.ok) {
                  throw new Error("Expected replacement failure");
                }
                assertEq(replacement.reason, "multiple_matches");
              },
            );
          },
        );
      },
    );

    assertEq(dbPutCalled, false);
  });

  console.log(section("Write mode merge"));
  await runTest("overwrite mode ignores existing content", async () => {
    const merged = mergeContentByWriteMode({
      mode: "overwrite",
      incomingContent: "new",
      existingContent: "old",
    });
    assertEq(merged, "new");
  });

  await runTest("append mode concatenates existing then incoming content", async () => {
    const merged = mergeContentByWriteMode({
      mode: "append",
      incomingContent: " +new",
      existingContent: "old",
    });
    assertEq(merged, "old +new");
  });

  await runTest("prepend mode concatenates incoming then existing content", async () => {
    const merged = mergeContentByWriteMode({
      mode: "prepend",
      incomingContent: "new+ ",
      existingContent: "old",
    });
    assertEq(merged, "new+ old");
  });

  await runTest("append/prepend fall back to incoming content when existing is null", async () => {
    assertEq(
      mergeContentByWriteMode({
        mode: "append",
        incomingContent: "new",
        existingContent: null,
      }),
      "new",
    );
    assertEq(
      mergeContentByWriteMode({
        mode: "prepend",
        incomingContent: "new",
        existingContent: null,
      }),
      "new",
    );
  });

  console.log(section("Content persistence"));
  await runTest("persists updated local file content and refreshes existing metadata size", async () => {
    let capturedStore = "";
    let capturedName = "";
    let capturedUuid = "";
    let capturedContent = "";
    let capturedUpdatePath = "";
    let capturedUpdateSize: number | undefined;

    await withMockDbPut(
      async <T>(storeName: string, item: T, key?: IDBValidKey) => {
        capturedStore = storeName;
        capturedUuid = String(key);
        capturedName = (item as { name: string }).name;
        capturedContent = (item as { content: string }).content;
      },
      async () => {
        await withMockFileItems(
          {
            "/Documents/test.md": {
              path: "/Documents/test.md",
              name: "test.md",
              isDirectory: false,
              status: "active",
              uuid: "uuid-42",
            },
          },
          async () => {
            await withMockUpdateItemMetadata(async (path, updates) => {
              capturedUpdatePath = path;
              capturedUpdateSize = updates.size;
            }, async () => {
              await persistUpdatedLocalFileContent({
                fileItem: {
                  path: "/Documents/test.md",
                  name: "test.md",
                  isDirectory: false,
                  status: "active",
                  uuid: "uuid-42",
                },
                storeName: STORES.DOCUMENTS,
                content: "updated body",
                recordName: "test.md",
              });
            });
          });
      },
    );

    assertEq(capturedStore, STORES.DOCUMENTS);
    assertEq(capturedUuid, "uuid-42");
    assertEq(capturedName, "test.md");
    assertEq(capturedContent, "updated body");
    assertEq(capturedUpdatePath, "/Documents/test.md");
    assertEq(capturedUpdateSize, new Blob(["updated body"]).size);
  });

  await runTest("falls back to addItem metadata write when store item is missing", async () => {
    let capturedAddItemSize: number | undefined;
    await withMockDbPut(
      async () => {},
      async () => {
        await withMockFileItems({}, async () => {
          await withMockAddItem(async (item) => {
            capturedAddItemSize = item.size;
          }, async () => {
            await persistUpdatedLocalFileContent({
              fileItem: {
                path: "/Documents/missing.md",
                name: "missing.md",
                isDirectory: false,
                status: "active",
                uuid: "uuid-missing",
              },
              storeName: STORES.DOCUMENTS,
              content: "fallback body",
              recordName: "missing.md",
            });
          });
        });
      },
    );

    assertEq(capturedAddItemSize, new Blob(["fallback body"]).size);
  });

  await runTest("saveDocumentTextFile persists content and returns saved metadata", async () => {
    let capturedStore = "";
    let capturedName = "";
    let capturedUuid = "";
    let capturedContent = "";

    await withMockDbPut(
      async <T>(storeName: string, item: T, key?: IDBValidKey) => {
        capturedStore = storeName;
        capturedUuid = String(key);
        capturedName = (item as { name: string }).name;
        capturedContent = (item as { content: string }).content;
      },
      async () => {
        await withMockFileItems({}, async () => {
          await withMockAddItem(async (item) => {
            const currentItems = useFilesStore.getState().items;
            useFilesStore.setState({
              items: {
                ...currentItems,
                [item.path]: {
                  ...item,
                  status: "active",
                  uuid: "uuid-generated",
                },
              },
            });
          }, async () => {
            const savedItem = await saveDocumentTextFile({
              path: "/Documents/new.md",
              fileName: "new.md",
              content: "hello world",
            });

            assertEq(savedItem.uuid, "uuid-generated");
          });
        });
      },
    );

    assertEq(capturedStore, STORES.DOCUMENTS);
    assertEq(capturedUuid, "uuid-generated");
    assertEq(capturedName, "new.md");
    assertEq(capturedContent, "hello world");
  });

  await runTest("saveDocumentTextFile throws when metadata uuid is unavailable", async () => {
    await withMockDbPut(async () => {}, async () => {
      await withMockFileItems({}, async () => {
        await withMockAddItem(async () => {
          // Simulate addItem failure to persist metadata
        }, async () => {
          let thrown: Error | null = null;
          try {
            await saveDocumentTextFile({
              path: "/Documents/bad.md",
              fileName: "bad.md",
              content: "content",
            });
          } catch (error) {
            thrown = error as Error;
          }

          assertEq(thrown?.message, "Failed to save document metadata");
        });
      });
    });
  });

  await runTest("saveDocumentTextFile updates existing active file without re-adding metadata", async () => {
    let addItemCalled = false;
    let updatePath = "";
    let updateSize: number | undefined;
    let capturedUuid = "";

    await withMockDbPut(
      async <T>(_storeName: string, _item: T, key?: IDBValidKey) => {
        capturedUuid = String(key);
      },
      async () => {
        await withMockFileItems(
          {
            "/Documents/existing.md": {
              path: "/Documents/existing.md",
              name: "existing.md",
              isDirectory: false,
              status: "active",
              uuid: "uuid-existing",
            },
          },
          async () => {
            await withMockAddItem(async () => {
              addItemCalled = true;
            }, async () => {
              await withMockUpdateItemMetadata(async (path, updates) => {
                updatePath = path;
                updateSize = updates.size;
              }, async () => {
                const savedItem = await saveDocumentTextFile({
                  path: "/Documents/existing.md",
                  fileName: "existing.md",
                  content: "updated existing body",
                });
                assertEq(savedItem.uuid, "uuid-existing");
              });
            });
          },
        );
      },
    );

    assertEq(addItemCalled, false);
    assertEq(updatePath, "/Documents/existing.md");
    assertEq(updateSize, new Blob(["updated existing body"]).size);
    assertEq(capturedUuid, "uuid-existing");
  });

  console.log(section("Mode-based document write"));
  await runTest("writeDocumentFileWithMode appends onto existing document content", async () => {
    let capturedDbContent = "";
    await withMockDbGet(
      async <T>(_storeName: string, key: string) => {
        if (key === "uuid-existing-write") {
          return { name: "existing.md", content: "existing" } as T;
        }
        return undefined;
      },
      async () => {
        await withMockDbPut(
          async <T>(_storeName: string, item: T) => {
            capturedDbContent = (item as { content: string }).content;
          },
          async () => {
            await withMockFileItems(
              {
                "/Documents/existing.md": {
                  path: "/Documents/existing.md",
                  name: "existing.md",
                  isDirectory: false,
                  status: "active",
                  uuid: "uuid-existing-write",
                },
              },
              async () => {
                const result = await writeDocumentFileWithMode({
                  path: "/Documents/existing.md",
                  fileName: "existing.md",
                  incomingContent: " +append",
                  mode: "append",
                });
                assertEq(result.isNewFile, false);
                assertEq(result.finalContent, "existing +append");
              },
            );
          },
        );
      },
    );

    assertEq(capturedDbContent, "existing +append");
  });

  await runTest("writeDocumentFileWithMode creates new document on overwrite mode", async () => {
    let dbGetCalled = false;
    let capturedDbContent = "";

    await withMockDbGet(
      async () => {
        dbGetCalled = true;
        return undefined;
      },
      async () => {
        await withMockDbPut(
          async <T>(_storeName: string, item: T) => {
            capturedDbContent = (item as { content: string }).content;
          },
          async () => {
            await withMockFileItems({}, async () => {
              await withMockAddItem(async (item) => {
                useFilesStore.setState({
                  items: {
                    ...useFilesStore.getState().items,
                    [item.path]: {
                      ...item,
                      status: "active",
                      uuid: "uuid-created-write",
                    },
                  },
                });
              }, async () => {
                const result = await writeDocumentFileWithMode({
                  path: "/Documents/new-write.md",
                  fileName: "new-write.md",
                  incomingContent: "new body",
                  mode: "overwrite",
                });
                assertEq(result.isNewFile, true);
                assertEq(result.finalContent, "new body");
              });
            });
          },
        );
      },
    );

    assertEq(dbGetCalled, false);
    assertEq(capturedDbContent, "new body");
  });

  await runTest("writeDocumentFileWithMode throws when append target content is unavailable", async () => {
    await withMockDbGet(
      async () => undefined,
      async () => {
        await withMockFileItems(
          {
            "/Documents/broken.md": {
              path: "/Documents/broken.md",
              name: "broken.md",
              isDirectory: false,
              status: "active",
              uuid: "uuid-broken",
            },
          },
          async () => {
            let thrown: Error | null = null;
            try {
              await writeDocumentFileWithMode({
                path: "/Documents/broken.md",
                fileName: "broken.md",
                incomingContent: " +append",
                mode: "append",
              });
            } catch (error) {
              thrown = error as Error;
            }

            assertEq(
              thrown?.message,
              "Failed to load existing document content",
            );
          },
        );
      },
    );
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
