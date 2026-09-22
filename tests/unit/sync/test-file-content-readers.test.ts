import * as engineModule from "../../../src/sync/engine";
import { getStoreForFile, getFileContentSyncKey, type FileContentStore } from "../../../src/utils/indexedDBOperations";
import { readContentForPath, readBookBlobContent, readImageBlobContent, readDocumentTextContent, readAppletTextContent } from "../../../src/services/vfs/FileContentRepository";
import "../../helpers/local-storage-stub";
import { beforeEach, afterEach, describe, expect, test, spyOn } from "bun:test";
import { resetFakeIndexedDB } from "../../helpers/reset-fake-indexeddb";
import { resetPersistWritesForTests, settleAllPersistWrites } from "../../../src/utils/persistWriteQueue";
import { dbOperations, STORES } from "../../../src/utils/indexedDB";
import { useFilesStore, type FileSystemItem } from "../../../src/stores/useFilesStore";
import { useChatsStore } from "../../../src/stores/useChatsStore";
import { readFileMutations, withRemoteFileChanges } from "../../../src/sync/fileMutationJournal";
import { saveVfsFile } from "../../../src/services/vfs/FileSaveTransaction";
import { CloudSyncEngine } from "../../../src/sync/engine";
import { useCloudSyncStore } from "../../../src/stores/useCloudSyncStore";
import type { SyncOp } from "../../../src/shared/sync2/types";
import { SYNC_CODECS } from "../../../src/sync/codecs";

const originalFetch = globalThis.fetch;
const originalFiles = useFilesStore.getState();
const originalChats = useChatsStore.getState();
const originalCloud = useCloudSyncStore.getState();
const account = "transaction-test";
const item = (extension = "md"): FileSystemItem => ({ path: `/saved.${extension}`, name: `saved.${extension}`, uuid: "saved-content", isDirectory: false, status: "active", modifiedAt: 1 });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
beforeEach(async () => {
  resetPersistWritesForTests();
  resetFakeIndexedDB();
  globalThis.fetch = (async () => response({ authenticated: true, username: account, directories: [], files: [] })) as typeof fetch;
  withRemoteFileChanges(() => useFilesStore.setState({ items: {}, libraryState: "loaded" }));
  useChatsStore.setState({ username: account });
  useCloudSyncStore.setState({ autoSyncEnabled: true, syncFiles: true });
  await settleAllPersistWrites();
  useChatsStore.setState({ username: account });
});
afterEach(() => {
  withRemoteFileChanges(() => useFilesStore.setState(originalFiles));
  useChatsStore.setState(originalChats);
  useCloudSyncStore.setState(originalCloud);
  resetPersistWritesForTests();
  globalThis.fetch = originalFetch;
});

async function metadata(path: string, extra: Partial<FileSystemItem> = {}) {
  const file = { ...item(), path, name: path.split("/").pop()!, ...extra };
  withRemoteFileChanges(() => useFilesStore.setState({ items: { ...useFilesStore.getState().items, [path]: file } }));
  await settleAllPersistWrites();
  return file;
}
const t = "01799900000000-0000-test";
const documentOp = (content: string, timestamp = t): SyncOp => ({ k: "files/doc:saved-content", t: timestamp, v: { key: "saved-content", value: { name: "saved.md", content } } });

describe("shared file content readers", () => {
  test("explicit addresses override folders, while legacy routing remains unchanged", () => {
    expect(getStoreForFile("/Documents/book.epub", { contentStore: STORES.BOOKS })).toBe(STORES.BOOKS);
    expect(getStoreForFile("/Documents/book.epub")).toBe(STORES.DOCUMENTS);
    expect(getStoreForFile("/Custom/book.epub")).toBe(STORES.BOOKS);
    expect(getStoreForFile("/Custom/book.epub", { status: "trashed" })).toBe(STORES.TRASH);
    expect(getStoreForFile("/Custom/book.epub", { status: "trashed", contentStore: STORES.BOOKS })).toBe(STORES.BOOKS);
    expect(getStoreForFile("/Custom/book.epub", { contentStore: "chats_ai_messages" as FileContentStore })).toBeNull();
    expect(getStoreForFile("/Sites/book.epub", { contentStore: STORES.BOOKS })).toBeNull();
    expect(getStoreForFile("/Custom/folder", { isDirectory: true, contentStore: STORES.BOOKS })).toBeNull();
  });

  test("typed readers open content after legacy cross-store moves", async () => {
    const book = await metadata("/Documents/book.epub");
    await dbOperations.put(STORES.DOCUMENTS, { name: book.name, content: new Blob(["EPUB bytes"]) }, book.uuid!);
    expect(await (await readBookBlobContent(book.path))?.text()).toBe("EPUB bytes");
    const image = await metadata("/Books/image.svg", { uuid: "image" });
    await dbOperations.put(STORES.BOOKS, { name: image.name, content: new TextEncoder().encode("<svg/>").buffer }, image.uuid!);
    const blob = await readImageBlobContent(image.path);
    expect(blob?.type).toBe("image/svg+xml");
    expect(await blob?.text()).toBe("<svg/>");
    const document = await metadata("/Images/note.md", { uuid: "doc" });
    await dbOperations.put(STORES.IMAGES, { name: document.name, content: new TextEncoder().encode("notes").buffer }, document.uuid!);
    expect(await readDocumentTextContent(document.path)).toBe("notes");
    const applet = await metadata("/Books/app.html", { uuid: "app" });
    await dbOperations.put(STORES.BOOKS, { name: applet.name, content: new TextEncoder().encode("<html/>").buffer }, applet.uuid!);
    expect(await readAppletTextContent(applet.path)).toBe("<html/>");
  });

  test("a future-format file reads its stored address instead of an unrelated local record", async () => {
    const file = await metadata("/Documents/book.epub", { contentStore: STORES.BOOKS });
    await dbOperations.put(STORES.BOOKS, { name: file.name, content: new TextEncoder().encode("correct").buffer }, file.uuid!);
    await dbOperations.put(STORES.DOCUMENTS, { name: file.name, content: "wrong store" }, file.uuid!);
    expect(await (await readBookBlobContent(file.path))?.text()).toBe("correct");
    expect(getFileContentSyncKey(file.path, file)).toBe("books/item:saved-content");
    expect(getFileContentSyncKey(file.path, { ...file, contentStore: STORES.IMAGES })).toBe("images/item:saved-content");
  });

  test("saving an addressed file preserves its content store, without migrating legacy saves", async () => {
    const file = await metadata("/renamed.epub", { contentStore: STORES.IMAGES });
    const { contentStore: _store, ...input } = file;
    await saveVfsFile(input, "new bytes");
    expect(await dbOperations.get(STORES.IMAGES, file.uuid!)).toEqual({ name: file.name, content: "new bytes" });
    expect(await dbOperations.get(STORES.BOOKS, file.uuid!)).toBeUndefined();
    expect((await readFileMutations(account)).at(-1)?.content?.key).toBe("images/item:saved-content");
    await saveVfsFile({ ...item(), uuid: "legacy" }, "legacy bytes");
    expect(useFilesStore.getState().items["/saved.md"].contentStore).toBeUndefined();
  });

  for (const [extension, store, namespace] of [["epub", STORES.BOOKS, "books"], ["png", STORES.IMAGES, "images"], ["html", STORES.APPLETS, "applets"]] as const) {
    test(`${extension} in a custom folder hydrates through the correct cloud namespace`, async () => {
      const file = await metadata(`/Custom/saved.${extension}`);
      const calls: unknown[] = [];
      const active = spyOn(engineModule, "getActiveCloudSyncEngine").mockReturnValue({
        hasPendingBlob: () => false,
        ensureBlobItemLocal: async (...args: unknown[]) => {
          calls.push(args);
          await dbOperations.put(store, { name: file.name, content: "downloaded" }, file.uuid!);
          return true;
        },
      } as unknown as CloudSyncEngine);
      try {
        expect((await readContentForPath(file.path))?.content).toBe("downloaded");
        expect(calls).toEqual([[namespace, file.uuid, { path: file.path, forceReload: undefined }]]);
      } finally { active.mockRestore(); }
    });
  }

  test("opening an applet waits for its pending revision even when old bytes exist", async () => {
    const file = await metadata("/Custom/app.html");
    await dbOperations.put(STORES.APPLETS, { name: file.name, content: "old" }, file.uuid!);
    const active = spyOn(engineModule, "getActiveCloudSyncEngine").mockReturnValue({
      hasPendingBlob: () => true,
      ensureBlobItemLocal: async () => {
        await dbOperations.put(STORES.APPLETS, { name: file.name, content: "new" }, file.uuid!);
        return true;
      },
    } as unknown as CloudSyncEngine);
    try { expect(await readAppletTextContent(file.path)).toBe("new"); }
    finally { active.mockRestore(); }
  });

  test("an address changed during a local read is resolved again", async () => {
    const file = await metadata("/Custom/book.epub", { contentStore: STORES.BOOKS });
    await dbOperations.put(STORES.BOOKS, { name: file.name, content: "old address" }, file.uuid!);
    const get = dbOperations.get.bind(dbOperations);
    let changed = false;
    const mock = spyOn(dbOperations, "get").mockImplementation(async (store, key) => {
      const value = await get(store, key);
      if (!changed && store === STORES.BOOKS) {
        changed = true;
        await dbOperations.put(STORES.IMAGES, { name: file.name, content: "new address" }, "replacement");
        await metadata(file.path, { uuid: "replacement", contentStore: STORES.IMAGES });
      }
      return value;
    });
    try { expect((await readContentForPath(file.path))?.content).toBe("new address"); }
    finally { mock.mockRestore(); }
  });

  test("local-only reads do not start a cloud transfer", async () => {
    const file = await metadata("/Custom/book.epub", { contentStore: STORES.BOOKS });
    const active = spyOn(engineModule, "getActiveCloudSyncEngine");
    try {
      expect(await readBookBlobContent(file.path, { localOnly: true })).toBeNull();
      expect(active).not.toHaveBeenCalled();
    } finally { active.mockRestore(); }
  });
});

describe("missing inline document recovery", () => {
  let ready: ReturnType<typeof spyOn>;
  beforeEach(() => { ready = spyOn(SYNC_CODECS.files, "isReady").mockReturnValue(true); });
  afterEach(() => { ready.mockRestore(); });

  test("matching cloud shadow still restores evicted local bytes without advancing the cursor", async () => {
    await metadata("/Custom/saved.md");
    const engine = await CloudSyncEngine.create(account);
    try {
      await engine.applyRemoteOps([documentOp("remote")]);
      await dbOperations.delete(STORES.DOCUMENTS, "saved-content");
      let requested = "";
      globalThis.fetch = (async input => {
        requested = String(input);
        return response({ ok: true, seq: 999, entries: { "files/doc:saved-content": { t, v: documentOp("remote").v } } });
      }) as typeof fetch;
      expect(await engine.ensureDocumentItemLocal("saved-content")).toBe(true);
      expect(requested).toContain("prefix=files%2Fdoc%3Asaved-content");
      expect((await dbOperations.get<{ content: string }>(STORES.DOCUMENTS, "saved-content"))?.content).toBe("remote");
      expect(engine.cursor).toBeNull();
    } finally { await engine.stop(); }
  });

  test("forced document recovery replaces local content only after a confirmed cloud read", async () => {
    const engine = await CloudSyncEngine.create(account);
    try {
      await engine.applyRemoteOps([documentOp("original")]);
      globalThis.fetch = (async () => response({ ok: true, seq: 999, entries: {} })) as typeof fetch;
      expect(await engine.ensureDocumentItemLocal("saved-content", { forceReload: true })).toBe(false);
      expect((await dbOperations.get<{ content: string }>(STORES.DOCUMENTS, "saved-content"))?.content).toBe("original");
      globalThis.fetch = (async () => response({ ok: true, seq: 999, entries: { "files/doc:saved-content": { t, v: documentOp("restored").v } } })) as typeof fetch;
      expect(await engine.ensureDocumentItemLocal("saved-content", { forceReload: true })).toBe(true);
      expect((await dbOperations.get<{ content: string }>(STORES.DOCUMENTS, "saved-content"))?.content).toBe("restored");
    } finally { await engine.stop(); }
  });

  test("an edit arriving during recovery retains its bytes and queued intent", async () => {
    const file = await metadata("/saved.md");
    const engine = await CloudSyncEngine.create(account);
    globalThis.fetch = (async () => {
      await saveVfsFile(file, "local edit");
      return response({ ok: true, seq: 999, entries: { "files/doc:saved-content": { t, v: documentOp("remote").v } } });
    }) as typeof fetch;
    try {
      expect(await engine.ensureDocumentItemLocal("saved-content")).toBe(true);
      expect((await dbOperations.get<{ content: string }>(STORES.DOCUMENTS, "saved-content"))?.content).toBe("local edit");
      expect(await readFileMutations(account)).toHaveLength(1);
    } finally { await engine.stop(); }
  });

  test("a stale snapshot cannot replace a newer known document revision", async () => {
    const engine = await CloudSyncEngine.create(account);
    try {
      await engine.applyRemoteOps([documentOp("newer", "01899900000000-0000-test")]);
      await dbOperations.delete(STORES.DOCUMENTS, "saved-content");
      globalThis.fetch = (async () => response({ ok: true, seq: 999, entries: { "files/doc:saved-content": { t, v: documentOp("older").v } } })) as typeof fetch;
      expect(await engine.ensureDocumentItemLocal("saved-content")).toBe(false);
      expect(await dbOperations.get(STORES.DOCUMENTS, "saved-content")).toBeUndefined();
    } finally { await engine.stop(); }
  });

  test("orphan repair follows an updated storage address even when the UUID is unchanged", async () => {
    const file = await metadata("/Books/note.md");
    const engine = await CloudSyncEngine.create(account);
    const active = spyOn(engineModule, "getActiveCloudSyncEngine").mockReturnValue(engine);
    const prefixes: string[] = [];
    globalThis.fetch = (async input => {
      const prefix = new URL(String(input), "http://localhost").searchParams.get("prefix")!;
      prefixes.push(prefix);
      const entries = prefix.startsWith("files/item:")
        ? { [prefix]: { t, v: { ...file, contentStore: STORES.DOCUMENTS } } }
        : prefix.startsWith("files/doc:") ? { [prefix]: { t, v: documentOp("recovered address").v } } : {};
      return response({ ok: true, seq: 999, entries });
    }) as typeof fetch;
    try {
      expect(await readDocumentTextContent(file.path)).toBe("recovered address");
      expect(prefixes).toEqual(["books/item:saved-content", `files/item:${file.path}`, "files/doc:saved-content"]);
      expect(useFilesStore.getState().items[file.path].contentStore).toBe(STORES.DOCUMENTS);
      expect(await readFileMutations(account)).toEqual([]);
    } finally { active.mockRestore(); await engine.stop(); }
  });

  test("orphan metadata repair cannot discard an edit made during the request", async () => {
    const file = await metadata("/saved.epub");
    const engine = await CloudSyncEngine.create(account);
    globalThis.fetch = (async input => {
      const prefix = new URL(String(input), "http://localhost").searchParams.get("prefix")!;
      if (prefix.startsWith("books/item:")) {
        await saveVfsFile(file, new Blob(["local edit"]));
        return response({ ok: true, seq: 999, entries: {} });
      }
      return response({ ok: true, seq: 999, entries: { [prefix]: { t: "01999900000000-0000-remote", v: { ...file, uuid: "remote-replacement", contentStore: STORES.DOCUMENTS } } } });
    }) as typeof fetch;
    try {
      expect(await engine.ensureBlobItemLocal("books", file.uuid!, { path: file.path })).toBe(false);
      expect(useFilesStore.getState().items[file.path].uuid).toBe(file.uuid);
      expect(await readFileMutations(account)).toHaveLength(1);
      const value = await dbOperations.get<{ content: ArrayBuffer }>(STORES.BOOKS, file.uuid!);
      expect(new TextDecoder().decode(value!.content)).toBe("local edit");
    } finally { await engine.stop(); }
  });

  test("a tombstoned document stays unavailable without issuing a write", async () => {
    const calls: string[] = [];
    globalThis.fetch = (async input => { calls.push(String(input)); return response({ ok: true, seq: 999, entries: { "files/doc:saved-content": { t, del: true } } }); }) as typeof fetch;
    const engine = await CloudSyncEngine.create(account);
    try {
      expect(await engine.ensureDocumentItemLocal("saved-content")).toBe(false);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toContain("/snapshot?");
      expect(await readFileMutations(account)).toEqual([]);
    } finally { await engine.stop(); }
  });
});
