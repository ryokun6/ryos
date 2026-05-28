import { describe, expect, test } from "bun:test";
import { withStreamChunkTimeout } from "../api/songs/_streamModels";

describe("withStreamChunkTimeout", () => {
  test("throws when source stalls between chunks", async () => {
    async function* slow() {
      yield "a";
      await new Promise((r) => setTimeout(r, 50));
    }

    const iter = withStreamChunkTimeout(slow(), 20, "Test stream");
    await expect(iter.next()).resolves.toEqual({ value: "a", done: false });
    await expect(iter.next()).rejects.toThrow("Test stream timed out waiting for data");
  });
});
