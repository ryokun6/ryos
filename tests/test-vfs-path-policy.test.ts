/**
 * Unit tests for the VFS path policy (user-created root folders) and the
 * extension-based content-store routing that makes files outside the default
 * folders (e.g. /MyStuff/photo.png) storable, readable, and cloud-syncable.
 */
import { describe, expect, test } from "bun:test";
import {
  getRootSegment,
  isWritablePath,
  isProtectedSystemPath,
  canPathHaveContent,
  validateNewRootFolderName,
} from "@/services/vfs/pathPolicy";
import { getStoreForFile } from "@/utils/indexedDBOperations";
import { STORES } from "@/utils/indexedDB";
import {
  getCloudSyncDomainForContentStore,
  getCloudSyncDeletionBucketForContentStore,
} from "@/apps/finder/utils/fileSystemHelpers";

describe("pathPolicy.getRootSegment", () => {
  test("returns the top-level segment", () => {
    expect(getRootSegment("/Documents/notes.md")).toBe("/Documents");
    expect(getRootSegment("/MyStuff/a/b/c.txt")).toBe("/MyStuff");
    expect(getRootSegment("/MyStuff")).toBe("/MyStuff");
  });

  test("returns null for root and non-absolute paths", () => {
    expect(getRootSegment("/")).toBeNull();
    expect(getRootSegment("relative/path")).toBeNull();
  });
});

describe("pathPolicy.isWritablePath", () => {
  test("allows the root (creating new root folders)", () => {
    expect(isWritablePath("/")).toBe(true);
  });

  test("allows writable system subtrees", () => {
    expect(isWritablePath("/Documents")).toBe(true);
    expect(isWritablePath("/Documents/Sub Folder")).toBe(true);
    expect(isWritablePath("/Images")).toBe(true);
    expect(isWritablePath("/Books")).toBe(true);
    expect(isWritablePath("/Downloads")).toBe(true);
  });

  test("allows user-created root folders and their subtrees", () => {
    expect(isWritablePath("/MyStuff")).toBe(true);
    expect(isWritablePath("/MyStuff/Photos")).toBe(true);
  });

  test("rejects virtual and special roots", () => {
    expect(isWritablePath("/Applications")).toBe(false);
    expect(isWritablePath("/Music")).toBe(false);
    expect(isWritablePath("/Music/Artist")).toBe(false);
    expect(isWritablePath("/Videos")).toBe(false);
    expect(isWritablePath("/Sites")).toBe(false);
    expect(isWritablePath("/Sites/Folder")).toBe(false);
    expect(isWritablePath("/Trash")).toBe(false);
    expect(isWritablePath("/Desktop")).toBe(false);
    expect(isWritablePath("/Applets")).toBe(false);
    expect(isWritablePath("/Favorites")).toBe(false);
  });

  test("rejects non-absolute paths", () => {
    expect(isWritablePath("Documents")).toBe(false);
    expect(isWritablePath("")).toBe(false);
  });
});

describe("pathPolicy.isProtectedSystemPath", () => {
  test("protects all system roots and /", () => {
    for (const path of [
      "/",
      "/Applications",
      "/Documents",
      "/Downloads",
      "/Images",
      "/Books",
      "/Music",
      "/Videos",
      "/Sites",
      "/Applets",
      "/Trash",
      "/Desktop",
    ]) {
      expect(isProtectedSystemPath(path)).toBe(true);
    }
  });

  test("does not protect user roots or nested items", () => {
    expect(isProtectedSystemPath("/MyStuff")).toBe(false);
    expect(isProtectedSystemPath("/Documents/notes.md")).toBe(false);
    expect(isProtectedSystemPath("/Documents/Sub Folder")).toBe(false);
  });
});

describe("pathPolicy.validateNewRootFolderName", () => {
  test("accepts normal names", () => {
    expect(validateNewRootFolderName("My Stuff")).toEqual({ ok: true });
    expect(validateNewRootFolderName("Projects")).toEqual({ ok: true });
  });

  test("rejects empty and invalid names", () => {
    expect(validateNewRootFolderName("")).toEqual({
      ok: false,
      reason: "empty",
    });
    expect(validateNewRootFolderName("   ")).toEqual({
      ok: false,
      reason: "empty",
    });
    expect(validateNewRootFolderName("a/b")).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(validateNewRootFolderName(".")).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(validateNewRootFolderName("..")).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  test("rejects reserved system root names (case-insensitive)", () => {
    for (const name of [
      "Documents",
      "documents",
      "MUSIC",
      "Sites",
      "trash",
      "Desktop",
      "applets",
      "Downloads",
      "Favorites",
    ]) {
      expect(validateNewRootFolderName(name)).toEqual({
        ok: false,
        reason: "reserved",
      });
    }
  });
});

describe("pathPolicy.canPathHaveContent", () => {
  test("content allowed in writable + import-only subtrees", () => {
    expect(canPathHaveContent("/Documents/notes.md")).toBe(true);
    expect(canPathHaveContent("/MyStuff/photo.png")).toBe(true);
    expect(canPathHaveContent("/note.md")).toBe(true);
    expect(canPathHaveContent("/Downloads/pic.jpg")).toBe(true);
  });

  test("no content under virtual/special roots", () => {
    expect(canPathHaveContent("/Music/Artist/Song")).toBe(false);
    expect(canPathHaveContent("/Applications/Finder")).toBe(false);
    expect(canPathHaveContent("/Sites/link")).toBe(false);
    expect(canPathHaveContent("/Trash/old.md")).toBe(false);
    expect(canPathHaveContent("/Desktop/alias")).toBe(false);
    expect(canPathHaveContent("/")).toBe(false);
  });
});

describe("getStoreForFile routing", () => {
  test("fixed prefixes keep their stores", () => {
    expect(getStoreForFile("/Documents/pic.png")).toBe(STORES.DOCUMENTS);
    expect(getStoreForFile("/Images/notes.md")).toBe(STORES.IMAGES);
    expect(getStoreForFile("/Books/anything.epub")).toBe(STORES.BOOKS);
    expect(getStoreForFile("/Applets/thing.html")).toBe(STORES.APPLETS);
  });

  test("/Downloads routes by extension (unchanged)", () => {
    expect(getStoreForFile("/Downloads/pic.jpg")).toBe(STORES.IMAGES);
    expect(getStoreForFile("/Downloads/book.epub")).toBe(STORES.BOOKS);
    expect(getStoreForFile("/Downloads/page.html")).toBe(STORES.APPLETS);
    expect(getStoreForFile("/Downloads/notes.md")).toBe(STORES.DOCUMENTS);
  });

  test("user root folders route by extension", () => {
    expect(getStoreForFile("/MyStuff/photo.png")).toBe(STORES.IMAGES);
    expect(getStoreForFile("/MyStuff/book.epub")).toBe(STORES.BOOKS);
    expect(getStoreForFile("/MyStuff/widget.app")).toBe(STORES.APPLETS);
    expect(getStoreForFile("/MyStuff/notes.md")).toBe(STORES.DOCUMENTS);
    expect(getStoreForFile("/MyStuff/no-extension")).toBe(STORES.DOCUMENTS);
    expect(getStoreForFile("/MyStuff/Nested/Deep/pic.webp")).toBe(
      STORES.IMAGES
    );
  });

  test("root-level files route by extension", () => {
    expect(getStoreForFile("/note.md")).toBe(STORES.DOCUMENTS);
    expect(getStoreForFile("/photo.jpeg")).toBe(STORES.IMAGES);
  });

  test("type option can override when the path has no extension", () => {
    expect(getStoreForFile("/MyStuff/somefile", { type: "png" })).toBe(
      STORES.IMAGES
    );
    expect(getStoreForFile("/MyStuff/somefile", { type: "epub" })).toBe(
      STORES.BOOKS
    );
  });

  test("virtual/special subtrees have no content store", () => {
    expect(getStoreForFile("/Music/Artist/Song")).toBeNull();
    expect(getStoreForFile("/Videos/Clip")).toBeNull();
    expect(getStoreForFile("/Sites/link")).toBeNull();
    expect(getStoreForFile("/Applications/Finder")).toBeNull();
    expect(getStoreForFile("/Trash/old.md")).toBeNull();
    expect(getStoreForFile("/Desktop/alias.png")).toBeNull();
    expect(getStoreForFile("/")).toBeNull();
  });

  test("routing is deterministic from filename alone (sync-safe)", () => {
    // Receiving devices resolve the same store from path + name without the
    // original save-time type hint.
    const saveTime = getStoreForFile("/MyStuff/photo.png", {
      name: "photo.png",
      type: "png",
    });
    const readTime = getStoreForFile("/MyStuff/photo.png", {
      name: "photo.png",
    });
    expect(saveTime).toBe(readTime);
  });
});

describe("cloud sync domain resolution for custom paths", () => {
  test("custom-path files resolve to a syncable domain", () => {
    const store = getStoreForFile("/MyStuff/photo.png");
    expect(store).toBe(STORES.IMAGES);
    expect(getCloudSyncDomainForContentStore(store!)).toBe("images");
    expect(getCloudSyncDeletionBucketForContentStore(store!)).toBe(
      "fileImageKeys"
    );

    const docStore = getStoreForFile("/MyStuff/notes.md");
    expect(docStore).toBe(STORES.DOCUMENTS);
    expect(getCloudSyncDomainForContentStore(docStore!)).toBe("files");

    const bookStore = getStoreForFile("/MyStuff/book.epub");
    expect(bookStore).toBe(STORES.BOOKS);
    expect(getCloudSyncDomainForContentStore(bookStore!)).toBe("books");
    expect(getCloudSyncDeletionBucketForContentStore(bookStore!)).toBe(
      "fileBookKeys"
    );
  });
});
