import { describe, expect, test } from "bun:test";
import { insertTrackKeepingPlayback } from "../../../src/shared/media/libraryInsert";

describe("insertTrackKeepingPlayback", () => {
  test("prepends a new track and leaves the existing list in place", () => {
    const current = [{ id: "now" }, { id: "later" }];
    const next = insertTrackKeepingPlayback(current, { id: "queued" });
    expect(next.map((track) => track.id)).toEqual(["queued", "now", "later"]);
    expect(current.map((track) => track.id)).toEqual(["now", "later"]);
  });

  test("does not duplicate an id that is already in the library", () => {
    const current = [{ id: "now" }];
    const next = insertTrackKeepingPlayback(current, { id: "now" });
    expect(next).toEqual([{ id: "now" }]);
    expect(next).not.toBe(current);
  });
});
