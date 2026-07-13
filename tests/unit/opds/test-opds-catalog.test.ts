import { describe, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import {
  parseOpdsBasicCredentials,
} from "../../../api/opds/_helpers/_auth";
import {
  buildOpdsBooksFromDocuments,
  extractEpubFromSyncBlob,
  normalizeOpdsBookId,
  renderOpdsFeed,
} from "../../../api/opds/_helpers/_catalog";

function basic(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function syncBlob(id: string, content: string): Uint8Array {
  return gzipSync(
    JSON.stringify({
      key: id,
      value: {
        name: `${id}.epub`,
        content,
        _isBlob_content: true,
      },
    }),
  );
}

describe("OPDS Basic auth parsing", () => {
  test("normalizes usernames and preserves colons in passwords", () => {
    expect(
      parseOpdsBasicCredentials(basic("Alice", "Password1:with:colons")),
    ).toEqual({
      username: "alice",
      password: "Password1:with:colons",
    });
  });

  test("rejects malformed and non-Basic authorization", () => {
    expect(parseOpdsBasicCredentials(null)).toBeNull();
    expect(parseOpdsBasicCredentials("Bearer token")).toBeNull();
    expect(parseOpdsBasicCredentials("Basic not-base64!")).toBeNull();
    expect(
      parseOpdsBasicCredentials(
        `Basic ${Buffer.from("alice:short").toString("base64")}`,
      ),
    ).toBeNull();
  });
});

describe("OPDS catalog rendering", () => {
  test("joins active top-level EPUB metadata to blob refs and keeps shelf order", () => {
    const files = {
      "files/item:/Books/New & <Good>.epub": {
        name: "New & <Good>.epub",
        uuid: "book-new",
        status: "active",
        isDirectory: false,
        modifiedAt: 200,
      },
      "files/item:/Books/Pinned.epub": {
        name: "Pinned.epub",
        uuid: "book-pinned",
        status: "active",
        isDirectory: false,
        modifiedAt: 100,
      },
      "files/item:/Books/Nested/Hidden.epub": {
        name: "Hidden.epub",
        uuid: "book-hidden",
        status: "active",
        isDirectory: false,
        modifiedAt: 300,
      },
      "files/item:/Books/Deleted.epub": {
        name: "Deleted.epub",
        uuid: "book-deleted",
        status: "trashed",
        isDirectory: false,
        modifiedAt: 400,
      },
    };
    const blobs = {
      "books/item:book-new": {
        blob: {
          url: "s3://bucket/sync/alice/blobs/new.gz",
          size: 12,
        },
      },
      "books/item:book-pinned": {
        blob: {
          url: "s3://bucket/sync/alice/blobs/pinned.gz",
          size: 10,
        },
      },
      "books/item:book-hidden": {
        blob: {
          url: "s3://bucket/sync/alice/blobs/hidden.gz",
          size: 14,
        },
      },
      "books/item:book-deleted": {
        blob: {
          url: "s3://bucket/sync/alice/blobs/deleted.gz",
          size: 15,
        },
      },
    };

    const books = buildOpdsBooksFromDocuments(files, blobs, {
      "bookshelf/order": {
        pinnedTop: ["/Books/Pinned.epub"],
        pinnedBottom: [],
      },
    });

    expect(books.map((book) => book.id)).toEqual([
      "book-pinned",
      "book-new",
    ]);

    const feed = renderOpdsFeed("alice", books);
    expect(feed).toContain("<title>New &amp; &lt;Good&gt;</title>");
    expect(feed).toContain(
      'rel="http://opds-spec.org/acquisition" href="books/book-new.epub" type="application/epub+zip"',
    );
    expect(feed.indexOf("<title>Pinned</title>")).toBeLessThan(
      feed.indexOf("<title>New &amp; &lt;Good&gt;</title>"),
    );
  });

  test("normalizes acquisition route ids", () => {
    expect(normalizeOpdsBookId("book-123.epub")).toBe("book-123");
    expect(normalizeOpdsBookId("book-123")).toBe("book-123");
    expect(normalizeOpdsBookId("../book.epub")).toBeNull();
  });
});

describe("OPDS EPUB extraction", () => {
  test("extracts an EPUB from the gzip sync envelope", () => {
    const epub = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    const dataUrl = `data:application/epub+zip;base64,${epub.toString("base64")}`;

    expect(
      Buffer.from(extractEpubFromSyncBlob(syncBlob("book-1", dataUrl), "book-1")),
    ).toEqual(epub);
  });

  test("rejects a blob for a different book id", () => {
    const epub = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1]);
    const dataUrl = `data:application/epub+zip;base64,${epub.toString("base64")}`;

    expect(() =>
      extractEpubFromSyncBlob(syncBlob("book-1", dataUrl), "book-2"),
    ).toThrow("Invalid serialized book");
  });
});
