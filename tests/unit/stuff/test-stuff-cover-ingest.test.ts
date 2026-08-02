import { describe, expect, test } from "bun:test";
import "fake-indexeddb/auto";

import { STUFF_IMAGE_MAX_BYTES } from "../../../src/apps/stuff/utils/barcodeLookup";
import {
  clipboardMayContainImage,
  ensureStuffCoverFileType,
  extractClipboardImageUrl,
  extractImageUrlFromHtml,
  isAcceptableStuffCoverFile,
  isLikelyPlainImageUrl,
  looksLikeStuffCoverImage,
  mimeTypeFromFileName,
} from "../../../src/apps/stuff/utils/stuffCoverIngest";
import {
  getStuffCoverRecord,
  putStuffCoverBlob,
} from "../../../src/apps/stuff/utils/stuffCoverBlobs";
import {
  DB_NAME,
  ensureIndexedDBInitialized,
} from "../../../src/utils/indexedDB";

function makeFile(
  name: string,
  options: { type?: string; size?: number } = {}
): File {
  const size = options.size ?? 64;
  const bytes = new Uint8Array(size);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  return new File([bytes], name, {
    type: options.type ?? "",
  });
}

describe("stuff cover ingest helpers", () => {
  test("mimeTypeFromFileName maps jpg/jpeg/png/webp/gif", () => {
    expect(mimeTypeFromFileName("photo.JPG")).toBe("image/jpeg");
    expect(mimeTypeFromFileName("photo.jpeg")).toBe("image/jpeg");
    expect(mimeTypeFromFileName("shot.png")).toBe("image/png");
    expect(mimeTypeFromFileName("a.webp")).toBe("image/webp");
    expect(mimeTypeFromFileName("a.gif")).toBe("image/gif");
    expect(mimeTypeFromFileName("notes.txt")).toBeUndefined();
  });

  test("accepts JPG with empty MIME via extension fallback", () => {
    const emptyTypeJpg = makeFile("cover.jpg", { type: "", size: 1200 });
    expect(looksLikeStuffCoverImage(emptyTypeJpg)).toBe(true);
    expect(isAcceptableStuffCoverFile(emptyTypeJpg)).toBe(true);

    const normalized = ensureStuffCoverFileType(emptyTypeJpg);
    expect(normalized.type).toBe("image/jpeg");
    expect(isAcceptableStuffCoverFile(normalized)).toBe(true);
  });

  test("accepts image/jpeg MIME including oversized files (compressed later)", () => {
    expect(
      isAcceptableStuffCoverFile(
        makeFile("cover.jpg", { type: "image/jpeg", size: 2048 })
      )
    ).toBe(true);
    expect(
      isAcceptableStuffCoverFile(
        makeFile("huge.jpg", {
          type: "image/jpeg",
          size: STUFF_IMAGE_MAX_BYTES + 1,
        })
      )
    ).toBe(true);
    expect(
      isAcceptableStuffCoverFile(
        makeFile("notes.txt", { type: "text/plain", size: 100 })
      )
    ).toBe(false);
    expect(
      isAcceptableStuffCoverFile(
        makeFile("empty.jpg", { type: "image/jpeg", size: 0 })
      )
    ).toBe(false);
  });

  test("extracts img src from Chrome copy-image HTML", () => {
    const html =
      '<html><body><!--StartFragment--><img src="https://cdn.example.com/a/b.jpg?x=1"/><!--EndFragment--></body></html>';
    expect(extractImageUrlFromHtml(html)).toBe(
      "https://cdn.example.com/a/b.jpg?x=1"
    );
    expect(
      extractImageUrlFromHtml(
        `<img alt="x" src='data:image/png;base64,aaa'>`
      )
    ).toBe("data:image/png;base64,aaa");
  });

  test("extractClipboardImageUrl prefers HTML img then plain image URL", () => {
    const htmlData = {
      getData: (type: string) =>
        type === "text/html"
          ? `<img src="https://img.example/p.png">`
          : "https://ignored.example/other.png",
      types: ["text/html", "text/plain"],
      files: [] as unknown as FileList,
      items: [] as unknown as DataTransferItemList,
    } as DataTransfer;

    expect(extractClipboardImageUrl(htmlData)).toBe(
      "https://img.example/p.png"
    );
    expect(clipboardMayContainImage(htmlData)).toBe(true);

    const plainData = {
      getData: (type: string) =>
        type === "text/plain" ? "https://img.example/photo.jpeg" : "",
      types: ["text/plain"],
      files: [] as unknown as FileList,
      items: [] as unknown as DataTransferItemList,
    } as DataTransfer;

    expect(extractClipboardImageUrl(plainData)).toBe(
      "https://img.example/photo.jpeg"
    );
    expect(isLikelyPlainImageUrl("https://example.com/page")).toBe(false);
  });
});

describe("putStuffCoverBlob JPEG", () => {
  test("stores and reads a JPEG blob", async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      request.onblocked = () => resolve();
    });
    await ensureIndexedDBInitialized();

    const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], {
      type: "image/jpeg",
    });
    await putStuffCoverBlob("jpeg-cover", jpeg);
    const loaded = await getStuffCoverRecord("jpeg-cover");
    expect(loaded?.type).toBe("image/jpeg");
    expect(loaded?.content).toBeInstanceOf(Blob);
    expect(loaded?.content.size).toBe(4);
  });
});
