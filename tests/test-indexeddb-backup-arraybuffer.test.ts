import { describe, expect, test } from "bun:test";
import {
  deserializeStoreItem,
  serializeStoreItem,
  type IndexedDBStoreItemWithKey,
} from "../src/utils/indexedDBBackup";

describe("IndexedDB backup ArrayBuffer serialization", () => {
  test("preserves EPUB bytes through the cloud sync JSON boundary", async () => {
    const epubHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    const item: IndexedDBStoreItemWithKey = {
      key: "book-uuid",
      value: {
        name: "synced-book.epub",
        content: epubHeader.buffer,
      },
    };

    const serialized = await serializeStoreItem(item);
    const uploaded = JSON.parse(
      JSON.stringify(serialized)
    ) as IndexedDBStoreItemWithKey;
    const restored = deserializeStoreItem(uploaded);

    expect(typeof uploaded.value.content).toBe("string");
    expect(uploaded.value._isArrayBuffer_content).toBe(true);
    expect(restored.content).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(restored.content as ArrayBuffer))).toEqual(
      Array.from(epubHeader)
    );
    expect("_isArrayBuffer_content" in restored).toBe(false);
  });
});
