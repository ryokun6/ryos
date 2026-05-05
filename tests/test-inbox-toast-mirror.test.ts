import { describe, expect, test } from "bun:test";
import { inferToastInboxMeta } from "@/lib/inbox/mirrorToastToInbox";

describe("inferToastInboxMeta", () => {
  test("groups iPod library strings under app:ipod", () => {
    const m = inferToastInboxMeta({
      method: "success",
      message: "Library updated",
      data: { description: "Your iPod library was synced." },
    });
    expect(m.stackGroupKey).toBe("app:ipod");
    expect(m.skip).toBe(false);
  });

  test("ryOS desktop toast prefers ryOS stack from title", () => {
    const m = inferToastInboxMeta({
      method: "info",
      message: "ryOS 1.2 for Mac is available",
      data: {},
    });
    expect(m.stackGroupKey).toBe("app:ryos");
  });
});
