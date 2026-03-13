import { describe, expect, test } from "bun:test";
import {
  deserializeStorageItem,
  serializeStorageItem,
} from "../src/utils/storageSerialization";

describe("storage serialization helpers", () => {
  test("serializes and restores blob-backed store items", async () => {
    const originalBlob = new Blob(["hello from opfs"], { type: "text/plain" });
    const serialized = await serializeStorageItem({
      key: "document-1",
      value: {
        name: "document.txt",
        content: originalBlob,
        type: "text",
      },
    });

    expect(serialized.key).toBe("document-1");
    expect(serialized.value.name).toBe("document.txt");
    expect(serialized.value._isBlob_content).toBe(true);
    expect(typeof serialized.value.content).toBe("string");
    expect((serialized.value.content as string).startsWith("data:text/plain")).toBe(
      true
    );

    const restored = deserializeStorageItem(serialized);
    expect(restored.name).toBe("document.txt");
    expect(restored.type).toBe("text");
    expect(restored.content).toBeInstanceOf(Blob);
    expect(await (restored.content as Blob).text()).toBe("hello from opfs");
    expect(restored._isBlob_content).toBeUndefined();
  });

  test("preserves scalar-only values unchanged", async () => {
    const serialized = await serializeStorageItem({
      key: "settings-1",
      value: {
        name: "settings",
        content: "",
        version: 3,
      },
    });

    expect(serialized.value).toEqual({
      name: "settings",
      content: "",
      version: 3,
    });
    expect(deserializeStorageItem(serialized)).toEqual({
      name: "settings",
      content: "",
      version: 3,
    });
  });
});
