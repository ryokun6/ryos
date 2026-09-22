/** Opt-in browser persistence checks against a local Vite server. */
import { chromium, type Page } from "playwright";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const origin = process.env.SYNC_BROWSER_URL || "http://127.0.0.1:15173";
assert(["localhost", "127.0.0.1"].includes(new URL(origin).hostname), "Use an isolated local server");
const profile = await mkdtemp(join(tmpdir(), "ryos-sync-browser-"));
const context = await chromium.launchPersistentContext(profile, { headless: true, ...(process.env.SYNC_BROWSER_CHANNEL ? { channel: process.env.SYNC_BROWSER_CHANNEL } : {}) });
await context.grantPermissions(["local-network-access"], { origin });
await context.route(url => url.pathname.startsWith("/api/"), route => route.fulfill({ contentType: "application/json", body: JSON.stringify({ ok: true, authenticated: true, username: "browser-sync-canary", entries: {}, seq: 0, ops: [] }) }));
// Load the real source modules without starting the desktop or authenticated services.
await context.route(origin + "/", route => route.fulfill({ contentType: "text/html", body: `<!doctype html><div>Isolated sync persistence test</div><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script>` }));
async function setup(page: Page) {
  page.on("requestfailed", request => console.error("REQUEST FAILED", request.url(), request.failure()?.errorText));
  page.on("console", message => { if (message.type() === "error") console.error("CONSOLE", message.text()); });
  page.on("response", response => { if (response.status() >= 400) console.error("HTTP", response.status(), response.url()); });
  page.on("pageerror", error => console.error("PAGE ERROR", error.message));
  await page.goto(origin, { waitUntil: "networkidle" });
  await page.evaluate(async () => {
    const { useFilesStore } = await import("/src/stores/useFilesStore.ts");
    const { useChatsStore } = await import("/src/stores/useChatsStore.ts");
    const { settleAllPersistWrites } = await import("/src/utils/persistWriteQueue.ts");
    while (!useFilesStore.persist.hasHydrated() || !useChatsStore.persist.hasHydrated()) await new Promise(resolve => setTimeout(resolve, 10));
    await settleAllPersistWrites();
    useChatsStore.setState({ username: "browser-sync-canary" });
  });
}
async function save(page: Page, path: string, text: string, book = false) {
  await page.evaluate(async ({ path, text, book }) => {
    const { saveVfsFile } = await import("/src/services/vfs/FileSaveTransaction.ts");
    await saveVfsFile({ path, name: path.slice(1), uuid: path.slice(1), isDirectory: false, status: "active", modifiedAt: Date.now() }, book ? new Blob([text], { type: "application/epub+zip" }) : text);
    const { settleAllPersistWrites } = await import("/src/utils/persistWriteQueue.ts");
    await settleAllPersistWrites();
  }, { path, text, book });
}
try {
  const first = await context.newPage();
  await setup(first);
  await save(first, "/browser-saved.md", "committed document");
  await save(first, "/browser-saved.epub", "committed epub", true);
  const session = await context.newCDPSession(first);
  const crashed = first.waitForEvent("crash");
  void session.send("Page.crash").catch(() => {});
  await crashed;
  await first.close();
  const second = await context.newPage();
  await setup(second);
  const recovered = await second.evaluate(async () => {
    const { dbOperations, STORES } = await import("/src/utils/indexedDB.ts");
    const { readFileMutations } = await import("/src/sync/fileMutationJournal.ts");
    const doc = await dbOperations.get(STORES.DOCUMENTS, "browser-saved.md");
    const book = await dbOperations.get(STORES.BOOKS, "browser-saved.epub");
    const pending = await readFileMutations("browser-sync-canary");
    return { doc: doc?.content, book: new TextDecoder().decode(book?.content), queued: pending.filter(m => m.content?.key.endsWith("browser-saved.md") || m.content?.key.endsWith("browser-saved.epub")).length };
  });
  assert.deepEqual(recovered, { doc: "committed document", book: "committed epub", queued: 2 });
  console.log("PASS: document, EPUB and exact queued content survive a renderer crash");

  const third = await context.newPage();
  await setup(third);
  await Promise.all([save(second, "/tab-a.md", "A"), save(third, "/tab-b.md", "B")]);
  const rows = await second.evaluate(async () => {
    const { dbOperations, STORES } = await import("/src/utils/indexedDB.ts");
    return Promise.all(["/tab-a.md", "/tab-b.md"].map(async path => (await dbOperations.get(STORES.VFS_ITEMS, path))?.item.path));
  });
  assert.deepEqual(rows, ["/tab-a.md", "/tab-b.md"]);
  console.log("PASS: concurrent tabs preserve both files");

  const aborted = await second.evaluate(async () => {
    const { saveVfsFile } = await import("/src/services/vfs/FileSaveTransaction.ts");
    const { dbOperations, STORES } = await import("/src/utils/indexedDB.ts");
    const { settleAllPersistWrites } = await import("/src/utils/persistWriteQueue.ts");
    await settleAllPersistWrites();
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      if (this.name === STORES.DOCUMENTS && args[1] === "abort.md") {
        request.addEventListener("success", () => this.transaction.abort());
      }
      return request;
    };
    let rejected = false;
    try {
      await saveVfsFile({ path: "/abort.md", name: "abort.md", uuid: "abort.md", isDirectory: false, status: "active" }, "must not commit");
    } catch { rejected = true; }
    finally { IDBObjectStore.prototype.put = put; }
    return { rejected, row: Boolean(await dbOperations.get(STORES.VFS_ITEMS, "/abort.md")), bytes: Boolean(await dbOperations.get(STORES.DOCUMENTS, "abort.md")) };
  });
  assert.deepEqual(aborted, { rejected: true, row: false, bytes: false });
  console.log("PASS: abort after a successful put rolls back catalog and bytes, and rejects save");

  await second.evaluate(async () => {
    const { transitionVfsFiles } = await import("/src/services/vfs/FileLifecycleTransaction.ts");
    const { saveVfsFile } = await import("/src/services/vfs/FileSaveTransaction.ts");
    const { useFilesStore } = await import("/src/stores/useFilesStore.ts");
    useFilesStore.getState().addItem({ path: "/Lifecycle", name: "Lifecycle", isDirectory: true });
    for (const ext of ["md", "png", "epub", "html"]) {
      await saveVfsFile({ path: `/Lifecycle/file.${ext}`, name: `file.${ext}`, uuid: `lifecycle-${ext}`, isDirectory: false, status: "active" },
        ["png", "epub"].includes(ext) ? new Blob([`bytes-${ext}`]) : `bytes-${ext}`);
    }
    await transitionVfsFiles({ kind: "trash", path: "/Lifecycle" });
  });
  const lifecycleSession = await context.newCDPSession(second);
  const lifecycleCrash = second.waitForEvent("crash");
  void lifecycleSession.send("Page.crash").catch(() => {});
  await lifecycleCrash;
  await second.close();
  const fourth = await context.newPage();
  await setup(fourth);
  const lifecycle = await fourth.evaluate(async () => {
    const { transitionVfsFiles } = await import("/src/services/vfs/FileLifecycleTransaction.ts");
    const { dbOperations, STORES } = await import("/src/utils/indexedDB.ts");
    const { readFileMutations } = await import("/src/sync/fileMutationJournal.ts");
    const formats = [["md", STORES.DOCUMENTS], ["png", STORES.IMAGES], ["epub", STORES.BOOKS], ["html", STORES.APPLETS]];
    const queued = (await readFileMutations("browser-sync-canary")).filter(m => m.content?.key.startsWith("trash/item:lifecycle-"));
    const trashed = await Promise.all(formats.map(async ([ext, store]) => Boolean(await dbOperations.get(STORES.TRASH, `lifecycle-${ext}`)) && !await dbOperations.get(store, `lifecycle-${ext}`)));
    await transitionVfsFiles({ kind: "restore", path: "/Lifecycle" });
    const restored = await Promise.all(formats.map(async ([ext, store]) => {
      const value = await dbOperations.get(store, `lifecycle-${ext}`);
      const content = value?.content;
      const text = content instanceof Blob ? await content.text() : content instanceof ArrayBuffer ? new TextDecoder().decode(content) : content;
      return text === `bytes-${ext}` && !await dbOperations.get(STORES.TRASH, `lifecycle-${ext}`);
    }));
    return { queued: queued.length, trashed, restored };
  });
  assert.deepEqual(lifecycle, { queued: 4, trashed: [true, true, true, true], restored: [true, true, true, true] });
  console.log("PASS: folder trash survives a renderer crash and restores all four content formats");
  const readable = await fourth.evaluate(async () => {
    const { transitionVfsFiles } = await import("/src/services/vfs/FileLifecycleTransaction.ts");
    const { useFilesStore } = await import("/src/stores/useFilesStore.ts");
    const { readDocumentTextContent, readImageBlobContent, readBookBlobContent, readAppletTextContent } = await import("/src/services/vfs/FileContentRepository.ts");
    if (!useFilesStore.getState().items["/Documents"]) useFilesStore.getState().addItem({ path: "/Documents", name: "Documents", isDirectory: true });
    await transitionVfsFiles({ kind: "move", path: "/Lifecycle", destination: "/Documents/Lifecycle" });
    return Promise.all([
      readDocumentTextContent("/Documents/Lifecycle/file.md"),
      readImageBlobContent("/Documents/Lifecycle/file.png").then(blob => blob?.text()),
      readBookBlobContent("/Documents/Lifecycle/file.epub").then(blob => blob?.text()),
      readAppletTextContent("/Documents/Lifecycle/file.html"),
    ]);
  });
  assert.deepEqual(readable, ["bytes-md", "bytes-png", "bytes-epub", "bytes-html"]);
  console.log("PASS: all four typed readers open files after a cross-store folder move");
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
